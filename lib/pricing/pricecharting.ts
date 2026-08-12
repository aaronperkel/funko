import { env } from '@/lib/env';
import {
  fetchJson,
  penniesOrNull,
  type FetchLike,
  type MatchCandidate,
  type MatchEvidence,
  type PriceProvider,
  type ProviderResult,
  type QuotableFields,
  type Quote,
} from '@/lib/pricing/provider';
import { normaliseUpc } from '@/lib/upc';

/**
 * PriceCharting — the primary source.
 *
 * Its Funko tables publish exactly the three prices this app is built around:
 * "Out of Box" / "In Dmg Box" / "New Price", which the API calls `loose-price`
 * / `cib-price` / `new-price`, all in integer pennies.
 *
 * Two things about this API shape the code below:
 *
 * - It serves **no history**. Every point on every chart in this app is one we
 *   recorded ourselves, one weekly snapshot at a time.
 * - Its search endpoint returns no prices, so an unknown figure costs two
 *   calls (search, then fetch) — which collapses to one forever after, once
 *   the resolved product id is cached on the pop row.
 */

const API_BASE = 'https://www.pricecharting.com/api';

/**
 * PriceCharting indexes Funko alongside its video-game catalogue, and this
 * collection is full of names that collide with games — "Mo", "Jay", "Falcon",
 * "Captain America". Every candidate must sit in a console whose name starts
 * with "Funko", or it is not this figure and its price is not this figure's
 * price.
 */
const FUNKO_CONSOLE_PREFIX = 'funko';

/** Enough for a human to choose from; more is just noise in the review queue. */
const MAX_CANDIDATES = 6;

type ProductPayload = {
  status?: unknown;
  'error-message'?: unknown;
  id?: unknown;
  'product-name'?: unknown;
  'console-name'?: unknown;
  'loose-price'?: unknown;
  'cib-price'?: unknown;
  'new-price'?: unknown;
  'sales-volume'?: unknown;
  epid?: unknown;
  upc?: unknown;
};

type SearchPayload = {
  status?: unknown;
  'error-message'?: unknown;
  products?: unknown;
};

export type PriceChartingOptions = {
  token?: string | null;
  fetchImpl?: FetchLike;
  now?: () => Date;
};

export class PriceChartingProvider implements PriceProvider {
  readonly id = 'pricecharting' as const;
  readonly label = 'PriceCharting';

  private readonly token: string | null;
  private readonly fetchImpl: FetchLike;
  private readonly now: () => Date;

  constructor(options: PriceChartingOptions = {}) {
    this.token = options.token !== undefined ? options.token : env.priceChartingToken;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => new Date());
  }

  isConfigured(): boolean {
    return this.token !== null && this.token.length > 0;
  }

  /**
   * Resolution order, cheapest and most trustworthy first:
   *
   *   1. cached product id  -> one call, already vouched for
   *   2. UPC                -> one call, auto-accepted (a UPC is unambiguous)
   *   3. text search        -> two calls, and the result is NOT priced; it goes
   *                            to the review queue for a human to confirm
   *   4. nothing            -> unmatched, "needs UPC"
   */
  async fetchQuote(pop: QuotableFields): Promise<ProviderResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        error: 'No PRICECHARTING_API_TOKEN configured.',
        retryable: false,
      };
    }

    if (pop.priceChartingId) {
      return this.byId(pop.priceChartingId, pop, 'cached id');
    }

    if (pop.upc) {
      return this.byUpc(pop.upc);
    }

    return this.bySearch(pop);
  }

  private async byId(
    productId: string,
    pop: QuotableFields,
    via: string,
  ): Promise<ProviderResult> {
    const result = await this.getProduct({ id: productId });
    if (!result.ok) return result;

    const product = result.product;
    if (!isFunkoConsole(product.console)) {
      return {
        ok: true,
        quote: null,
        match: {
          status: 'pending_review',
          priceChartingId: null,
          priceChartingConsole: product.console,
          ebayEpid: null,
          upc: null,
          candidates: [{ id: product.id, name: product.name, console: product.console }],
          note: `Stored product id resolves to "${product.console}", which is not a Funko listing. Re-match this figure.`,
        },
      };
    }

    /*
     * Reaching this point means someone already vouched for this id — either a
     * UPC matched it or a human confirmed it in the review queue. Preserve
     * whichever of those it was rather than overwriting the provenance.
     */
    const status =
      pop.matchStatus === 'matched_upc' || pop.matchStatus === 'confirmed'
        ? pop.matchStatus
        : 'confirmed';

    return {
      ok: true,
      quote: this.toQuote(product),
      match: {
        status,
        priceChartingId: product.id,
        priceChartingConsole: product.console,
        ebayEpid: product.epid,
        upc: product.upc,
        candidates: null,
        note: `Priced via ${via}.`,
      },
    };
  }

  private async byUpc(upc: string): Promise<ProviderResult> {
    const result = await this.getProduct({ upc });

    if (!result.ok) {
      // A UPC that matches nothing is a data problem, not an outage.
      if (result.notFound) {
        return {
          ok: true,
          quote: null,
          match: {
            status: 'unmatched',
            priceChartingId: null,
            priceChartingConsole: null,
            ebayEpid: null,
            upc: null,
            candidates: null,
            note: `UPC ${upc} matched nothing in PriceCharting. Check the digits.`,
          },
        };
      }
      return result;
    }

    const product = result.product;

    /*
     * A UPC that lands on a video game means the UPC is wrong, not that the
     * figure is worth what the game is worth. Refuse to price it and say so.
     */
    if (!isFunkoConsole(product.console)) {
      return {
        ok: true,
        quote: null,
        match: {
          status: 'pending_review',
          priceChartingId: null,
          priceChartingConsole: product.console,
          ebayEpid: null,
          upc: null,
          candidates: [{ id: product.id, name: product.name, console: product.console }],
          note: `UPC ${upc} matched "${product.name}" in "${product.console}" — not a Funko listing. The UPC is probably wrong.`,
        },
      };
    }

    return {
      ok: true,
      quote: this.toQuote(product),
      match: {
        status: 'matched_upc',
        priceChartingId: product.id,
        priceChartingConsole: product.console,
        ebayEpid: product.epid,
        upc: product.upc,
        candidates: null,
        note: `Matched by UPC ${upc}.`,
      },
    };
  }

  /**
   * The fuzzy path. It deliberately produces **no price** — a wrong match here
   * writes a plausible-looking wrong number that nothing would ever catch, so
   * the candidates go to a human instead.
   */
  private async bySearch(pop: QuotableFields): Promise<ProviderResult> {
    const query = buildSearchQuery(pop);

    const url = `${API_BASE}/products?t=${encodeURIComponent(this.token ?? '')}&q=${encodeURIComponent(query)}`;
    const response = await fetchJson(this.fetchImpl, url);
    if (!response.ok) return response;

    const payload = response.body as SearchPayload;
    if (isErrorStatus(payload)) {
      return { ok: false, error: errorMessage(payload), retryable: false };
    }

    const candidates = parseCandidates(payload.products).filter((candidate) =>
      isFunkoConsole(candidate.console),
    );

    if (candidates.length === 0) {
      return {
        ok: true,
        quote: null,
        match: {
          status: 'unmatched',
          priceChartingId: null,
          priceChartingConsole: null,
          ebayEpid: null,
          upc: null,
          candidates: null,
          note: `No Funko listing found for "${query}". Add a UPC, or set a search override.`,
        },
      };
    }

    return {
      ok: true,
      quote: null,
      match: {
        status: 'pending_review',
        priceChartingId: null,
        priceChartingConsole: null,
        ebayEpid: null,
        upc: null,
        candidates: candidates.slice(0, MAX_CANDIDATES),
        note: `${candidates.length} Funko ${candidates.length === 1 ? 'listing' : 'listings'} matched "${query}". Confirm one before it is priced.`,
      },
    };
  }

  private async getProduct(
    params: { id: string } | { upc: string },
  ): Promise<
    | { ok: true; product: ParsedProduct }
    | { ok: false; error: string; retryable: boolean; notFound?: boolean }
  > {
    const key = 'id' in params ? 'id' : 'upc';
    const value = 'id' in params ? params.id : params.upc;
    const url = `${API_BASE}/product?t=${encodeURIComponent(this.token ?? '')}&${key}=${encodeURIComponent(value)}`;

    const response = await fetchJson(this.fetchImpl, url);
    if (!response.ok) return response;

    const payload = response.body as ProductPayload;

    if (isErrorStatus(payload)) {
      const message = errorMessage(payload);
      return {
        ok: false,
        error: message,
        retryable: false,
        notFound: /not found|no product|unknown/i.test(message),
      };
    }

    const id = asNonEmptyString(payload.id);
    const name = asNonEmptyString(payload['product-name']);

    if (id === null || name === null) {
      return { ok: false, error: 'Response had no product id or name.', retryable: false };
    }

    return {
      ok: true,
      product: {
        id,
        name,
        console: asNonEmptyString(payload['console-name']) ?? '',
        epid: asNonEmptyString(payload.epid),
        loose: penniesOrNull(payload['loose-price']),
        cib: penniesOrNull(payload['cib-price']),
        newPrice: penniesOrNull(payload['new-price']),
        salesVolumeYearly: asPositiveInt(payload['sales-volume']),
        upc: parseCatalogueUpc(payload.upc),
        raw: payload,
      },
    };
  }

  private toQuote(product: ParsedProduct): Quote | null {
    const prices: Quote['prices'] = {};
    if (product.loose !== null) prices.loose = product.loose;
    if (product.cib !== null) prices.damaged_box = product.cib;
    if (product.newPrice !== null) prices.new = product.newPrice;

    // Matched, but PriceCharting has no numbers for it. Not an error — no data.
    if (Object.keys(prices).length === 0) return null;

    return {
      prices,
      source: 'pricecharting',
      capturedAt: this.now().toISOString(),
      askingPriceOnly: false,
      sample:
        product.salesVolumeYearly === null
          ? undefined
          : { salesVolumeYearly: product.salesVolumeYearly },
      raw: product.raw,
    };
  }
}

type ParsedProduct = {
  id: string;
  name: string;
  console: string;
  epid: string | null;
  loose: number | null;
  cib: number | null;
  newPrice: number | null;
  salesVolumeYearly: number | null;
  upc: string | null;
  raw: unknown;
};

/**
 * The query a figure searches under. `searchOverride` exists precisely because
 * some figures are only findable under a name nobody would guess.
 */
export function buildSearchQuery(
  pop: Pick<QuotableFields, 'name' | 'franchise' | 'line' | 'searchOverride'>,
): string {
  if (pop.searchOverride) return pop.searchOverride;
  return [pop.name, pop.franchise ?? pop.line, 'funko pop']
    .filter((part): part is string => Boolean(part))
    .join(' ');
}

export function isFunkoConsole(consoleName: string | null | undefined): boolean {
  if (!consoleName) return false;
  return consoleName.trim().toLowerCase().startsWith(FUNKO_CONSOLE_PREFIX);
}

function parseCandidates(products: unknown): MatchCandidate[] {
  if (!Array.isArray(products)) return [];

  const candidates: MatchCandidate[] = [];
  for (const entry of products) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;

    const id = asNonEmptyString(record.id);
    const name = asNonEmptyString(record['product-name']);
    if (id === null || name === null) continue;

    candidates.push({
      id,
      name,
      console: asNonEmptyString(record['console-name']) ?? '',
    });
  }
  return candidates;
}

function isErrorStatus(payload: { status?: unknown }): boolean {
  return typeof payload.status === 'string' && payload.status.toLowerCase() === 'error';
}

function errorMessage(payload: { 'error-message'?: unknown }): string {
  const message = payload['error-message'];
  return typeof message === 'string' && message.length > 0
    ? message
    : 'PriceCharting reported an error.';
}

/** Ids arrive as numbers or strings depending on endpoint; normalise to string. */
function asNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * PriceCharting carries a UPC for most modern products, which lets a confirmed
 * match backfill the barcode rather than making you read one off a box. It is
 * still put through the same checksum as a hand-typed one — a catalogue is not
 * a reason to skip validation.
 */
function parseCatalogueUpc(value: unknown): string | null {
  const raw = asNonEmptyString(value);
  if (raw === null) return null;
  const result = normaliseUpc(raw);
  return result.ok ? result.upc : null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value) || value < 0) return null;
  return value;
}

export type { MatchEvidence };
