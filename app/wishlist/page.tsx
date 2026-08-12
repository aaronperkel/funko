import { isAuthenticated } from '@/lib/auth';
import { getCollection, toGalleryItem } from '@/lib/queries/collection';
import { priceForTier } from '@/lib/condition';
import { formatCents } from '@/lib/money';
import { Nav } from '@/components/nav';
import { Stat } from '@/components/ui';
import { CollectionView } from '@/components/collection/collection-view';

export const metadata = { title: 'Wishlist' };
export const dynamic = 'force-dynamic';

export default async function WishlistPage() {
  const signedIn = await isAuthenticated();
  const entries = await getCollection({ includePrivate: signedIn });
  const wishlist = entries.filter((entry) => entry.pop.status === 'wishlist');

  /*
   * Acquisition cost is quoted at the `new` tier, not each item's own tier:
   * you are buying these, and you would be buying them mint in box.
   */
  let acquisitionCents = 0;
  let unpriced = 0;

  for (const entry of wishlist) {
    const newTier =
      priceForTier(
        {
          loosePriceCents: entry.valuation.tiers.loose,
          damagedBoxPriceCents: entry.valuation.tiers.damaged_box,
          newPriceCents: entry.valuation.tiers.new,
        },
        'new',
      ) ?? entry.pop.manualValueCents;

    if (newTier === null) unpriced += 1;
    else acquisitionCents += newTier * entry.pop.quantity;
  }

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">
        <header className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight">Wishlist</h1>
          <p className="mt-0.5 text-sm text-muted">
            Figures you don&rsquo;t own yet, costed at the mint-in-box price.
          </p>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Wanted" value={wishlist.length.toString()} />
          <Stat
            label="To acquire"
            value={formatCents(acquisitionCents, '$0.00')}
            hint="At mint-in-box price"
          />
          <Stat
            label="Unpriced"
            value={unpriced.toString()}
            tone={unpriced > 0 ? 'warn' : 'neutral'}
            hint="Not included above"
          />
        </div>

        <CollectionView
          items={wishlist.map(toGalleryItem)}
          showPrivate={signedIn}
          emptyMessage="Nothing on the wishlist. Set a figure's status to wishlist in admin."
        />
      </main>
    </>
  );
}
