import type { Pop, PriceSnapshot, Source } from '@/db/schema';
import { effectiveTier, priceForTier, type ConditionTier } from '@/lib/condition';
import { netOfFeesCents } from '@/lib/money';

/**
 * Turns a figure plus its latest price data into the one number that should be
 * shown for it — always at the tier matching its recorded condition, never a
 * blended or best-case figure.
 */

export type ValueSource = Source | null;

/**
 * Structural, not `Pop` — the public query layer returns rows that genuinely
 * lack the purchase fields, and valuation must work on those too.
 */
export type ValuableFields = Pick<
  Pop,
  'manualValueCents' | 'quantity' | 'condition' | 'hasBox' | 'boxCondition'
>;

export type Valuation = {
  tier: ConditionTier;
  /** Value for a single unit, in cents. Null when nothing can price it. */
  unitValueCents: number | null;
  /** unitValueCents * quantity. */
  totalValueCents: number | null;
  source: ValueSource;
  salesVolumeYearly: number | null;
  capturedAt: string | null;
  /** All three tiers from the latest quote, for the side-by-side display. */
  tiers: {
    loose: number | null;
    damaged_box: number | null;
    new: number | null;
  };
};

/**
 * Manual value wins outright. It is Aaron's own appraisal, and the spec is
 * explicit that it beats any API — so it is checked before any snapshot.
 */
export function valuePop(pop: ValuableFields, snapshot: PriceSnapshot | null): Valuation {
  const tier = effectiveTier(pop);

  const tiers = {
    loose: snapshot?.loosePriceCents ?? null,
    damaged_box: snapshot?.damagedBoxPriceCents ?? null,
    new: snapshot?.newPriceCents ?? null,
  };

  if (pop.manualValueCents !== null) {
    return {
      tier,
      unitValueCents: pop.manualValueCents,
      totalValueCents: pop.manualValueCents * pop.quantity,
      source: 'manual',
      salesVolumeYearly: null,
      capturedAt: null,
      tiers,
    };
  }

  const unit = snapshot ? priceForTier(snapshot, tier) : null;

  return {
    tier,
    unitValueCents: unit,
    totalValueCents: unit === null ? null : unit * pop.quantity,
    source: unit === null ? null : snapshot?.source ?? null,
    salesVolumeYearly: snapshot?.salesVolumeYearly ?? null,
    capturedAt: snapshot?.capturedAt ?? null,
    tiers,
  };
}

/**
 * Liquidity, derived from PriceCharting's yearly units sold.
 *
 * A figure priced at $40 that sells twice a year is not the same asset as one
 * priced at $40 that sells weekly, so this is surfaced next to every value
 * rather than buried.
 */
export function formatLiquidity(salesVolumeYearly: number | null): {
  label: string;
  tone: 'neutral' | 'warn';
} | null {
  if (salesVolumeYearly === null || !Number.isFinite(salesVolumeYearly)) return null;

  if (salesVolumeYearly >= 52) return { label: '~weekly sales', tone: 'neutral' };
  if (salesVolumeYearly >= 12) return { label: '~monthly sales', tone: 'neutral' };
  if (salesVolumeYearly >= 6) return { label: `${salesVolumeYearly}/yr`, tone: 'neutral' };
  return { label: `rarely trades · ${salesVolumeYearly}/yr`, tone: 'warn' };
}

export type PortfolioTotals = {
  itemCount: number;
  uniqueCount: number;
  costBasisCents: number;
  /** Only counts figures that actually have a value. */
  valueCents: number;
  unvaluedCount: number;
  /** Units that carry a value — the only ones that could actually be sold. */
  valuedItemCount: number;
  /** Cost basis of the valued subset, so gain/loss compares like with like. */
  comparableCostCents: number;
  gainCents: number;
  gainRatio: number | null;
  netIfSoldCents: number;
};

/**
 * Aggregates owned figures.
 *
 * Gain/loss deliberately compares value against the cost of the figures that
 * actually have a value. Including the cost of unpriced figures would report a
 * loss that is really just missing data.
 */
export function portfolioTotals(
  entries: ReadonlyArray<{
    pop: { quantity: number; purchasePriceCents?: number | null };
    valuation: Valuation;
  }>,
): PortfolioTotals {
  let itemCount = 0;
  let costBasisCents = 0;
  let valueCents = 0;
  let comparableCostCents = 0;
  let unvaluedCount = 0;
  let valuedItemCount = 0;

  for (const { pop, valuation } of entries) {
    itemCount += pop.quantity;
    const cost = (pop.purchasePriceCents ?? 0) * pop.quantity;
    costBasisCents += cost;

    if (valuation.totalValueCents === null) {
      unvaluedCount += 1;
      continue;
    }

    valueCents += valuation.totalValueCents;
    comparableCostCents += cost;
    valuedItemCount += pop.quantity;
  }

  const gainCents = valueCents - comparableCostCents;

  return {
    itemCount,
    uniqueCount: entries.length,
    costBasisCents,
    valueCents,
    unvaluedCount,
    valuedItemCount,
    comparableCostCents,
    gainCents,
    gainRatio: comparableCostCents > 0 ? gainCents / comparableCostCents : null,
    /*
     * Shipping is charged per *valued* unit, not per owned unit. You can only
     * sell what you can price, so deducting postage for unpriced figures
     * invents a cost — with nothing valued it produced a negative "if I sold
     * it all" figure, which is worse than useless.
     */
    netIfSoldCents: valuedItemCount === 0 ? 0 : netOfFeesCents(valueCents, valuedItemCount),
  };
}

export type FranchiseBreakdown = {
  franchise: string;
  count: number;
  valueCents: number;
  unvaluedCount: number;
};

export function franchiseBreakdown(
  entries: ReadonlyArray<{
    pop: { franchise: string | null; quantity: number };
    valuation: Valuation;
  }>,
): FranchiseBreakdown[] {
  const byFranchise = new Map<string, FranchiseBreakdown>();

  for (const { pop, valuation } of entries) {
    const key = pop.franchise ?? 'Unattributed';
    const row = byFranchise.get(key) ?? {
      franchise: key,
      count: 0,
      valueCents: 0,
      unvaluedCount: 0,
    };

    row.count += pop.quantity;
    if (valuation.totalValueCents === null) row.unvaluedCount += 1;
    else row.valueCents += valuation.totalValueCents;

    byFranchise.set(key, row);
  }

  return [...byFranchise.values()].sort(
    (a, b) => b.valueCents - a.valueCents || b.count - a.count,
  );
}
