import type { Source } from '@/db/schema';
import { effectiveTier } from '@/lib/condition';
import { EbayBrowseProvider } from '@/lib/pricing/ebay';
import { ManualProvider } from '@/lib/pricing/manual';
import { PriceChartingProvider } from '@/lib/pricing/pricecharting';
import type { PriceProvider, QuotableFields, Quote } from '@/lib/pricing/provider';

/**
 * Provider precedence, highest first.
 *
 * `ebay_active` is deliberately absent. It is not a lower-priority value — it
 * is not a value at all, only a labelled asking-price cross-check, and letting
 * it fall through to the bottom of this list is exactly how it would end up
 * silently pricing something.
 */
export const VALUE_PRECEDENCE: readonly Source[] = ['manual', 'pricecharting'] as const;

export type Providers = {
  manual: ManualProvider;
  priceCharting: PriceChartingProvider;
  ebay: EbayBrowseProvider;
};

export function createProviders(): Providers {
  return {
    manual: new ManualProvider(),
    priceCharting: new PriceChartingProvider(),
    ebay: new EbayBrowseProvider(),
  };
}

export type ProviderStatus = {
  id: Source;
  label: string;
  configured: boolean;
};

/** Powers the provider list in /admin, so a missing key is visible, not mysterious. */
export function providerStatuses(providers: Providers = createProviders()): ProviderStatus[] {
  return [providers.manual, providers.priceCharting, providers.ebay].map(
    (provider: PriceProvider) => ({
      id: provider.id,
      label: provider.label,
      configured: provider.isConfigured(),
    }),
  );
}

/**
 * Picks the quote that should actually price a figure, at the figure's own
 * tier.
 *
 * The render path uses `valuePop` against stored snapshots rather than this —
 * different inputs, same rule — and a test asserts the two agree, because two
 * implementations of "which number is the value" that disagree is precisely
 * the bug this whole app exists to avoid.
 */
export function resolveValueQuote(
  pop: QuotableFields,
  quotes: ReadonlyArray<Quote>,
): { quote: Quote; unitValueCents: number } | null {
  const tier = effectiveTier(pop);

  for (const source of VALUE_PRECEDENCE) {
    for (const quote of quotes) {
      if (quote.source !== source) continue;
      // Belt and braces: an asking price can never become a value.
      if (quote.askingPriceOnly) continue;

      const price = quote.prices[tier];
      if (typeof price === 'number') return { quote, unitValueCents: price };
    }
  }

  return null;
}
