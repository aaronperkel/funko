import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { getPopEntry, isPrivateEntry } from '@/lib/queries/collection';
import { tierLabel } from '@/lib/condition';
import { formatCents, formatPercent, formatSignedCents } from '@/lib/money';
import { formatLiquidity } from '@/lib/valuation';
import { Nav } from '@/components/nav';
import { Badge, Panel } from '@/components/ui';
import { TierComparison } from '@/components/pop/tier-comparison';
import { InlineEditor } from '@/components/pop/inline-editor';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const result = await getPopEntry(id, { includePrivate: false });
  return { title: result ? result.entry.pop.name : 'Not found' };
}

export default async function PopDetailPage({ params }: Props) {
  const { id } = await params;
  const signedIn = await isAuthenticated();

  const result = await getPopEntry(id, { includePrivate: signedIn });
  if (!result) notFound();

  const { entry, snapshots } = result;
  const { pop, valuation, gain } = entry;
  const liquidity = formatLiquidity(valuation.salesVolumeYearly);

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">
        <Link href="/collection" className="text-xs text-muted hover:text-foreground">
          ← Collection
        </Link>

        <header className="mb-5 mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{pop.name}</h1>
              {pop.variant === 'chase' && <Badge tone="chase">chase</Badge>}
              {pop.exclusiveTo && <Badge tone="exclusive">{pop.exclusiveTo}</Badge>}
              {pop.isVaulted && <Badge>vaulted</Badge>}
              {pop.needsDisambiguation && (
                <Badge tone="warn" title="Multiple figures share this name">
                  ambiguous
                </Badge>
              )}
              {!pop.upc && <Badge tone="warn">needs UPC</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted">
              {[pop.line, pop.franchise, pop.itemNumber ? `#${pop.itemNumber}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dim">
              Value at your tier
            </div>
            <div className="tnum text-3xl font-semibold tracking-tight">
              {formatCents(valuation.totalValueCents)}
            </div>
            <div className="text-xs text-muted">
              {tierLabel(valuation.tier)}
              {valuation.source && ` · ${sourceLabel(valuation.source)}`}
            </div>
            {liquidity && (
              <div className={`text-xs ${liquidity.tone === 'warn' ? 'text-warn' : 'text-dim'}`}>
                {liquidity.label}
              </div>
            )}
          </div>
        </header>

        <div className="grid gap-3 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-surface-raised">
              {pop.imageUrl ? (
                <Image
                  src={pop.imageUrl}
                  alt={pop.name}
                  fill
                  unoptimized
                  sizes="320px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs uppercase tracking-wider text-dim">
                  no photo
                </div>
              )}
            </div>

            {signedIn && isPrivateEntry(entry) && (
              <Panel title="Your position">
                <dl className="divide-y divide-border text-xs">
                  <DetailRow label="Paid" value={formatCents(entry.pop.purchasePriceCents)} />
                  <DetailRow label="Purchased" value={entry.pop.purchaseDate ?? '—'} />
                  <DetailRow label="Source" value={entry.pop.purchaseSource ?? '—'} />
                  <DetailRow label="Acquired as" value={entry.pop.acquiredAs} />
                  <div className="flex items-center justify-between px-4 py-2">
                    <dt className="text-dim">Unrealised</dt>
                    <dd
                      className={`tnum font-medium ${
                        gain === null
                          ? 'text-dim'
                          : gain.gainCents >= 0
                            ? 'text-gain'
                            : 'text-loss'
                      }`}
                    >
                      {gain === null ? '—' : formatSignedCents(gain.gainCents)}
                      {gain?.gainRatio != null && (
                        <span className="ml-1 text-[10px] text-dim">
                          {formatPercent(gain.gainRatio)}
                        </span>
                      )}
                    </dd>
                  </div>
                </dl>
              </Panel>
            )}

            <Panel title="Look it up yourself">
              <div className="space-y-1.5 px-4 py-3 text-xs">
                <a
                  href={priceChartingUrl(pop.priceChartingId, pop.name, pop.franchise)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block text-accent hover:underline"
                >
                  PriceCharting page →
                </a>
                <a
                  href={ebaySoldUrl(pop.name, pop.itemNumber)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block text-accent hover:underline"
                >
                  eBay sold listings →
                </a>
                <p className="pt-1 text-[10px] text-dim">
                  Eyeball the comps rather than trusting one number.
                </p>
              </div>
            </Panel>
          </div>

          <div className="space-y-3">
            <Panel
              title="All three price tiers"
              description="What this figure is worth loose, in a damaged box, and mint in box."
            >
              <TierComparison
                tier={valuation.tier}
                tiers={valuation.tiers}
                manualValueCents={pop.manualValueCents}
              />
            </Panel>

            {signedIn ? (
              <Panel title="Details" description="Edit inline — changes save immediately.">
                <InlineEditor pop={pop} />
              </Panel>
            ) : (
              <Panel title="Details">
                <dl className="grid grid-cols-2 divide-x divide-y divide-border text-xs sm:grid-cols-3">
                  <DetailCell label="Condition" value={pop.condition.replace(/_/g, ' ')} />
                  <DetailCell label="Box" value={pop.boxCondition.replace(/_/g, ' ')} />
                  <DetailCell label="Boxed" value={pop.hasBox ? 'yes' : 'no'} />
                  <DetailCell label="Protector" value={pop.hasProtector ? 'yes' : 'no'} />
                  <DetailCell label="Variant" value={pop.variant} />
                  <DetailCell label="Quantity" value={pop.quantity.toString()} />
                  <DetailCell label="Status" value={pop.status} />
                  <DetailCell label="Released" value={pop.releaseYear?.toString() ?? '—'} />
                  <DetailCell label="UPC" value={pop.upc ?? '—'} />
                </dl>
              </Panel>
            )}

            <Panel
              title="Price history"
              description="Snapshots this app has recorded for this figure."
            >
              {snapshots.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-foreground">No snapshots yet</p>
                  <p className="mx-auto mt-1 max-w-md text-xs text-muted">
                    PriceCharting serves current prices only, so history starts accumulating from
                    the first refresh. Automatic pricing arrives in phase 4.
                  </p>
                </div>
              ) : (
                <SnapshotTable snapshots={snapshots} />
              )}
            </Panel>

            {pop.notes && (
              <Panel title="Notes">
                <p className="whitespace-pre-wrap px-4 py-3 text-xs text-muted">{pop.notes}</p>
              </Panel>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function SnapshotTable({
  snapshots,
}: {
  snapshots: Array<{
    id: string;
    source: string;
    capturedAt: string;
    loosePriceCents: number | null;
    damagedBoxPriceCents: number | null;
    newPriceCents: number | null;
    salesVolumeYearly: number | null;
  }>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wider text-dim">
            <th className="px-4 py-2 font-medium">Captured</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 text-right font-medium">Out of box</th>
            <th className="px-3 py-2 text-right font-medium">In dmg box</th>
            <th className="px-3 py-2 text-right font-medium">New</th>
            <th className="px-4 py-2 text-right font-medium">Volume</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((snapshot) => (
            <tr key={snapshot.id} className="border-b border-border/60">
              <td className="px-4 py-1.5 text-muted">{snapshot.capturedAt.slice(0, 10)}</td>
              <td className="px-3 py-1.5">
                {snapshot.source === 'ebay_active' ? (
                  <span className="text-warn" title="Asking prices, not completed sales">
                    eBay asking
                  </span>
                ) : (
                  <span className="text-muted">{sourceLabel(snapshot.source)}</span>
                )}
              </td>
              <td className="tnum px-3 py-1.5 text-right">
                {formatCents(snapshot.loosePriceCents)}
              </td>
              <td className="tnum px-3 py-1.5 text-right">
                {formatCents(snapshot.damagedBoxPriceCents)}
              </td>
              <td className="tnum px-3 py-1.5 text-right">
                {formatCents(snapshot.newPriceCents)}
              </td>
              <td className="tnum px-4 py-1.5 text-right text-dim">
                {snapshot.salesVolumeYearly ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <dt className="text-dim">{label}</dt>
      <dd className="tnum text-foreground">{value}</dd>
    </div>
  );
}

function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-dim">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}

function sourceLabel(source: string): string {
  if (source === 'pricecharting') return 'PriceCharting';
  if (source === 'ebay_active') return 'eBay asking';
  if (source === 'manual') return 'your value';
  return source;
}

function priceChartingUrl(
  priceChartingId: string | null,
  name: string,
  franchise: string | null,
): string {
  if (priceChartingId) return `https://www.pricecharting.com/game/${priceChartingId}`;
  const query = [name, franchise, 'funko pop'].filter(Boolean).join(' ');
  return `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=prices`;
}

function ebaySoldUrl(name: string, itemNumber: number | null): string {
  const query = ['funko pop', name, itemNumber ? `${itemNumber}` : null]
    .filter(Boolean)
    .join(' ');
  // LH_Sold=1 & LH_Complete=1 restrict to completed sales, not active listings.
  return `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
}
