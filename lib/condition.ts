import type { Pop, PriceSnapshot } from '@/db/schema';

/**
 * The three prices PriceCharting publishes per Funko figure. Their Funko tables
 * render these as "Out of Box" / "In Dmg Box" / "New Price".
 */
export type ConditionTier = 'loose' | 'damaged_box' | 'new';

export const CONDITION_TIERS = ['loose', 'damaged_box', 'new'] as const;

export type TierInput = Pick<Pop, 'condition' | 'hasBox' | 'boxCondition'>;

/**
 * Maps a figure's recorded condition onto the price tier it should actually be
 * valued at:
 *
 *   loose        -> "Out of Box"  (PriceCharting `loose-price`)
 *   damaged_box  -> "In Dmg Box"  (PriceCharting `cib-price`)
 *   new          -> "New Price"   (PriceCharting `new-price`)
 *
 * Two deliberate rules:
 *
 * 1. The top tier needs an undamaged box AND an undamaged figure. `mint` and
 *    `near_mint` boxes both reach it, because PriceCharting publishes a single
 *    New Price and the market pays it for any box a buyer would call "new in
 *    box" — light shelf wear included. `minor_damage` means visible damage
 *    (creased corner, crushed edge) and drops to the middle tier, which is
 *    literally labelled "In Dmg Box". Ties still break downward: any doubt
 *    about the figure itself costs the top tier.
 * 2. `hasProtector` never affects the tier. A protector preserves future
 *    condition; it does not change what the figure is worth today.
 *
 * Every valuation read path in the app goes through this function.
 */
export function effectiveTier(pop: TierInput): ConditionTier {
  // No box at all: loose, no matter how pristine the figure is.
  if (!pop.hasBox || pop.boxCondition === 'none') return 'loose';

  // Contradictory data (condition=loose but hasBox=true). Trust the figure, value low.
  if (pop.condition === 'loose') return 'loose';

  // A badly damaged box can never reach the top tier.
  if (pop.boxCondition === 'major_damage') return 'damaged_box';

  // A worn figure can't claim the top tier even inside a pristine box.
  if (pop.condition === 'good' || pop.condition === 'fair') return 'damaged_box';

  // Remaining: condition is mint|near_mint, box is mint|near_mint|minor_damage.
  return pop.boxCondition === 'mint' || pop.boxCondition === 'near_mint'
    ? 'new'
    : 'damaged_box';
}

export type TieredPrices = Pick<
  PriceSnapshot,
  'loosePriceCents' | 'damagedBoxPriceCents' | 'newPriceCents'
>;

/** Reads the one price that matches a tier. Returns null when that tier has no data. */
export function priceForTier(prices: TieredPrices, tier: ConditionTier): number | null {
  switch (tier) {
    case 'loose':
      return prices.loosePriceCents ?? null;
    case 'damaged_box':
      return prices.damagedBoxPriceCents ?? null;
    case 'new':
      return prices.newPriceCents ?? null;
  }
}

/** Convenience: the value of a specific figure from a specific snapshot, at its own tier. */
export function valueAtOwnTier(pop: TierInput, prices: TieredPrices): number | null {
  return priceForTier(prices, effectiveTier(pop));
}

const TIER_LABELS: Record<ConditionTier, string> = {
  loose: 'Out of box',
  damaged_box: 'In damaged box',
  new: 'Mint in box',
};

/** PriceCharting's own column headings, for the side-by-side tier table. */
const TIER_SOURCE_LABELS: Record<ConditionTier, string> = {
  loose: 'Out of Box',
  damaged_box: 'In Dmg Box',
  new: 'New Price',
};

export function tierLabel(tier: ConditionTier): string {
  return TIER_LABELS[tier];
}

export function tierSourceLabel(tier: ConditionTier): string {
  return TIER_SOURCE_LABELS[tier];
}
