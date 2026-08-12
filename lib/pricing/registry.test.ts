import { describe, expect, it } from 'vitest';
import type { PriceSnapshot } from '@/db/schema';
import { ManualProvider } from '@/lib/pricing/manual';
import type { QuotableFields, Quote } from '@/lib/pricing/provider';
import { VALUE_PRECEDENCE, resolveValueQuote } from '@/lib/pricing/registry';
import { valuePop } from '@/lib/valuation';

const NOW = new Date('2026-08-12T12:00:00.000Z');

function pop(overrides: Partial<QuotableFields> = {}): QuotableFields {
  return {
    id: 'p1',
    name: 'Mo',
    line: null,
    franchise: 'Wall-E',
    itemNumber: 1119,
    upc: null,
    priceChartingId: null,
    searchOverride: null,
    matchStatus: 'unmatched',
    condition: 'near_mint',
    hasBox: true,
    boxCondition: 'minor_damage', // -> damaged_box tier
    manualValueCents: null,
    quantity: 1,
    ...overrides,
  };
}

const priceChartingQuote: Quote = {
  prices: { loose: 1250, damaged_box: 2400, new: 3900 },
  source: 'pricecharting',
  capturedAt: NOW.toISOString(),
  askingPriceOnly: false,
};

const ebayQuote: Quote = {
  prices: { loose: 9900, new: 12_000 },
  source: 'ebay_active',
  capturedAt: NOW.toISOString(),
  askingPriceOnly: true,
};

describe('precedence', () => {
  it('never lists eBay as a source of value', () => {
    expect(VALUE_PRECEDENCE).toEqual(['manual', 'pricecharting']);
    expect(VALUE_PRECEDENCE).not.toContain('ebay_active');
  });

  it('values a figure at its own tier', () => {
    const result = resolveValueQuote(pop(), [priceChartingQuote]);
    expect(result?.unitValueCents).toBe(2400);
  });

  it('lets a manual appraisal beat the API', () => {
    const manual: Quote = {
      prices: { damaged_box: 500 },
      source: 'manual',
      capturedAt: NOW.toISOString(),
      askingPriceOnly: false,
    };

    const result = resolveValueQuote(pop({ manualValueCents: 500 }), [
      priceChartingQuote,
      manual,
    ]);

    expect(result?.quote.source).toBe('manual');
    expect(result?.unitValueCents).toBe(500);
  });

  it('refuses to price anything off eBay, even when it is the only quote there is', () => {
    expect(resolveValueQuote(pop(), [ebayQuote])).toBeNull();
  });

  it('reports no value rather than borrowing a price from another tier', () => {
    const partial: Quote = { ...priceChartingQuote, prices: { loose: 1250, new: 3900 } };
    expect(resolveValueQuote(pop(), [partial])).toBeNull();
  });
});

/**
 * Two code paths answer "which number is the value": this one, over live
 * provider quotes, and `valuePop`, over stored snapshots. They take different
 * inputs but must never disagree — a dashboard where the refresh and the page
 * pick different numbers is the exact failure this app exists to avoid.
 */
describe('agreement with the render path', () => {
  function snapshotFrom(quote: Quote): PriceSnapshot {
    return {
      id: 's1',
      popId: 'p1',
      source: quote.source,
      loosePriceCents: quote.prices.loose ?? null,
      damagedBoxPriceCents: quote.prices.damaged_box ?? null,
      newPriceCents: quote.prices.new ?? null,
      salesVolumeYearly: null,
      currency: 'USD',
      capturedAt: quote.capturedAt,
      rawJson: null,
    };
  }

  const cases: Array<{ label: string; fields: Partial<QuotableFields> }> = [
    { label: 'mint in mint box', fields: { condition: 'mint', boxCondition: 'mint' } },
    { label: 'near mint in a dented box', fields: { boxCondition: 'minor_damage' } },
    { label: 'no box at all', fields: { hasBox: false, boxCondition: 'none' } },
    { label: 'worn figure in a perfect box', fields: { condition: 'fair', boxCondition: 'mint' } },
    { label: 'with a manual appraisal', fields: { manualValueCents: 7777 } },
  ];

  for (const { label, fields } of cases) {
    it(`agrees for a figure that is ${label}`, async () => {
      const subject = pop(fields);
      const manual = await new ManualProvider({ now: () => NOW }).fetchQuote(subject);
      if (!manual.ok) throw new Error('manual provider should never fail');

      const quotes = [priceChartingQuote, ebayQuote, ...(manual.quote ? [manual.quote] : [])];

      const fromProviders = resolveValueQuote(subject, quotes);
      const fromSnapshot = valuePop(subject, snapshotFrom(priceChartingQuote));

      expect(fromProviders?.unitValueCents ?? null).toBe(fromSnapshot.unitValueCents);
      expect(fromProviders?.quote.source ?? null).toBe(fromSnapshot.source);
    });
  }
});

describe('ManualProvider', () => {
  it('is always available, which is what makes a keyless deployment work', () => {
    expect(new ManualProvider().isConfigured()).toBe(true);
  });

  it('returns nothing when no appraisal has been recorded', async () => {
    const result = await new ManualProvider().fetchQuote(pop());
    if (!result.ok) throw new Error('expected success');
    expect(result.quote).toBeNull();
  });

  it('applies the appraisal to the figure’s own tier and no other', async () => {
    const result = await new ManualProvider({ now: () => NOW }).fetchQuote(
      pop({ manualValueCents: 4200, hasBox: false, boxCondition: 'none' }),
    );
    if (!result.ok) throw new Error('expected success');
    expect(result.quote?.prices).toEqual({ loose: 4200 });
  });
});
