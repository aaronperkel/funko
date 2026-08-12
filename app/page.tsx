import Link from 'next/link';
import { listPops, summarise } from '@/lib/queries/pops';
import { isAuthenticated } from '@/lib/auth';
import { Stat } from '@/components/ui';

export const dynamic = 'force-dynamic';

/**
 * Placeholder overview. The real dashboard — KPIs, value history, franchise
 * breakdown, biggest movers — is phase 3; this exists so the route is not the
 * create-next-app template while the admin side is being built.
 */
export default async function HomePage() {
  const pops = await listPops();
  const counts = summarise(pops);
  const signedIn = await isAuthenticated();

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Collection</h1>
        <p className="mt-1 text-sm text-muted">
          Funko Pop collection dashboard and value tracker.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Figures" value={counts.total.toString()} />
        <Stat label="Owned" value={counts.owned.toString()} />
        <Stat label="Wishlist" value={counts.wishlist.toString()} />
        <Stat
          label="Needs UPC"
          value={counts.needingUpc.toString()}
          tone={counts.needingUpc > 0 ? 'warn' : 'neutral'}
        />
      </div>

      <div className="mt-8 rounded-lg border border-border bg-surface px-4 py-4">
        <h2 className="text-sm font-semibold">Not built yet</h2>
        <p className="mt-1 text-xs text-muted">
          The gallery, per-figure detail, and value history land in phase 3. Pricing lands in
          phase 4 — until then every figure is valued from its manual value only.
        </p>
        <Link
          href={signedIn ? '/admin' : '/login'}
          className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
        >
          {signedIn ? 'Go to admin' : 'Sign in'}
        </Link>
      </div>
    </main>
  );
}
