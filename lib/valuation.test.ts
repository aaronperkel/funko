import { describe, expect, it } from 'vitest';
import type { PriceSnapshot } from '@/db/schema';
import {
  formatLiquidity,
  franchiseBreakdown,
  portfolioTotals,
  valuePop,
  type ValuableFields,
} from '@/lib/valuation';

function snapshot(overrides: Partial<PriceSnapshot> = {}): PriceSnapshot {
  return {
    id: 's1',
    popId: 'p1',
    source: 'pricecharting',
    loosePriceCents: 1200,
    damagedBoxPriceCents: 2450,
    newPriceCents: 3999,
    salesVolumeYearly: 60,
    currency: 'USD',
    capturedAt: '2026-08-01T00:00:00.000Z',
    rawJson: null,
    ...overrides,
  };
}

const boxedMint: ValuableFields = {
  manualValueCents: null,
  quantity: 1,
  condition: 'mint',
  hasBox: true,
  boxCondition: 'mint',
};

const loose: ValuableFields = {
  manualValueCents: null,
  quantity: 1,
  condition: 'mint',
  hasBox: false,
  boxCondition: 'none',
};

describe('valuePop', () => {
  it('values a figure at its own tier, not the best tier', () => {
    expect(valuePop(boxedMint, snapshot()).unitValueCents).toBe(3999);
    expect(valuePop(loose, snapshot()).unitValueCents).toBe(1200);
  });

  it('multiplies by quantity', () => {
    expect(valuePop({ ...boxedMint, quantity: 3 }, snapshot()).totalValueCents).toBe(3999 * 3);
  });

  it('lets a manual value beat the API outright', () => {
    const result = valuePop({ ...boxedMint, manualValueCents: 500 }, snapshot());
    expect(result.unitValueCents).toBe(500);
    expect(result.source).toBe('manual');
  });

  it('reports no value rather than falling back to another tier', () => {
    const partial = snapshot({ newPriceCents: null });
    const result = valuePop(boxedMint, partial);
    expect(result.unitValueCents).toBeNull();
    expect(result.totalValueCents).toBeNull();
    expect(result.source).toBeNull();
  });

  it('still exposes all three tiers for the side-by-side display', () => {
    expect(valuePop(loose, snapshot()).tiers).toEqual({
      loose: 1200,
      damaged_box: 2450,
      new: 3999,
    });
  });

  it('handles having no snapshot at all', () => {
    const result = valuePop(boxedMint, null);
    expect(result.unitValueCents).toBeNull();
    expect(result.tiers).toEqual({ loose: null, damaged_box: null, new: null });
  });
});

describe('portfolioTotals', () => {
  const valued = { pop: { quantity: 1, purchasePriceCents: 1000 }, valuation: valuePop(boxedMint, snapshot()) };
  const unvalued = { pop: { quantity: 1, purchasePriceCents: 5000 }, valuation: valuePop(boxedMint, null) };

  it('excludes unvalued figures from the gain comparison', () => {
    const totals = portfolioTotals([valued, unvalued]);
    // Only the valued figure's $10.00 cost is compared against its $39.99 value.
    expect(totals.comparableCostCents).toBe(1000);
    expect(totals.gainCents).toBe(3999 - 1000);
    expect(totals.unvaluedCount).toBe(1);
  });

  it('still reports full cost basis across everything owned', () => {
    expect(portfolioTotals([valued, unvalued]).costBasisCents).toBe(6000);
  });

  it('charges shipping only on items that actually have a value', () => {
    const totals = portfolioTotals([valued, unvalued]);
    // 3999 gross - 13% fee - ONE $6 shipping, not two.
    expect(totals.valuedItemCount).toBe(1);
    expect(totals.netIfSoldCents).toBe(3999 - Math.round(3999 * 0.13) - 600);
  });

  it('reports zero, never a negative shipping bill, when nothing is valued', () => {
    const totals = portfolioTotals([unvalued, unvalued, unvalued]);
    expect(totals.valueCents).toBe(0);
    expect(totals.valuedItemCount).toBe(0);
    expect(totals.netIfSoldCents).toBe(0);
  });

  it('has no gain ratio when there is no cost basis to compare against', () => {
    const noCost = { pop: { quantity: 1, purchasePriceCents: null }, valuation: valuePop(boxedMint, snapshot()) };
    expect(portfolioTotals([noCost]).gainRatio).toBeNull();
  });

  it('counts quantity, not just entries', () => {
    const three = { pop: { quantity: 3, purchasePriceCents: 100 }, valuation: valuePop({ ...boxedMint, quantity: 3 }, snapshot()) };
    const totals = portfolioTotals([three]);
    expect(totals.itemCount).toBe(3);
    expect(totals.uniqueCount).toBe(1);
    expect(totals.valuedItemCount).toBe(3);
  });
});

describe('franchiseBreakdown', () => {
  it('groups and sorts by value', () => {
    const rows = franchiseBreakdown([
      { pop: { franchise: 'Star Wars', quantity: 1 }, valuation: valuePop(loose, snapshot()) },
      { pop: { franchise: 'Marvel', quantity: 1 }, valuation: valuePop(boxedMint, snapshot()) },
    ]);
    expect(rows.map((r) => r.franchise)).toEqual(['Marvel', 'Star Wars']);
  });

  it('buckets missing franchises rather than dropping them', () => {
    const rows = franchiseBreakdown([
      { pop: { franchise: null, quantity: 2 }, valuation: valuePop(boxedMint, null) },
    ]);
    expect(rows[0]).toMatchObject({ franchise: 'Unattributed', count: 2, unvaluedCount: 1 });
  });
});

describe('formatLiquidity', () => {
  it('flags figures that rarely trade', () => {
    expect(formatLiquidity(2)).toEqual({ label: 'rarely trades · 2/yr', tone: 'warn' });
  });

  it('describes healthy volume without alarm', () => {
    expect(formatLiquidity(60)?.tone).toBe('neutral');
    expect(formatLiquidity(60)?.label).toBe('~weekly sales');
    expect(formatLiquidity(20)?.label).toBe('~monthly sales');
  });

  it('returns nothing when volume is unknown', () => {
    expect(formatLiquidity(null)).toBeNull();
  });
});
