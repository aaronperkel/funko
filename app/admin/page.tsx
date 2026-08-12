import { desc } from 'drizzle-orm';
import { getDb } from '@/db';
import { cronRuns } from '@/db/schema';
import { env } from '@/lib/env';
import { listPops, summarise } from '@/lib/queries/pops';
import { listPendingReview } from '@/lib/pricing/refresh';
import { createProviders, providerStatuses } from '@/lib/pricing/registry';
import { Panel, Stat } from '@/components/ui';
import { ImportExport } from '@/components/admin/import-export';
import { PopTable } from '@/components/admin/pop-table';
import { RefreshPrices } from '@/components/admin/refresh-prices';
import { ReviewQueue } from '@/components/admin/review-queue';
import { LogoutButton } from './logout-button';

export const metadata = { title: 'Admin · Collection' };

/** Admin reads must never be cached — this page is the source of truth while editing. */
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const pops = await listPops();
  const counts = summarise(pops);

  const [lastRun] = await getDb()
    .select()
    .from(cronRuns)
    .orderBy(desc(cronRuns.startedAt))
    .limit(1);

  const providers = createProviders();
  const statuses = providerStatuses(providers);
  const pricingConfigured = providers.priceCharting.isConfigured();
  const queued = await listPendingReview();

  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
          <p className="mt-0.5 text-sm text-muted">
            Add, correct, and bulk-edit the collection.
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Figures" value={counts.total.toString()} />
        <Stat label="Owned" value={counts.owned.toString()} />
        <Stat label="Wishlist" value={counts.wishlist.toString()} />
        <Stat label="Sold" value={counts.sold.toString()} />
        <Stat
          label="Needs UPC"
          value={counts.needingUpc.toString()}
          tone={counts.needingUpc > 0 ? 'warn' : 'neutral'}
          hint="Cannot auto-price"
        />
        <Stat
          label="Ambiguous"
          value={counts.needingDisambiguation.toString()}
          tone={counts.needingDisambiguation > 0 ? 'warn' : 'neutral'}
          hint="Name matches many figures"
        />
      </div>

      <div className="mb-6 grid gap-3 lg:grid-cols-2">
        <Panel title="Import / export" description="Round-trip the collection through a spreadsheet.">
          <ImportExport />
        </Panel>

        <Panel title="Pricing" description="Sources available to this deployment.">
          <div className="space-y-2 px-4 py-3 text-xs">
            {statuses.map((status) => (
              <ProviderRow
                key={status.id}
                name={status.label}
                detail={providerDetail(status.id, status.configured, counts)}
                available={status.configured}
              />
            ))}
            <ProviderRow
              name="Photo uploads"
              detail={env.blobToken ? 'Blob token configured' : 'No BLOB_READ_WRITE_TOKEN'}
              available={Boolean(env.blobToken)}
            />

            <div className="mt-3 border-t border-border pt-2 text-[11px] text-dim">
              {lastRun ? (
                <>
                  Last refresh {new Date(lastRun.startedAt).toLocaleString()} — {lastRun.status},{' '}
                  {lastRun.popsProcessed} checked, {lastRun.popsFailed} failed.
                  {lastRun.notes && <span className="block">{lastRun.notes}</span>}
                </>
              ) : (
                <>
                  No refresh has run yet. The cron runs weekly on Vercel; the buttons below run
                  it now.
                </>
              )}
            </div>
          </div>

          <div className="border-t border-border">
            <RefreshPrices configured={pricingConfigured} />
          </div>
        </Panel>
      </div>

      <Panel
        className="mb-6"
        title={`Match review${queued.length > 0 ? ` · ${queued.length}` : ''}`}
        description="Matches this app would not price on its own. A wrong match writes a wrong price that nothing would ever catch, so these wait for you."
      >
        <ReviewQueue pops={queued} />
      </Panel>

      <PopTable pops={pops} />
    </main>
  );
}

/** Says what each provider's state actually means for the collection. */
function providerDetail(
  id: string,
  configured: boolean,
  counts: { withManualValue: number; total: number },
): string {
  if (id === 'manual') {
    return `${counts.withManualValue} of ${counts.total} figures have one — always wins`;
  }
  if (id === 'pricecharting') {
    return configured
      ? 'Token configured — three tiers per figure'
      : 'No PRICECHARTING_API_TOKEN — manual values only';
  }
  return configured
    ? 'Configured — asking prices only, never a valuation'
    : 'No eBay credentials — optional cross-check disabled';
}

function ProviderRow({
  name,
  detail,
  available,
}: {
  name: string;
  detail: string;
  available: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-medium text-foreground">{name}</div>
        <div className="text-[11px] text-dim">{detail}</div>
      </div>
      <span
        className={`mt-0.5 size-2 shrink-0 rounded-full ${
          available ? 'bg-gain' : 'bg-dim'
        }`}
        aria-label={available ? 'available' : 'not configured'}
      />
    </div>
  );
}
