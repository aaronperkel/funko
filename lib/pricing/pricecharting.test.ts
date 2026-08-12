import { describe, expect, it } from 'vitest';
import type { QuotableFields } from '@/lib/pricing/provider';
import {
  PriceChartingProvider,
  buildSearchQuery,
  isFunkoConsole,
} from '@/lib/pricing/pricecharting';

/**
 * Fixture-driven: `fetchImpl` is injected, so the whole resolution flow —
 * including the branches that only happen when the API says something
 * unhelpful — runs without a token and without the network.
 */

const NOW = new Date('2026-08-12T12:00:00.000Z');

function pop(overrides: Partial<QuotableFields> = {}): QuotableFields {
  return {
    id: 'p1',
    name: 'Mo',
    line: 'Pop! Movies',
    franchise: 'Wall-E',
    itemNumber: 1119,
    upc: null,
    priceChartingId: null,
    searchOverride: null,
    matchStatus: 'unmatched',
    condition: 'near_mint',
    hasBox: true,
    boxCondition: 'minor_damage',
    manualValueCents: null,
    quantity: 1,
    ...overrides,
  };
}

/** Records every URL requested, so "one call per UPC hit" is actually asserted. */
function stubFetch(handler: (url: string) => { status?: number; body?: unknown }) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    const { status = 200, body = {} } = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { impl, calls };
}

const FUNKO_PRODUCT = {
  status: 'success',
  id: '6910',
  'product-name': 'Mo',
  'console-name': 'Funko Pop Movies',
  'loose-price': 1250,
  'cib-price': 2400,
  'new-price': 3900,
  'sales-volume': 64,
  epid: '123456789',
};

function provider(
  handler: (url: string) => { status?: number; body?: unknown },
  token: string | null = 'test-token',
) {
  const fetchStub = stubFetch(handler);
  return {
    provider: new PriceChartingProvider({
      token,
      fetchImpl: fetchStub.impl,
      now: () => NOW,
    }),
    calls: fetchStub.calls,
  };
}

describe('configuration', () => {
  it('reports itself unconfigured with no token, instead of failing at request time', async () => {
    const { provider: p, calls } = provider(() => ({ body: FUNKO_PRODUCT }), null);

    expect(p.isConfigured()).toBe(false);

    const result = await p.fetchQuote(pop());
    expect(result.ok).toBe(false);
    // The important part: it never reached the network.
    expect(calls).toHaveLength(0);
  });
});

describe('UPC matching', () => {
  it('prices a UPC hit in a single call and caches the product id', async () => {
    const { provider: p, calls } = provider(() => ({ body: FUNKO_PRODUCT }));

    const result = await p.fetchQuote(pop({ upc: '889698371735' }));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('upc=889698371735');

    if (!result.ok) throw new Error('expected success');
    expect(result.quote?.prices).toEqual({ loose: 1250, damaged_box: 2400, new: 3900 });
    expect(result.quote?.sample?.salesVolumeYearly).toBe(64);
    expect(result.quote?.askingPriceOnly).toBe(false);
    expect(result.match).toMatchObject({
      status: 'matched_upc',
      priceChartingId: '6910',
      priceChartingConsole: 'Funko Pop Movies',
      ebayEpid: '123456789',
    });
  });

  it('refuses to price a UPC that lands on a video game', async () => {
    const { provider: p } = provider(() => ({
      body: {
        status: 'success',
        id: '9001',
        'product-name': 'Mo',
        'console-name': 'Nintendo 64',
        'loose-price': 4500,
        'cib-price': 12000,
        'new-price': 39000,
      },
    }));

    const result = await p.fetchQuote(pop({ upc: '045496830434' }));

    if (!result.ok) throw new Error('expected success');
    // A wrong UPC must not become a $390 valuation.
    expect(result.quote).toBeNull();
    expect(result.match?.status).toBe('pending_review');
    expect(result.match?.priceChartingId).toBeNull();
    expect(result.match?.note).toMatch(/not a Funko/i);
  });

  it('treats a UPC that matches nothing as bad data, not an outage', async () => {
    const { provider: p } = provider(() => ({
      body: { status: 'error', 'error-message': 'Product not found' },
    }));

    const result = await p.fetchQuote(pop({ upc: '000000000000' }));

    if (!result.ok) throw new Error('expected a non-error result');
    expect(result.quote).toBeNull();
    expect(result.match?.status).toBe('unmatched');
    expect(result.match?.note).toMatch(/Check the digits/);
  });
});

describe('cached id', () => {
  it('goes straight to the product endpoint', async () => {
    const { provider: p, calls } = provider(() => ({ body: FUNKO_PRODUCT }));

    const result = await p.fetchQuote(pop({ priceChartingId: '6910', matchStatus: 'confirmed' }));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('id=6910');
    if (!result.ok) throw new Error('expected success');
    expect(result.match?.status).toBe('confirmed');
  });

  it('preserves how the match was originally established', async () => {
    const { provider: p } = provider(() => ({ body: FUNKO_PRODUCT }));

    const result = await p.fetchQuote(
      pop({ priceChartingId: '6910', matchStatus: 'matched_upc' }),
    );

    if (!result.ok) throw new Error('expected success');
    // Re-pricing must not relabel a UPC match as a human confirmation.
    expect(result.match?.status).toBe('matched_upc');
  });

  it('clears a stored id that turns out to point at a game', async () => {
    const { provider: p } = provider(() => ({
      body: { ...FUNKO_PRODUCT, 'console-name': 'Sega Genesis' },
    }));

    const result = await p.fetchQuote(pop({ priceChartingId: '6910', matchStatus: 'confirmed' }));

    if (!result.ok) throw new Error('expected success');
    expect(result.quote).toBeNull();
    expect(result.match?.status).toBe('pending_review');
    expect(result.match?.priceChartingId).toBeNull();
  });
});

describe('text search', () => {
  it('queues candidates for review and prices nothing', async () => {
    const { provider: p, calls } = provider(() => ({
      body: {
        status: 'success',
        products: [
          { id: '6910', 'product-name': 'Mo', 'console-name': 'Funko Pop Movies' },
          { id: '7001', 'product-name': 'Mo', 'console-name': 'Funko Pop Disney' },
        ],
      },
    }));

    const result = await p.fetchQuote(pop());

    expect(calls).toHaveLength(1);
    if (!result.ok) throw new Error('expected success');
    // The entire point of the review queue: a fuzzy hit is not a price.
    expect(result.quote).toBeNull();
    expect(result.match?.status).toBe('pending_review');
    expect(result.match?.candidates).toHaveLength(2);
  });

  it('discards video-game collisions before they reach the queue', async () => {
    const { provider: p } = provider(() => ({
      body: {
        status: 'success',
        products: [
          { id: '1', 'product-name': 'Mo', 'console-name': 'Nintendo 64' },
          { id: '2', 'product-name': 'Falcon', 'console-name': 'PlayStation 2' },
          { id: '6910', 'product-name': 'Mo', 'console-name': 'Funko Pop Movies' },
        ],
      },
    }));

    const result = await p.fetchQuote(pop());

    if (!result.ok) throw new Error('expected success');
    expect(result.match?.candidates).toEqual([
      { id: '6910', name: 'Mo', console: 'Funko Pop Movies' },
    ]);
  });

  it('reports unmatched when nothing Funko comes back at all', async () => {
    const { provider: p } = provider(() => ({
      body: {
        status: 'success',
        products: [{ id: '1', 'product-name': 'Mo', 'console-name': 'Nintendo 64' }],
      },
    }));

    const result = await p.fetchQuote(pop());

    if (!result.ok) throw new Error('expected success');
    expect(result.match?.status).toBe('unmatched');
    expect(result.match?.candidates).toBeNull();
  });
});

describe('price parsing', () => {
  it('treats a zero price as no data rather than a free Funko', async () => {
    const { provider: p } = provider(() => ({
      body: { ...FUNKO_PRODUCT, 'loose-price': 0, 'cib-price': 2400, 'new-price': 0 },
    }));

    const result = await p.fetchQuote(pop({ upc: '889698371735' }));

    if (!result.ok) throw new Error('expected success');
    expect(result.quote?.prices).toEqual({ damaged_box: 2400 });
  });

  it('returns a match with no quote when every tier is empty', async () => {
    const { provider: p } = provider(() => ({
      body: {
        status: 'success',
        id: '6910',
        'product-name': 'Mo',
        'console-name': 'Funko Pop Movies',
      },
    }));

    const result = await p.fetchQuote(pop({ upc: '889698371735' }));

    if (!result.ok) throw new Error('expected success');
    expect(result.quote).toBeNull();
    // Still a real match — the id is worth keeping for next week.
    expect(result.match?.status).toBe('matched_upc');
    expect(result.match?.priceChartingId).toBe('6910');
  });
});

describe('failure handling', () => {
  it('marks server errors retryable and client errors not', async () => {
    const server = provider(() => ({ status: 503, body: {} }));
    const client = provider(() => ({ status: 401, body: {} }));

    const a = await server.provider.fetchQuote(pop({ upc: '1' }));
    const b = await client.provider.fetchQuote(pop({ upc: '1' }));

    expect(a).toMatchObject({ ok: false, retryable: true });
    expect(b).toMatchObject({ ok: false, retryable: false });
  });

  it('survives a body that is not JSON at all', async () => {
    const provider = new PriceChartingProvider({
      token: 'test-token',
      fetchImpl: async () => new Response('<html>maintenance</html>', { status: 200 }),
      now: () => NOW,
    });

    const result = await provider.fetchQuote(pop({ upc: '1' }));
    expect(result).toMatchObject({ ok: false, retryable: false });
  });

  it('survives the network being gone', async () => {
    const provider = new PriceChartingProvider({
      token: 'test-token',
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
      now: () => NOW,
    });

    const result = await provider.fetchQuote(pop({ upc: '1' }));
    expect(result).toMatchObject({ ok: false, retryable: true });
  });
});

describe('buildSearchQuery', () => {
  it('uses the override verbatim when one is set', () => {
    expect(buildSearchQuery(pop({ searchOverride: 'wall-e mo vinyl' }))).toBe('wall-e mo vinyl');
  });

  it('otherwise narrows the query with the franchise and the word funko', () => {
    expect(buildSearchQuery(pop())).toBe('Mo Wall-E funko pop');
  });

  it('falls back to the line when there is no franchise', () => {
    expect(buildSearchQuery(pop({ franchise: null }))).toBe('Mo Pop! Movies funko pop');
  });
});

describe('isFunkoConsole', () => {
  it('accepts every Funko line, not just Pop', () => {
    expect(isFunkoConsole('Funko Pop Star Wars')).toBe(true);
    expect(isFunkoConsole('funko soda')).toBe(true);
    expect(isFunkoConsole('  Funko Mystery Minis ')).toBe(true);
  });

  it('rejects games and empty values', () => {
    expect(isFunkoConsole('Nintendo 64')).toBe(false);
    expect(isFunkoConsole('')).toBe(false);
    expect(isFunkoConsole(null)).toBe(false);
  });
});
