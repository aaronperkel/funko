import { describe, expect, it } from 'vitest';
import { EbayBrowseProvider, buildEbayQuery, isRelevant, trimmedMean } from '@/lib/pricing/ebay';
import type { QuotableFields } from '@/lib/pricing/provider';

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

type Listing = {
  title: string;
  value: string;
  conditionId?: string;
  currency?: string;
  shipping?: string;
};

function listing({ title, value, conditionId = '3000', currency = 'USD', shipping }: Listing) {
  return {
    itemId: `v1|${Math.random()}`,
    title,
    conditionId,
    price: { value, currency },
    ...(shipping ? { shippingOptions: [{ shippingCost: { value: shipping, currency } }] } : {}),
  };
}

/** Serves an OAuth token first, then the search payload. */
function stubEbay(itemSummaries: unknown[]) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    const body = url.includes('/identity/v1/oauth2/token')
      ? { access_token: 'token-abc', expires_in: 7200 }
      : { total: itemSummaries.length, itemSummaries };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  return {
    calls,
    provider: new EbayBrowseProvider({
      clientId: 'id',
      clientSecret: 'secret',
      fetchImpl: impl,
      now: () => NOW,
    }),
  };
}

function used(value: string, title = 'Funko Pop Wall-E Mo 1119') {
  return listing({ title, value, conditionId: '3000' });
}

function boxed(value: string, title = 'Funko Pop Wall-E Mo 1119') {
  return listing({ title, value, conditionId: '1000' });
}

describe('trimmedMean', () => {
  it('drops the tails so one absurd listing cannot move the number', () => {
    const sane = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900];
    const withOutlier = [...sane.slice(0, 9), 90_000];

    // The $900 optimist is trimmed away; the answer barely moves.
    expect(trimmedMean(withOutlier)).toBe(trimmedMean(sane));
  });

  it('refuses to average fewer than three listings', () => {
    expect(trimmedMean([1000, 2000])).toBeNull();
    expect(trimmedMean([1000, 2000, 3000])).toBe(2000);
  });

  it('returns whole cents, never a fraction of one', () => {
    const result = trimmedMean([100, 101, 103]);
    expect(result).toBe(101);
    expect(Number.isInteger(result)).toBe(true);
  });
});

describe('isRelevant', () => {
  it('keeps ordinary single-figure listings', () => {
    expect(isRelevant('Funko Pop Wall-E Mo #1119 Vaulted')).toBe(true);
  });

  it('drops lots, which would read as one very expensive figure', () => {
    expect(isRelevant('Funko Pop LOT of 12 Star Wars')).toBe(false);
    expect(isRelevant('Funko Pop Marvel bundle')).toBe(false);
  });

  it('drops accessories and customs sold under the same search', () => {
    expect(isRelevant('Funko Pop Protector Case 0.5mm')).toBe(false);
    expect(isRelevant('Custom Funko Pop hand painted')).toBe(false);
    expect(isRelevant('Funko Pop BOX ONLY no figure')).toBe(false);
  });

  it('drops anything that is not a Funko at all', () => {
    expect(isRelevant('Wall-E Mo plush toy')).toBe(false);
  });
});

describe('EbayBrowseProvider', () => {
  it('reports itself unconfigured without credentials', async () => {
    const provider = new EbayBrowseProvider({ clientId: null, clientSecret: null });
    expect(provider.isConfigured()).toBe(false);
    expect(await provider.fetchQuote(pop())).toMatchObject({ ok: false, retryable: false });
  });

  it('buckets New into the mint tier and Used into loose, leaving damaged box alone', async () => {
    const { provider } = stubEbay([
      boxed('20.00'),
      boxed('22.00'),
      boxed('24.00'),
      used('9.00'),
      used('10.00'),
      used('11.00'),
    ]);

    const result = await provider.fetchQuote(pop());

    if (!result.ok) throw new Error('expected success');
    expect(result.quote?.prices).toEqual({ new: 2200, loose: 1000 });
    // eBay has no "damaged box" concept, and inventing one would be a lie.
    expect(result.quote?.prices.damaged_box).toBeUndefined();
  });

  it('always marks its numbers as asking prices', async () => {
    const { provider } = stubEbay([used('9.00'), used('10.00'), used('11.00')]);

    const result = await provider.fetchQuote(pop());
    if (!result.ok) throw new Error('expected success');

    expect(result.quote?.askingPriceOnly).toBe(true);
    expect(result.quote?.source).toBe('ebay_active');
  });

  it('counts shipping, because that is what a buyer actually pays', async () => {
    const { provider } = stubEbay([
      listing({ title: 'Funko Pop Mo', value: '5.00', shipping: '6.00' }),
      listing({ title: 'Funko Pop Mo', value: '5.00', shipping: '6.00' }),
      listing({ title: 'Funko Pop Mo', value: '5.00', shipping: '6.00' }),
    ]);

    const result = await provider.fetchQuote(pop());
    if (!result.ok) throw new Error('expected success');
    expect(result.quote?.prices.loose).toBe(1100);
  });

  it('skips listings priced in another currency rather than converting them', async () => {
    const { provider } = stubEbay([
      used('10.00'),
      used('11.00'),
      used('12.00'),
      listing({ title: 'Funko Pop Mo', value: '900.00', currency: 'GBP' }),
    ]);

    const result = await provider.fetchQuote(pop());
    if (!result.ok) throw new Error('expected success');
    expect(result.quote?.prices.loose).toBe(1100);
  });

  it('reports the sample size behind each tier', async () => {
    const { provider } = stubEbay([used('10.00'), used('11.00'), used('12.00'), used('13.00')]);

    const result = await provider.fetchQuote(pop());
    if (!result.ok) throw new Error('expected success');
    expect(result.quote?.sample?.listingCounts).toEqual({ loose: 4 });
  });

  it('returns no quote rather than a number built from two listings', async () => {
    const { provider } = stubEbay([used('10.00'), boxed('30.00')]);

    const result = await provider.fetchQuote(pop());
    if (!result.ok) throw new Error('expected success');
    expect(result.quote).toBeNull();
  });

  it('asks only for fixed-price listings, since a live auction bid is not an asking price', async () => {
    const { provider, calls } = stubEbay([used('10.00'), used('11.00'), used('12.00')]);

    await provider.fetchQuote(pop());

    const search = calls.find((url) => url.includes('item_summary/search'));
    expect(search).toContain(encodeURIComponent('buyingOptions:{FIXED_PRICE}'));
  });

  it('reuses one OAuth token across a whole refresh run', async () => {
    const { provider, calls } = stubEbay([used('10.00'), used('11.00'), used('12.00')]);

    await provider.fetchQuote(pop());
    await provider.fetchQuote(pop({ id: 'p2', name: 'Jay' }));

    const tokenCalls = calls.filter((url) => url.includes('oauth2/token'));
    expect(tokenCalls).toHaveLength(1);
  });

  it('degrades to a typed failure when eBay auth is rejected', async () => {
    const provider = new EbayBrowseProvider({
      clientId: 'id',
      clientSecret: 'wrong',
      fetchImpl: async () => new Response('{}', { status: 401 }),
      now: () => NOW,
    });

    expect(await provider.fetchQuote(pop())).toMatchObject({ ok: false, retryable: false });
  });
});

describe('buildEbayQuery', () => {
  it('includes the item number, which is what makes the search specific', () => {
    expect(buildEbayQuery(pop())).toBe('funko pop Mo 1119');
  });

  it('copes with figures that have no item number', () => {
    expect(buildEbayQuery(pop({ itemNumber: null }))).toBe('funko pop Mo');
  });
});
