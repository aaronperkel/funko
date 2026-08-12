import { describe, expect, it } from 'vitest';
import { BOX_CONDITIONS, CONDITIONS, type BoxCondition, type Condition } from '@/db/schema';
import {
  type ConditionTier,
  effectiveTier,
  priceForTier,
  valueAtOwnTier,
} from '@/lib/condition';

/**
 * The expected tier for every (condition x boxCondition) pair when hasBox=true,
 * written out by hand rather than derived, so the test is independent of the
 * implementation instead of restating it.
 *
 *                      box: mint         near_mint       minor_damage    major_damage    none
 */
const WITH_BOX: Record<Condition, Record<BoxCondition, ConditionTier>> = {
  mint:      { mint: 'new',         near_mint: 'new',         minor_damage: 'damaged_box', major_damage: 'damaged_box', none: 'loose' },
  near_mint: { mint: 'new',         near_mint: 'new',         minor_damage: 'damaged_box', major_damage: 'damaged_box', none: 'loose' },
  good:      { mint: 'damaged_box', near_mint: 'damaged_box', minor_damage: 'damaged_box', major_damage: 'damaged_box', none: 'loose' },
  fair:      { mint: 'damaged_box', near_mint: 'damaged_box', minor_damage: 'damaged_box', major_damage: 'damaged_box', none: 'loose' },
  loose:     { mint: 'loose',       near_mint: 'loose',       minor_damage: 'loose',       major_damage: 'loose',       none: 'loose' },
};

describe('effectiveTier — full truth table', () => {
  describe('hasBox = true', () => {
    for (const condition of CONDITIONS) {
      for (const boxCondition of BOX_CONDITIONS) {
        const expected = WITH_BOX[condition][boxCondition];
        it(`${condition} + ${boxCondition} box -> ${expected}`, () => {
          expect(effectiveTier({ condition, hasBox: true, boxCondition })).toBe(expected);
        });
      }
    }
  });

  describe('hasBox = false always collapses to loose', () => {
    for (const condition of CONDITIONS) {
      for (const boxCondition of BOX_CONDITIONS) {
        it(`${condition} + ${boxCondition} (no box) -> loose`, () => {
          expect(effectiveTier({ condition, hasBox: false, boxCondition })).toBe('loose');
        });
      }
    }
  });
});

describe('effectiveTier — stated invariants', () => {
  it('only an undamaged figure in an undamaged box reaches the top tier', () => {
    const newTierCases = CONDITIONS.flatMap((condition) =>
      BOX_CONDITIONS.map((boxCondition) => ({ condition, boxCondition })),
    ).filter(({ condition, boxCondition }) =>
      effectiveTier({ condition, hasBox: true, boxCondition }) === 'new',
    );

    expect(newTierCases).toEqual([
      { condition: 'mint', boxCondition: 'mint' },
      { condition: 'mint', boxCondition: 'near_mint' },
      { condition: 'near_mint', boxCondition: 'mint' },
      { condition: 'near_mint', boxCondition: 'near_mint' },
    ]);
  });

  it('a minor-damage box is still a damaged box (ties break downward)', () => {
    expect(effectiveTier({ condition: 'mint', hasBox: true, boxCondition: 'minor_damage' })).toBe(
      'damaged_box',
    );
  });

  it('resolves the contradictory condition=loose + hasBox=true case downward', () => {
    expect(effectiveTier({ condition: 'loose', hasBox: true, boxCondition: 'mint' })).toBe('loose');
  });

  it('treats boxCondition=none as no box even when hasBox is true', () => {
    expect(effectiveTier({ condition: 'mint', hasBox: true, boxCondition: 'none' })).toBe('loose');
  });

  it('never returns a tier outside the three known tiers', () => {
    for (const condition of CONDITIONS) {
      for (const boxCondition of BOX_CONDITIONS) {
        for (const hasBox of [true, false]) {
          expect(['loose', 'damaged_box', 'new']).toContain(
            effectiveTier({ condition, hasBox, boxCondition }),
          );
        }
      }
    }
  });
});

describe('hasProtector never changes the tier', () => {
  for (const condition of CONDITIONS) {
    for (const boxCondition of BOX_CONDITIONS) {
      it(`${condition} + ${boxCondition} is protector-invariant`, () => {
        // hasProtector is deliberately not part of TierInput; assert that passing
        // it through in either state cannot move the result.
        const withProtector = { condition, hasBox: true, boxCondition, hasProtector: true };
        const withoutProtector = { condition, hasBox: true, boxCondition, hasProtector: false };
        expect(effectiveTier(withProtector)).toBe(effectiveTier(withoutProtector));
      });
    }
  }
});

describe('priceForTier', () => {
  const prices = {
    loosePriceCents: 1200,
    damagedBoxPriceCents: 2450,
    newPriceCents: 3999,
  };

  it('reads the matching column for each tier', () => {
    expect(priceForTier(prices, 'loose')).toBe(1200);
    expect(priceForTier(prices, 'damaged_box')).toBe(2450);
    expect(priceForTier(prices, 'new')).toBe(3999);
  });

  it('returns null for a tier with no data rather than falling back to another tier', () => {
    const partial = { loosePriceCents: 1200, damagedBoxPriceCents: null, newPriceCents: null };
    expect(priceForTier(partial, 'damaged_box')).toBeNull();
    expect(priceForTier(partial, 'new')).toBeNull();
    expect(priceForTier(partial, 'loose')).toBe(1200);
  });

  it('keeps values as integer cents', () => {
    for (const tier of ['loose', 'damaged_box', 'new'] as const) {
      expect(Number.isInteger(priceForTier(prices, tier))).toBe(true);
    }
  });
});

describe('valueAtOwnTier', () => {
  const prices = {
    loosePriceCents: 1200,
    damagedBoxPriceCents: 2450,
    newPriceCents: 3999,
  };

  it('values a boxed mint figure at the new price', () => {
    expect(
      valueAtOwnTier({ condition: 'mint', hasBox: true, boxCondition: 'mint' }, prices),
    ).toBe(3999);
  });

  it('values the same figure out of its box at a third of that', () => {
    expect(
      valueAtOwnTier({ condition: 'mint', hasBox: false, boxCondition: 'none' }, prices),
    ).toBe(1200);
  });

  it('values the seed default (near_mint + minor damage) at the middle tier', () => {
    expect(
      valueAtOwnTier({ condition: 'near_mint', hasBox: true, boxCondition: 'minor_damage' }, prices),
    ).toBe(2450);
  });
});
