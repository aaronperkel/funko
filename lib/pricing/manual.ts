import { effectiveTier } from '@/lib/condition';
import type { PriceProvider, ProviderResult, QuotableFields } from '@/lib/pricing/provider';

/**
 * Your own appraisal, expressed as a provider so it sits in the same
 * precedence chain as everything else.
 *
 * Always registered and always highest precedence: a manual value beats any
 * API outright. It needs no credentials and makes no network call, which is
 * what lets a deployment with zero API keys still be a working dashboard.
 *
 * Deliberately never written to `price_snapshots`. The value already lives on
 * the pop row, and recording it as a "quote" would pollute the price history
 * with a number the market never said.
 */
export class ManualProvider implements PriceProvider {
  readonly id = 'manual' as const;
  readonly label = 'Your appraisal';

  private readonly now: () => Date;

  constructor(options: { now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  isConfigured(): boolean {
    return true;
  }

  async fetchQuote(pop: QuotableFields): Promise<ProviderResult> {
    if (pop.manualValueCents === null) return { ok: true, quote: null };

    /*
     * A manual value is an appraisal of *this* figure as it actually is, so it
     * applies to the figure's own tier and says nothing about the other two.
     */
    const tier = effectiveTier(pop);

    return {
      ok: true,
      quote: {
        prices: { [tier]: pop.manualValueCents },
        source: 'manual',
        capturedAt: this.now().toISOString(),
        askingPriceOnly: false,
      },
    };
  }
}
