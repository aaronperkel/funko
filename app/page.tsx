import Link from 'next/link';
import { isAuthenticated } from '@/lib/auth';
import {
  getBiggestMovers,
  getCollection,
  getValueHistory,
  isPrivateEntry,
  type CollectionEntry,
  type Mover,
} from '@/lib/queries/collection';
import { tierLabel } from '@/lib/condition';
import { franchiseBreakdown, portfolioTotals } from '@/lib/valuation';
import {
  MARKETPLACE_FEE_RATE,
  formatCents,
  formatCentsWhole,
  formatPercent,
  formatSignedCents,
} from '@/lib/money';
import { Nav } from '@/components/nav';
import { Panel, Stat } from '@/components/ui';
import { FranchiseBreakdownChart } from '@/components/charts/franchise-breakdown';
import { ValueHistoryChart } from '@/components/charts/value-history-chart';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const signedIn = await isAuthenticated();
  const entries = await getCollection({ includePrivate: signedIn });
  const history = await getValueHistory();
  const movers = await getBiggestMovers();

  const owned = entries.filter((entry) => entry.pop.status === 'owned');
  const totals = portfolioTotals(owned);
  const franchises = franchiseBreakdown(owned);

  const needingUpc = entries.filter((entry) => entry.pop.upc === null).length;
  const gainTone = totals.gainCents > 0 ? 'gain' : totals.gainCents < 0 ? 'loss' : 'neutral';

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-0.5 text-sm text-muted">
            Every figure valued at the price tier matching its own condition.
          </p>
        </header>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Figures" value={totals.itemCount.toString()} hint={`${totals.uniqueCount} entries`} />
          <Stat label="Current value" value={formatCentsWhole(totals.valueCents)} hint="At each item's tier" />
          {signedIn && (
            <Stat label="Cost basis" value={formatCentsWhole(totals.costBasisCents)} hint="What you paid" />
          )}
          {signedIn && (
            <Stat
              label="Unrealised"
              value={`${formatSignedCents(totals.gainCents)}`}
              tone={gainTone}
              hint={
                totals.gainRatio === null
                  ? 'No cost basis recorded'
                  : `${formatPercent(totals.gainRatio)} on valued items`
              }
            />
          )}
          <Stat
            label="Not yet valued"
            value={totals.unvaluedCount.toString()}
            tone={totals.unvaluedCount > 0 ? 'warn' : 'neutral'}
            hint="No price data"
          />
          <Stat
            label="Needs UPC"
            value={needingUpc.toString()}
            tone={needingUpc > 0 ? 'warn' : 'neutral'}
            hint="Blocks auto-pricing"
          />
        </div>

        <NetIfSold totals={totals} signedIn={signedIn} />

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
          <Panel
            title="Collection value over time"
            description="Assembled from snapshots this app records — one point per weekly refresh."
          >
            {history.length >= 2 ? (
              <ValueHistoryChart data={history} />
            ) : (
              <CollectingData points={history.length} />
            )}
          </Panel>

          <Panel title="By franchise" description="Share of collection value.">
            <FranchiseBreakdownChart rows={franchises} showValue={totals.valueCents > 0} />
          </Panel>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Panel
            title="Biggest movers"
            description="Change since the previous snapshot, at each figure's own tier."
          >
            {movers.length > 0 ? (
              <MoversList movers={movers} />
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted">
                {history.length >= 2
                  ? 'No figure changed price between the last two snapshots.'
                  : 'Needs at least two price snapshots to compare.'}
              </p>
            )}
          </Panel>

          <Panel title="Attention" description="Things blocking an accurate valuation.">
            <AttentionList entries={entries} />
          </Panel>
        </div>
      </main>
    </>
  );
}

/**
 * The gross number flatters the collection. This shows what a sale would
 * actually net, and is placed as the hero figure rather than tucked away.
 */
function NetIfSold({
  totals,
  signedIn,
}: {
  totals: ReturnType<typeof portfolioTotals>;
  signedIn: boolean;
}) {
  const realisedGain = totals.netIfSoldCents - totals.comparableCostCents;

  return (
    <section className="rounded-lg border border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-dim">
            If you sold it all
          </h2>
          <p className="tnum mt-1 text-4xl font-semibold tracking-tight text-foreground">
            {formatCentsWhole(totals.netIfSoldCents)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {totals.valuedItemCount === 0 ? (
              <>Nothing is valued yet, so there is no sale figure to give you.</>
            ) : (
              <>
                Net of {Math.round(MARKETPLACE_FEE_RATE * 100)}% marketplace fees and shipping on{' '}
                {totals.valuedItemCount} valued {totals.valuedItemCount === 1 ? 'item' : 'items'}.
                Gross would be {formatCents(totals.valueCents)}.
                {totals.unvaluedCount > 0 && (
                  <> {totals.unvaluedCount} unvalued {totals.unvaluedCount === 1 ? 'figure is' : 'figures are'} excluded.</>
                )}
              </>
            )}
          </p>
        </div>

        {signedIn && totals.comparableCostCents > 0 && (
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-wider text-dim">
              Against cost
            </div>
            <p
              className={`tnum mt-1 text-xl font-semibold ${
                realisedGain >= 0 ? 'text-gain' : 'text-loss'
              }`}
            >
              {formatSignedCents(realisedGain)}
            </p>
            <p className="mt-0.5 text-xs text-muted">after fees</p>
          </div>
        )}
      </div>
    </section>
  );
}

function CollectingData({ points }: { points: number }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-foreground">Collecting data</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-muted">
        PriceCharting publishes current prices only — it serves no history. Every point on this
        chart is one this app records, so the line fills in weekly from the first refresh onward.
      </p>
      <p className="mt-2 text-xs text-dim">
        {points === 0 ? 'No snapshots recorded yet.' : '1 snapshot so far — 2 needed to draw a line.'}
      </p>
    </div>
  );
}

/**
 * Movement is compared at each figure's own tier, so a mint-in-box price spike
 * does not show up as a gain on the loose one sitting on the shelf. The sign is
 * explicit on every row — colour is the redundant channel here, never the only
 * one carrying the meaning.
 */
function MoversList({ movers }: { movers: Mover[] }) {
  return (
    <ul className="divide-y divide-border">
      {movers.map((mover) => (
        <li key={mover.id} className="flex items-center justify-between gap-3 px-4 py-2">
          <div className="min-w-0">
            <Link
              href={`/pop/${mover.id}`}
              className="block truncate text-xs font-medium text-foreground hover:text-accent"
            >
              {mover.name}
            </Link>
            <div className="text-[10px] text-dim">
              {tierLabel(mover.tier)} · {formatCents(mover.previousCents)} →{' '}
              {formatCents(mover.currentCents)}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className={`tnum text-sm font-semibold ${
                mover.changeCents > 0 ? 'text-gain' : 'text-loss'
              }`}
            >
              {formatSignedCents(mover.changeCents)}
            </div>
            {mover.changeRatio !== null && (
              <div className="tnum text-[10px] text-dim">{formatPercent(mover.changeRatio)}</div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AttentionList({ entries }: { entries: CollectionEntry[] }) {
  const ambiguous = entries.filter((entry) => entry.pop.needsDisambiguation);
  const noUpc = entries.filter((entry) => entry.pop.upc === null);
  const unvalued = entries.filter(
    (entry) => entry.pop.status === 'owned' && entry.valuation.totalValueCents === null,
  );
  const withCost = entries.filter((entry) => isPrivateEntry(entry) && entry.gain !== null);

  const rows = [
    {
      label: 'Ambiguous names',
      count: ambiguous.length,
      detail: 'Multiple figures share these titles — the wrong match gives a wrong value.',
    },
    {
      label: 'Missing a UPC',
      count: noUpc.length,
      detail: 'Cannot be matched automatically until a UPC is filled in.',
    },
    {
      label: 'No valuation',
      count: unvalued.length,
      detail: 'No manual value and no price data yet.',
    },
    {
      label: 'Have a cost basis',
      count: withCost.length,
      detail: 'Gain/loss can only be computed for these.',
      invert: true,
    },
  ];

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => (
        <li key={row.label} className="flex items-start justify-between gap-4 px-4 py-2.5">
          <div>
            <div className="text-xs font-medium text-foreground">{row.label}</div>
            <div className="text-[11px] text-dim">{row.detail}</div>
          </div>
          <span
            className={`tnum shrink-0 text-sm font-semibold ${
              row.count === 0 || row.invert ? 'text-muted' : 'text-warn'
            }`}
          >
            {row.count}
          </span>
        </li>
      ))}
      <li className="px-4 py-2.5">
        <Link href="/admin" className="text-xs text-accent hover:underline">
          Fix these in admin →
        </Link>
      </li>
    </ul>
  );
}
