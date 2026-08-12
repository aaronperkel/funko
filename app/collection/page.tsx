import { isAuthenticated } from '@/lib/auth';
import { getCollection, toGalleryItem } from '@/lib/queries/collection';
import { Nav } from '@/components/nav';
import { CollectionView } from '@/components/collection/collection-view';

export const metadata = { title: 'Collection' };
export const dynamic = 'force-dynamic';

export default async function CollectionPage() {
  const signedIn = await isAuthenticated();
  const entries = await getCollection({ includePrivate: signedIn });
  const items = entries.map(toGalleryItem);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">
        <header className="mb-4">
          <h1 className="text-xl font-semibold tracking-tight">Collection</h1>
          <p className="mt-0.5 text-sm text-muted">
            {items.length} entries. Each value is the price for that figure&rsquo;s own condition
            tier.
          </p>
        </header>

        <CollectionView
          items={items}
          showPrivate={signedIn}
          emptyMessage="No figures yet — add some in admin."
        />
      </main>
    </>
  );
}
