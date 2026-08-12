import type { MatchStatus, Pop, Source } from '@/db/schema';
import type { ConditionTier } from '@/lib/condition';

/**
 * The contract every pricing source implements.
 *
 * Two rules hold across all of them:
 *
 * 1. `fetchQuote` never throws. Every external call is wrapped, and a dead API
 *    comes back as `{ ok: false }` — which the caller renders as "no data", not
 *    a 500. The app has to keep working on manual values alone.
 * 2. A quote carries all three tiers it knows about, never a single blended
 *    "value". Choosing which tier applies is the caller's job, because only the
 *    caller knows the figure's recorded condition.
 */

/** Integer cents, keyed by tier. A missing key means that tier has no data. */
export type TierPrices = Partial<Record<ConditionTier, number>>;

/**
 * How many observations stand behind a quote, and what they actually are.
 * Shown next to every value: a $40 figure that sells twice a year is not the
 * same asset as a $40 figure that sells weekly.
 */
export type SampleInfo = {
  /** PriceCharting `sales-volume`: units sold in the last year. */
  salesVolumeYearly?: number;
  /** Live listings a trimmed asking price was computed from, per tier. */
  listingCounts?: Partial<Record<ConditionTier, number>>;
};

export type Quote = {
  prices: TierPrices;
  source: Source;
  /** ISO 8601. */
  capturedAt: string;
  sample?: SampleInfo;
  /**
   * True when these numbers are what sellers are *asking*, not what anything
   * sold for. Carried on the quote so no render path can forget to label it.
   */
  askingPriceOnly: boolean;
  raw?: unknown;
};

export type MatchCandidate = {
  id: string;
  name: string;
  console: string;
};

/**
 * What a provider learned about *which* catalogue entry this figure is.
 * Separate from the quote because a search can identify candidates without
 * producing any price at all — that is exactly the review-queue case.
 */
export type MatchEvidence = {
  status: MatchStatus;
  priceChartingId: string | null;
  priceChartingConsole: string | null;
  ebayEpid: string | null;
  /**
   * The UPC the catalogue holds for this product, when it has one. Lets a
   * confirmed match backfill the barcode instead of you reading it off a box.
   */
  upc: string | null;
  candidates: MatchCandidate[] | null;
  /** Human-readable reason, surfaced in the admin review queue. */
  note: string;
};

export type ProviderResult =
  | { ok: true; quote: Quote | null; match?: MatchEvidence }
  | { ok: false; error: string; retryable: boolean; match?: MatchEvidence };

/**
 * Structural rather than the full `Pop` row, so providers can be exercised in
 * tests with a handful of fields instead of a database fixture.
 */
export type QuotableFields = Pick<
  Pop,
  | 'id'
  | 'name'
  | 'line'
  | 'franchise'
  | 'itemNumber'
  | 'upc'
  | 'priceChartingId'
  | 'searchOverride'
  | 'matchStatus'
  | 'condition'
  | 'hasBox'
  | 'boxCondition'
  | 'manualValueCents'
  | 'quantity'
>;

export interface PriceProvider {
  readonly id: Source;
  readonly label: string;
  /**
   * False when the credentials this provider needs are absent. The app checks
   * this rather than discovering the problem through a failed request, so a
   * deployment with no API keys shows "not configured" instead of errors.
   */
  isConfigured(): boolean;
  fetchQuote(pop: QuotableFields): Promise<ProviderResult>;
}

/** Injected so tests drive providers against fixtures rather than the network. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<Response>;

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The single place an outbound pricing request is made. Everything a remote
 * call can do wrong — network failure, timeout, non-2xx, non-JSON body —
 * becomes a typed result here, so no provider has to remember to try/catch.
 */
export async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: true; body: unknown } | { ok: false; error: string; retryable: boolean }> {
  let response: Response;

  try {
    response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown error';
    // Network failures and timeouts are transient by nature — worth retrying.
    return { ok: false, error: `Request failed: ${message}`, retryable: true };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `HTTP ${response.status} ${response.statusText}`.trim(),
      retryable: isRetryableStatus(response.status),
    };
  }

  try {
    return { ok: true, body: await response.json() };
  } catch {
    return { ok: false, error: 'Response was not valid JSON.', retryable: false };
  }
}

/**
 * A 401 will still be a 401 next week; a 503 probably will not. Only the second
 * kind is worth coming back to.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * PriceCharting reports prices as integer pennies, and reports "we have no
 * price" as either an absent field or a zero. Zero is never a real Funko
 * price, so it is normalised to "no data" rather than displayed as $0.00.
 */
export function penniesOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value <= 0) return null;
  return value;
}
