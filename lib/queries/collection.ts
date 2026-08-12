import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { pops, priceSnapshots, type Pop, type PriceSnapshot } from '@/db/schema';
import { effectiveTier, priceForTier, type ConditionTier } from '@/lib/condition';
import { valuePop, type Valuation } from '@/lib/valuation';

/**
 * THE privacy boundary.
 *
 * When the gallery is being read logged-out, the private columns are not
 * selected at all — they never enter the result set, never reach a Server
 * Component, and therefore never reach the RSC payload. This is deliberately
 * not a matter of hiding fields in the UI: cost basis must be absent from the
 * bytes on the wire, not merely invisible in them.
 */

/** Everything safe to show a logged-out visitor. */
const publicColumns = {
  id: pops.id,
  name: pops.name,
  line: pops.line,
  franchise: pops.franchise,
  itemNumber: pops.itemNumber,
  upc: pops.upc,
  priceChartingId: pops.priceChartingId,
  matchStatus: pops.matchStatus,
  needsDisambiguation: pops.needsDisambiguation,
  variant: pops.variant,
  exclusiveTo: pops.exclusiveTo,
  releaseYear: pops.releaseYear,
  isVaulted: pops.isVaulted,
  condition: pops.condition,
  hasBox: pops.hasBox,
  boxCondition: pops.boxCondition,
  hasProtector: pops.hasProtector,
  quantity: pops.quantity,
  status: pops.status,
  manualValueCents: pops.manualValueCents,
  imageUrl: pops.imageUrl,
  catalogImageUrl: pops.catalogImageUrl,
  notes: pops.notes,
  createdAt: pops.createdAt,
  updatedAt: pops.updatedAt,
} as const;

/** Added only for an authenticated reader. */
const privateColumns = {
  ...publicColumns,
  /*
   * Match plumbing is admin-only. Not because a catalogue id is a secret, but
   * because the public gallery has no use for it and the smallest payload that
   * does the job is the one least likely to leak something later.
   */
  priceChartingConsole: pops.priceChartingConsole,
  matchCandidates: pops.matchCandidates,
  matchNote: pops.matchNote,
  acquiredAs: pops.acquiredAs,
  purchasePriceCents: pops.purchasePriceCents,
  purchaseDate: pops.purchaseDate,
  purchaseSource: pops.purchaseSource,
  soldPriceCents: pops.soldPriceCents,
  soldDate: pops.soldDate,
  searchOverride: pops.searchOverride,
} as const;

/**
 * Stated explicitly rather than derived from the column maps: these two types
 * are the privacy contract, so they should be readable at a glance and should
 * fail loudly if a private field is ever added to the public set.
 */
export type PublicPop = Pick<
  Pop,
  | 'id'
  | 'name'
  | 'line'
  | 'franchise'
  | 'itemNumber'
  | 'upc'
  | 'priceChartingId'
  | 'matchStatus'
  | 'needsDisambiguation'
  | 'variant'
  | 'exclusiveTo'
  | 'releaseYear'
  | 'isVaulted'
  | 'condition'
  | 'hasBox'
  | 'boxCondition'
  | 'hasProtector'
  | 'quantity'
  | 'status'
  | 'manualValueCents'
  | 'imageUrl'
  | 'catalogImageUrl'
  | 'notes'
  | 'createdAt'
  | 'updatedAt'
>;

export type PrivatePop = PublicPop &
  Pick<
    Pop,
    | 'priceChartingConsole'
    | 'matchCandidates'
    | 'matchNote'
    | 'acquiredAs'
    | 'purchasePriceCents'
    | 'purchaseDate'
    | 'purchaseSource'
    | 'soldPriceCents'
    | 'soldDate'
    | 'searchOverride'
  >;

export type Gain = { gainCents: number; gainRatio: number | null } | null;

export type CollectionEntry = {
  pop: PublicPop | PrivatePop;
  valuation: Valuation;
  /** Null whenever cost basis is unknown or withheld. */
  gain: Gain;
};

export type PrivateCollectionEntry = CollectionEntry & { pop: PrivatePop };

/**
 * Latest snapshot per (pop, source) via a window function, so a collection of
 * any size costs one query rather than N.
 */
async function latestSnapshotsByPop(): Promise<Map<string, PriceSnapshot>> {
  const ranked = getDb().$with('ranked').as(
    getDb()
      .select({
        id: priceSnapshots.id,
        popId: priceSnapshots.popId,
        source: priceSnapshots.source,
        loosePriceCents: priceSnapshots.loosePriceCents,
        damagedBoxPriceCents: priceSnapshots.damagedBoxPriceCents,
        newPriceCents: priceSnapshots.newPriceCents,
        salesVolumeYearly: priceSnapshots.salesVolumeYearly,
        currency: priceSnapshots.currency,
        capturedAt: priceSnapshots.capturedAt,
        rawJson: priceSnapshots.rawJson,
        rowNumber:
          sql<number>`row_number() over (partition by ${priceSnapshots.popId} order by ${priceSnapshots.capturedAt} desc)`.as(
            'row_number',
          ),
      })
      .from(priceSnapshots)
      // eBay is an asking-price cross-check, never a value — excluded here.
      .where(eq(priceSnapshots.source, 'pricecharting')),
  );

  const rows = await getDb()
    .with(ranked)
    .select()
    .from(ranked)
    .where(eq(ranked.rowNumber, 1));

  const byPop = new Map<string, PriceSnapshot>();
  for (const row of rows) {
    const snapshot: PriceSnapshot = {
      id: row.id,
      popId: row.popId,
      source: row.source,
      loosePriceCents: row.loosePriceCents,
      damagedBoxPriceCents: row.damagedBoxPriceCents,
      newPriceCents: row.newPriceCents,
      salesVolumeYearly: row.salesVolumeYearly,
      currency: row.currency,
      capturedAt: row.capturedAt,
      rawJson: row.rawJson,
    };
    byPop.set(row.popId, snapshot);
  }
  return byPop;
}

export async function getCollection(options: {
  includePrivate: boolean;
}): Promise<CollectionEntry[]> {
  const [rows, snapshots] = await Promise.all([
    options.includePrivate
      ? (getDb().select(privateColumns).from(pops).orderBy(desc(pops.createdAt)) as Promise<
          Array<PublicPop | PrivatePop>
        >)
      : (getDb().select(publicColumns).from(pops).orderBy(desc(pops.createdAt)) as Promise<
          Array<PublicPop | PrivatePop>
        >),
    latestSnapshotsByPop(),
  ]);

  return rows.map((pop) => {
    const valuation = valuePop(pop, snapshots.get(pop.id) ?? null);
    return { pop, valuation, gain: computeGain(pop, valuation) };
  });
}

export async function getPopEntry(
  id: string,
  options: { includePrivate: boolean },
): Promise<{ entry: CollectionEntry; snapshots: PriceSnapshot[] } | null> {
  const rows: Array<PublicPop | PrivatePop> = options.includePrivate
    ? await getDb().select(privateColumns).from(pops).where(eq(pops.id, id)).limit(1)
    : await getDb().select(publicColumns).from(pops).where(eq(pops.id, id)).limit(1);

  const [row] = rows;

  if (!row) return null;

  const history = await getDb()
    .select()
    .from(priceSnapshots)
    .where(eq(priceSnapshots.popId, id))
    .orderBy(desc(priceSnapshots.capturedAt));

  const latest = history.find((snapshot) => snapshot.source === 'pricecharting') ?? null;
  const valuation = valuePop(row, latest);

  return {
    entry: { pop: row, valuation, gain: computeGain(row, valuation) },
    snapshots: history,
  };
}

function computeGain(pop: PublicPop | PrivatePop, valuation: Valuation): Gain {
  if (!('purchasePriceCents' in pop)) return null;

  const cost = pop.purchasePriceCents;
  if (cost === null || cost === undefined) return null;
  if (valuation.totalValueCents === null) return null;

  const basis = cost * pop.quantity;
  const gainCents = valuation.totalValueCents - basis;

  return { gainCents, gainRatio: basis > 0 ? gainCents / basis : null };
}

export function isPrivateEntry(entry: CollectionEntry): entry is PrivateCollectionEntry {
  return 'purchasePriceCents' in entry.pop;
}

/**
 * Flattens an entry into the shape the gallery client component receives.
 *
 * The private keys are only spread in when the entry actually carries them, so
 * the serialized RSC payload for a logged-out reader contains no cost-basis
 * key at all — not a null, not an undefined, absent.
 */
export function toGalleryItem(entry: CollectionEntry) {
  const { pop, valuation, gain } = entry;

  const base = {
    id: pop.id,
    name: pop.name,
    line: pop.line,
    franchise: pop.franchise,
    itemNumber: pop.itemNumber,
    upc: pop.upc,
    variant: pop.variant,
    exclusiveTo: pop.exclusiveTo,
    condition: pop.condition,
    hasBox: pop.hasBox,
    boxCondition: pop.boxCondition,
    status: pop.status,
    quantity: pop.quantity,
    imageUrl: pop.imageUrl,
    needsDisambiguation: pop.needsDisambiguation,
    createdAt: pop.createdAt,
    tier: valuation.tier,
    valueCents: valuation.totalValueCents,
    valueSource: valuation.source,
    salesVolumeYearly: valuation.salesVolumeYearly,
  };

  if (!isPrivateEntry(entry)) return base;

  return {
    ...base,
    purchasePriceCents: entry.pop.purchasePriceCents,
    gainCents: gain?.gainCents ?? null,
    gainRatio: gain?.gainRatio ?? null,
  };
}

/**
 * Collection value over time, assembled from the snapshots we have accumulated
 * ourselves — PriceCharting serves no history, so every point here is one this
 * app recorded. The series is empty until the weekly refresh has run.
 */
export async function getValueHistory(): Promise<
  Array<{ date: string; valueCents: number; pricedCount: number }>
> {
  const [allPops, snapshots] = await Promise.all([
    getDb()
      .select({
        id: pops.id,
        quantity: pops.quantity,
        condition: pops.condition,
        hasBox: pops.hasBox,
        boxCondition: pops.boxCondition,
        manualValueCents: pops.manualValueCents,
        status: pops.status,
      })
      .from(pops),
    getDb()
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.source, 'pricecharting'))
      .orderBy(priceSnapshots.capturedAt),
  ]);

  if (snapshots.length === 0) return [];

  const owned = allPops.filter((pop) => pop.status === 'owned');
  const byPop = new Map<string, PriceSnapshot[]>();
  for (const snapshot of snapshots) {
    const list = byPop.get(snapshot.popId) ?? [];
    list.push(snapshot);
    byPop.set(snapshot.popId, list);
  }

  const dates = [...new Set(snapshots.map((s) => s.capturedAt.slice(0, 10)))].sort();

  return dates.map((date) => {
    let valueCents = 0;
    let pricedCount = 0;

    for (const pop of owned) {
      // The most recent snapshot at or before this date.
      const history = byPop.get(pop.id) ?? [];
      let latest: PriceSnapshot | null = null;
      for (const snapshot of history) {
        if (snapshot.capturedAt.slice(0, 10) <= date) latest = snapshot;
        else break;
      }

      const valuation = valuePop(pop, latest);
      if (valuation.totalValueCents !== null) {
        valueCents += valuation.totalValueCents;
        pricedCount += 1;
      }
    }

    return { date, valueCents, pricedCount };
  });
}

export type Mover = {
  id: string;
  name: string;
  imageUrl: string | null;
  tier: ConditionTier;
  previousCents: number;
  currentCents: number;
  changeCents: number;
  changeRatio: number | null;
  from: string;
  to: string;
};

/**
 * What actually moved between the last two snapshots.
 *
 * Compared at each figure's own tier, so a figure whose mint-in-box price
 * doubled does not show up as a windfall when the one you own is loose.
 *
 * Manually-valued figures are excluded: your appraisal overrides the market, so
 * a market move genuinely does not change what this dashboard says they are
 * worth, and listing them as movers would be showing a change that isn't there.
 *
 * Public-safe — a market price movement is not cost basis.
 */
export async function getBiggestMovers(limit = 6): Promise<Mover[]> {
  const [allPops, snapshots] = await Promise.all([
    getDb()
      .select({
        id: pops.id,
        name: pops.name,
        imageUrl: pops.imageUrl,
        quantity: pops.quantity,
        condition: pops.condition,
        hasBox: pops.hasBox,
        boxCondition: pops.boxCondition,
        manualValueCents: pops.manualValueCents,
        status: pops.status,
      })
      .from(pops)
      .where(eq(pops.status, 'owned')),
    getDb()
      .select()
      .from(priceSnapshots)
      .where(eq(priceSnapshots.source, 'pricecharting'))
      .orderBy(priceSnapshots.capturedAt),
  ]);

  const byPop = new Map<string, PriceSnapshot[]>();
  for (const snapshot of snapshots) {
    const list = byPop.get(snapshot.popId) ?? [];
    list.push(snapshot);
    byPop.set(snapshot.popId, list);
  }

  const movers: Mover[] = [];

  for (const pop of allPops) {
    if (pop.manualValueCents !== null) continue;

    const history = byPop.get(pop.id) ?? [];
    if (history.length < 2) continue;

    const current = history[history.length - 1];
    const previous = history[history.length - 2];

    const tier = effectiveTier(pop);
    const currentCents = priceForTier(current, tier);
    const previousCents = priceForTier(previous, tier);

    // A tier that gained or lost data is not a price movement.
    if (currentCents === null || previousCents === null) continue;

    const changeCents = (currentCents - previousCents) * pop.quantity;
    if (changeCents === 0) continue;

    movers.push({
      id: pop.id,
      name: pop.name,
      imageUrl: pop.imageUrl,
      tier,
      previousCents: previousCents * pop.quantity,
      currentCents: currentCents * pop.quantity,
      changeCents,
      changeRatio: previousCents > 0 ? (currentCents - previousCents) / previousCents : null,
      from: previous.capturedAt,
      to: current.capturedAt,
    });
  }

  return movers
    .sort((a, b) => Math.abs(b.changeCents) - Math.abs(a.changeCents))
    .slice(0, limit);
}

/**
 * One figure's value over time, at its own tier — the series behind the chart
 * on the detail page.
 */
export function popValueSeries(
  pop: Pick<Pop, 'condition' | 'hasBox' | 'boxCondition' | 'quantity'>,
  snapshots: readonly PriceSnapshot[],
): Array<{ date: string; valueCents: number }> {
  const tier = effectiveTier(pop);

  return snapshots
    .filter((snapshot) => snapshot.source === 'pricecharting')
    .slice()
    .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    .map((snapshot) => ({ date: snapshot.capturedAt, price: priceForTier(snapshot, tier) }))
    .filter((point): point is { date: string; price: number } => point.price !== null)
    .map((point) => ({
      date: point.date.slice(0, 10),
      valueCents: point.price * pop.quantity,
    }));
}
