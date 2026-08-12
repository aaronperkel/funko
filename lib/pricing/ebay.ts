import { env } from '@/lib/env';
import { parseDollarsToCents } from '@/lib/money';
import {
  fetchJson,
  type FetchLike,
  type PriceProvider,
  type ProviderResult,
  type QuotableFields,
  type Quote,
  type TierPrices,
} from '@/lib/pricing/provider';

/**
 * eBay Browse — the optional secondary.
 *
 * This provider reads **active listings only**. eBay's public Browse API does
 * not expose completed sales, so everything here is what sellers are *asking*,
 * not what anyone paid. Asking prices on a slow-moving collectible run well
 * above clearing prices, so:
 *
 *   - every quote it produces carries `askingPriceOnly: true`
 *   - its snapshots are stored under the `ebay_active` source and are excluded
 *     from valuation in the query layer
 *   - it is never allowed to become "the value" of anything
 *
 * It exists as a sanity check on PriceCharting, and as the only signal at all
 * for figures PriceCharting has never heard of.
 */

const OAUTH_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SEARCH_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const MARKETPLACE = 'EBAY_US';
const PAGE_SIZE = 100;

/** Trim this much off each tail before averaging. */
export const TRIM_RATIO = 0.1;

/**
 * Below this, a "trimmed average" is theatre — three listings is the least that
 * can meaningfully disagree with each other. Fewer, and we report no data.
 */
export const MIN_SAMPLE = 3;

/** eBay's condition id for New. Everything else is treated as opened. */
const CONDITION_NEW = '1000';

/**
 * Multi-figure listings wreck the average in both directions: a 12-pack priced
 * at $150 looks like a $150 figure. Titles advertising a lot are dropped.
 */
const LOT_PATTERN = /\b(lot|lots|bundle|set of|joblot|job lot)\b/i;

type TokenCache = { token: string; expiresAt: number };

export type EbayOptions = {
  clientId?: string | null;
  clientSecret?: string | null;
  fetchImpl?: FetchLike;
  now?: () => Date;
};

export class EbayBrowseProvider implements PriceProvider {
  readonly id = 'ebay_active' as const;
  readonly label = 'eBay (asking prices)';

  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;

  /**
   * Instance-scoped, not module-scoped: one provider instance serves one
   * refresh run, so the whole batch shares a single OAuth token, and nothing
   * leaks between runs.
   */
  private tokenCache: TokenCache | null = null;

  constructor(options: EbayOptions = {}) {
    this.clientId = options.clientId !== undefined ? options.clientId : env.ebayClientId;
    this.clientSecret =
      options.clientSecret !== undefined ? options.clientSecret : env.ebayClientSecret;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  async fetchQuote(pop: QuotableFields): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'No eBay credentials configured.', retryable: false };
    }

    const token = await this.accessToken();
    if (!token.ok) return token;

    const query = buildEbayQuery(pop);
    const url =
      `${SEARCH_URL}?q=${encodeURIComponent(query)}` +
      `&limit=${PAGE_SIZE}` +
      // Auctions mid-bid are not asking prices; only fixed-price listings are.
      `&filter=${encodeURIComponent('buyingOptions:{FIXED_PRICE}')}`;

    const response = await fetchJson(this.fetchImpl, url, {
      headers: {
        authorization: `Bearer ${token.token}`,
        'X-EBAY-C-MARKETPLACE-ID': MARKETPLACE,
        accept: 'application/json',
      },
    });
    if (!response.ok) return response;

    const listings = parseListings(response.body);
    const relevant = listings.filter((listing) => isRelevant(listing.title));

    const boxed = relevant.filter((listing) => listing.conditionId === CONDITION_NEW);
    const opened = relevant.filter((listing) => listing.conditionId !== CONDITION_NEW);

    const newPrice = trimmedMean(boxed.map((listing) => listing.totalCents));
    const loosePrice = trimmedMean(opened.map((listing) => listing.totalCents));

    if (newPrice === null && loosePrice === null) {
      return { ok: true, quote: null };
    }

    const prices: TierPrices = {};
    const listingCounts: NonNullable<Quote['sample']>['listingCounts'] = {};

    /*
     * eBay has two condition buckets and this app has three tiers, so the
     * mapping is deliberately partial rather than invented:
     *
     *   New  -> `new`   (sealed in box — but eBay says nothing about box wear,
     *                    so this is the optimistic read of a boxed listing)
     *   Used -> `loose` (opened; most such listings are figure-only)
     *   damaged_box     -> left empty. eBay has no equivalent concept, and
     *                      guessing one would be making a number up.
     */
    if (newPrice !== null) {
      prices.new = newPrice;
      listingCounts.new = boxed.length;
    }
    if (loosePrice !== null) {
      prices.loose = loosePrice;
      listingCounts.loose = opened.length;
    }

    return {
      ok: true,
      quote: {
        prices,
        source: 'ebay_active',
        capturedAt: this.now().toISOString(),
        askingPriceOnly: true,
        sample: { listingCounts },
        raw: { query, totalListings: listings.length, afterFiltering: relevant.length },
      },
    };
  }

  /** Client-credentials grant, cached until a minute before it expires. */
  private async accessToken(): Promise<
    { ok: true; token: string } | { ok: false; error: string; retryable: boolean }
  > {
    const nowMs = this.now().getTime();
    if (this.tokenCache && this.tokenCache.expiresAt > nowMs) {
      return { ok: true, token: this.tokenCache.token };
    }

    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetchJson(this.fetchImpl, OAUTH_URL, {
      method: 'POST',
      headers: {
        authorization: `Basic ${basic}`,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'https://api.ebay.com/oauth/api_scope',
      }).toString(),
    });

    if (!response.ok) {
      return { ok: false, error: `eBay auth failed: ${response.error}`, retryable: response.retryable };
    }

    const body = response.body as { access_token?: unknown; expires_in?: unknown };
    const token = typeof body.access_token === 'string' ? body.access_token : null;
    if (!token) {
      return { ok: false, error: 'eBay auth returned no access token.', retryable: false };
    }

    const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 7200;
    this.tokenCache = { token, expiresAt: nowMs + Math.max(0, expiresIn - 60) * 1000 };

    return { ok: true, token };
  }
}

export type EbayListing = {
  title: string;
  conditionId: string | null;
  /** Item price plus shipping — what a buyer actually pays. */
  totalCents: number;
};

export function buildEbayQuery(
  pop: Pick<QuotableFields, 'name' | 'itemNumber'>,
): string {
  return ['funko pop', pop.name, pop.itemNumber !== null ? String(pop.itemNumber) : null]
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

/**
 * Search results include plenty that is not the figure: custom repaints, empty
 * boxes, protectors sold on their own, and multi-figure lots.
 */
export function isRelevant(title: string): boolean {
  if (!/funko/i.test(title)) return false;
  if (LOT_PATTERN.test(title)) return false;
  if (/\b(protector|case only|box only|empty box|custom)\b/i.test(title)) return false;
  return true;
}

/**
 * Drops the cheapest and dearest 10% before averaging.
 *
 * The tails of an active-listing search are not signal: one end is damaged
 * goods and mispriced listings, the other is optimists asking 5× market. The
 * trim is what makes a mean usable here at all — an untrimmed mean on this data
 * is dragged around by a single $900 listing nobody will ever buy.
 */
export function trimmedMean(values: number[], trimRatio = TRIM_RATIO): number | null {
  if (values.length < MIN_SAMPLE) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const drop = Math.floor(sorted.length * trimRatio);
  const kept = drop > 0 ? sorted.slice(drop, sorted.length - drop) : sorted;
  if (kept.length === 0) return null;

  const total = kept.reduce((sum, value) => sum + value, 0);
  return Math.round(total / kept.length);
}

function parseListings(body: unknown): EbayListing[] {
  if (!body || typeof body !== 'object') return [];
  const summaries = (body as { itemSummaries?: unknown }).itemSummaries;
  if (!Array.isArray(summaries)) return [];

  const listings: EbayListing[] = [];

  for (const entry of summaries) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;

    const title = typeof record.title === 'string' ? record.title : null;
    const priceCents = readAmountCents(record.price);
    if (title === null || priceCents === null) continue;

    // Shipping is part of what a buyer pays; free shipping reads as 0, and an
    // unknown shipping cost is left out rather than guessed at.
    const shippingCents = readShippingCents(record.shippingOptions) ?? 0;

    listings.push({
      title,
      conditionId: typeof record.conditionId === 'string' ? record.conditionId : null,
      totalCents: priceCents + shippingCents,
    });
  }

  return listings;
}

/** eBay reports money as `{ value: "12.34", currency: "USD" }`. */
function readAmountCents(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;

  // A GBP listing is not comparable to a USD one; skip rather than convert.
  if (typeof record.currency === 'string' && record.currency !== 'USD') return null;
  if (typeof record.value !== 'string') return null;

  const cents = parseDollarsToCents(record.value);
  return typeof cents === 'number' ? cents : null;
}

function readShippingCents(shippingOptions: unknown): number | null {
  if (!Array.isArray(shippingOptions) || shippingOptions.length === 0) return null;
  const first = shippingOptions[0];
  if (!first || typeof first !== 'object') return null;
  return readAmountCents((first as Record<string, unknown>).shippingCost);
}
