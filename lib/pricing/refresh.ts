import { eq, max, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  cronRuns,
  pops,
  priceSnapshots,
  type MatchStatus,
  type NewPriceSnapshot,
  type Pop,
} from '@/db/schema';
import type {
  MatchCandidate,
  MatchEvidence,
  Quote,
  QuotableFields,
  SampleInfo,
} from '@/lib/pricing/provider';
import { createProviders, type Providers } from '@/lib/pricing/registry';

/**
 * Orchestration for price refreshes — the weekly cron and the "refresh now"
 * buttons run through exactly this code.
 *
 * Design points worth keeping:
 *
 * - **Resumable by query, not by cursor.** Which figures to refresh is derived
 *   from "has no recent snapshot", so a run that dies halfway simply picks up
 *   where it left off next time with no stored state to go stale.
 * - **One figure failing never stops the run.** Each is wrapped, logged, and
 *   counted; the run finishes `partial` rather than throwing.
 * - **Sequential with a delay.** This is 23 figures once a week, not a scrape.
 *   Politeness costs nothing here and hammering a paid API is how tokens get
 *   revoked.
 */

/** A figure is due for a refresh once its newest snapshot is this old. */
export const DEFAULT_STALE_AFTER_DAYS = 6;

/** Cap per invocation, so a huge collection can never blow the function timeout. */
export const DEFAULT_LIMIT = 40;

/** Pause between figures. */
export const DEFAULT_DELAY_MS = 400;

export type RefreshCandidate = Pick<
  Pop,
  'id' | 'name' | 'status' | 'matchStatus' | 'upc' | 'priceChartingId'
> & {
  /** ISO timestamp of the newest PriceCharting snapshot, or null if never priced. */
  lastPricedAt: string | null;
};

export type SelectOptions = {
  now: Date;
  staleAfterDays?: number;
  limit?: number;
  /** Ignore staleness — what the manual "refresh now" button uses. */
  force?: boolean;
  /** Restrict to specific figures, still subject to the rules below. */
  ids?: string[];
};

/**
 * Decides which figures are worth spending an API call on.
 *
 * Pure and separately tested: this is the part that decides whether the weekly
 * cron does useful work or burns the quota re-asking questions it already has
 * answers to.
 */
export function selectPopsToRefresh(
  candidates: readonly RefreshCandidate[],
  options: SelectOptions,
): RefreshCandidate[] {
  const staleAfterDays = options.staleAfterDays ?? DEFAULT_STALE_AFTER_DAYS;
  const limit = options.limit ?? DEFAULT_LIMIT;
  const cutoffMs = options.now.getTime() - staleAfterDays * 24 * 60 * 60 * 1000;
  const wanted = options.ids ? new Set(options.ids) : null;

  const due = candidates.filter((candidate) => {
    if (wanted && !wanted.has(candidate.id)) return false;

    // Sold figures are history. Pricing them spends calls on nothing.
    if (candidate.status === 'sold') return false;

    /*
     * A figure already in the review queue, or one whose match was rejected,
     * has nothing new to learn from another text search — it would return the
     * same candidates and overwrite the queue entry. Unless, that is, someone
     * has since given it a UPC or confirmed an id, which changes the answer.
     */
    const identified = Boolean(candidate.upc ?? candidate.priceChartingId);
    if (!identified && (candidate.matchStatus === 'pending_review' || candidate.matchStatus === 'rejected')) {
      return false;
    }

    if (options.force) return true;
    if (candidate.lastPricedAt === null) return true;

    return Date.parse(candidate.lastPricedAt) < cutoffMs;
  });

  /*
   * Never-priced figures first, then the longest-stale. If the limit truncates
   * the run, the figures with no data at all are the ones that got served.
   */
  due.sort((a, b) => {
    if (a.lastPricedAt === null && b.lastPricedAt === null) return a.name.localeCompare(b.name);
    if (a.lastPricedAt === null) return -1;
    if (b.lastPricedAt === null) return 1;
    return a.lastPricedAt.localeCompare(b.lastPricedAt);
  });

  return due.slice(0, limit);
}

export type RefreshOutcome = {
  popId: string;
  name: string;
  priced: boolean;
  matchStatus: MatchStatus | null;
  message: string;
  tone: 'ok' | 'warn' | 'error';
};

/**
 * Refreshes one figure. Returns an outcome rather than throwing — including
 * when the API is down, which is a "no data" result, not a failure of the app.
 */
export async function refreshOnePop(
  pop: Pop,
  providers: Providers,
): Promise<RefreshOutcome> {
  const quotable = toQuotable(pop);

  const result = await providers.priceCharting.fetchQuote(quotable);

  let priced = false;
  let matchStatus: MatchStatus | null = null;
  let message: string;
  let tone: RefreshOutcome['tone'];

  if (!result.ok) {
    message = result.error;
    tone = result.retryable ? 'warn' : 'error';
  } else {
    if (result.match) {
      await applyMatch(pop.id, result.match);
      matchStatus = result.match.status;
    }

    if (result.quote) {
      await writeSnapshot(pop.id, result.quote);
      priced = true;
      message = result.match?.note ?? 'Priced.';
      tone = 'ok';
    } else {
      message = result.match?.note ?? 'PriceCharting has no prices for this figure yet.';
      tone = 'warn';
    }
  }

  /*
   * eBay runs regardless of what PriceCharting said — it is most useful
   * precisely for the figures PriceCharting cannot price. It never changes the
   * match state and never produces a value.
   */
  if (providers.ebay.isConfigured()) {
    try {
      const ebay = await providers.ebay.fetchQuote(quotable);
      if (ebay.ok && ebay.quote) await writeSnapshot(pop.id, ebay.quote);
    } catch (error: unknown) {
      console.error(`[refresh] eBay lookup threw for ${pop.id}:`, error);
    }
  }

  return { popId: pop.id, name: pop.name, priced, matchStatus, message, tone };
}

export type RefreshRunResult = {
  runId: string | null;
  processed: number;
  failed: number;
  priced: number;
  skipped: number;
  outcomes: RefreshOutcome[];
  status: 'completed' | 'partial' | 'failed';
  /** Set when no provider is configured, so callers can say so plainly. */
  disabled?: string;
};

export type RefreshRunOptions = SelectOptions & {
  delayMs?: number;
  trigger: 'cron' | 'manual';
  /** Log the run to `cron_runs`. One-off single-figure refreshes do not. */
  record?: boolean;
  providers?: Providers;
};

export async function refreshPops(options: RefreshRunOptions): Promise<RefreshRunResult> {
  const providers = options.providers ?? createProviders();

  if (!providers.priceCharting.isConfigured()) {
    return {
      runId: null,
      processed: 0,
      failed: 0,
      priced: 0,
      skipped: 0,
      outcomes: [],
      status: 'completed',
      disabled:
        'No PRICECHARTING_API_TOKEN is set, so there is nothing to refresh. Manual values still work.',
    };
  }

  const candidates = await loadRefreshCandidates();
  const due = selectPopsToRefresh(candidates, options);
  const skipped = candidates.length - due.length;

  const shouldRecord = options.record ?? true;
  const runId = shouldRecord ? await startRun() : null;

  const outcomes: RefreshOutcome[] = [];
  let failed = 0;
  const delayMs = options.delayMs ?? DEFAULT_DELAY_MS;

  for (const [index, candidate] of due.entries()) {
    if (index > 0 && delayMs > 0) await sleep(delayMs);

    try {
      const row = await db.select().from(pops).where(eq(pops.id, candidate.id)).limit(1);
      const pop = row[0];
      if (!pop) continue;

      const outcome = await refreshOnePop(pop, providers);
      outcomes.push(outcome);
      if (outcome.tone === 'error') failed += 1;
    } catch (error: unknown) {
      // One bad figure must never take the run down with it.
      failed += 1;
      const message = error instanceof Error ? error.message : 'Unknown error.';
      console.error(`[refresh] ${candidate.id} (${candidate.name}) threw:`, error);
      outcomes.push({
        popId: candidate.id,
        name: candidate.name,
        priced: false,
        matchStatus: null,
        message,
        tone: 'error',
      });
    }
  }

  const priced = outcomes.filter((outcome) => outcome.priced).length;
  const status: RefreshRunResult['status'] =
    failed === 0 ? 'completed' : failed === outcomes.length && failed > 0 ? 'failed' : 'partial';

  if (runId) {
    await finishRun(runId, {
      status,
      processed: outcomes.length,
      failed,
      notes: `${options.trigger}: ${priced} priced, ${failed} failed, ${skipped} skipped as fresh or unresolvable.`,
    });
  }

  return {
    runId,
    processed: outcomes.length,
    failed,
    priced,
    skipped,
    outcomes,
    status,
  };
}

/** Every figure plus the age of its newest PriceCharting snapshot, in one query. */
export async function loadRefreshCandidates(): Promise<RefreshCandidate[]> {
  const latest = db
    .select({
      popId: priceSnapshots.popId,
      lastPricedAt: max(priceSnapshots.capturedAt).as('last_priced_at'),
    })
    .from(priceSnapshots)
    .where(eq(priceSnapshots.source, 'pricecharting'))
    .groupBy(priceSnapshots.popId)
    .as('latest');

  const rows = await db
    .select({
      id: pops.id,
      name: pops.name,
      status: pops.status,
      matchStatus: pops.matchStatus,
      upc: pops.upc,
      priceChartingId: pops.priceChartingId,
      lastPricedAt: latest.lastPricedAt,
    })
    .from(pops)
    .leftJoin(latest, eq(latest.popId, pops.id));

  return rows.map((row) => ({ ...row, lastPricedAt: row.lastPricedAt ?? null }));
}

/**
 * Persists what a provider learned about which catalogue entry this is.
 *
 * The provider is the authority here, so nulls overwrite: when a stored id
 * turns out to point at a video game, clearing it is the whole point.
 */
async function applyMatch(popId: string, match: MatchEvidence): Promise<void> {
  await db
    .update(pops)
    .set({
      matchStatus: match.status,
      priceChartingId: match.priceChartingId,
      priceChartingConsole: match.priceChartingConsole,
      ebayEpid: match.ebayEpid,
      matchCandidates: match.candidates ? JSON.stringify(match.candidates) : null,
      matchNote: match.note,
    })
    .where(eq(pops.id, popId));
}

async function writeSnapshot(popId: string, quote: Quote): Promise<void> {
  const row: NewPriceSnapshot = {
    popId,
    source: quote.source,
    loosePriceCents: quote.prices.loose ?? null,
    damagedBoxPriceCents: quote.prices.damaged_box ?? null,
    newPriceCents: quote.prices.new ?? null,
    /*
     * Only PriceCharting reports yearly units sold. eBay's sample size is a
     * count of live listings, which is a different thing entirely and stays
     * out of this column rather than being quietly relabelled.
     */
    salesVolumeYearly: quote.sample?.salesVolumeYearly ?? null,
    capturedAt: quote.capturedAt,
    rawJson: JSON.stringify({ sample: quote.sample ?? null, raw: quote.raw ?? null }),
  };

  await db.insert(priceSnapshots).values(row);
}

async function startRun(): Promise<string> {
  const [run] = await db
    .insert(cronRuns)
    .values({ startedAt: new Date().toISOString(), status: 'running' })
    .returning({ id: cronRuns.id });
  return run.id;
}

async function finishRun(
  runId: string,
  update: { status: 'completed' | 'partial' | 'failed'; processed: number; failed: number; notes: string },
): Promise<void> {
  await db
    .update(cronRuns)
    .set({
      finishedAt: new Date().toISOString(),
      status: update.status,
      popsProcessed: update.processed,
      popsFailed: update.failed,
      notes: update.notes,
    })
    .where(eq(cronRuns.id, runId));
}

function toQuotable(pop: Pop): QuotableFields {
  return {
    id: pop.id,
    name: pop.name,
    line: pop.line,
    franchise: pop.franchise,
    itemNumber: pop.itemNumber,
    upc: pop.upc,
    priceChartingId: pop.priceChartingId,
    searchOverride: pop.searchOverride,
    matchStatus: pop.matchStatus,
    condition: pop.condition,
    hasBox: pop.hasBox,
    boxCondition: pop.boxCondition,
    manualValueCents: pop.manualValueCents,
    quantity: pop.quantity,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Count of figures waiting on a human decision — the review-queue badge.
 */
export async function countPendingReview(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(pops)
    .where(eq(pops.matchStatus, 'pending_review'));
  return row?.count ?? 0;
}

export async function listPendingReview(): Promise<Pop[]> {
  return db.select().from(pops).where(eq(pops.matchStatus, 'pending_review'));
}

/**
 * The candidate list a text search stored, read back defensively — it is JSON
 * in a TEXT column, so it is treated as untrusted until it parses.
 */
export function parseMatchCandidates(json: string | null): MatchCandidate[] {
  if (!json) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const candidates: MatchCandidate[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.name !== 'string') continue;
    candidates.push({
      id: record.id,
      name: record.name,
      console: typeof record.console === 'string' ? record.console : '',
    });
  }
  return candidates;
}

/** Sample metadata stashed alongside a snapshot's raw payload. */
export function parseSnapshotSample(json: string | null): SampleInfo | null {
  if (!json) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  const sample = (parsed as { sample?: unknown }).sample;
  if (!sample || typeof sample !== 'object') return null;

  return sample as SampleInfo;
}
