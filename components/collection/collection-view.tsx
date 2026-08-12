'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CONDITIONS, STATUSES, VARIANTS } from '@/db/schema';
import { tierLabel } from '@/lib/condition';
import { formatCents, formatPercent, formatSignedCents } from '@/lib/money';
import { formatLiquidity } from '@/lib/valuation';
import { Badge } from '@/components/ui';

/**
 * Serialisable shape handed to the client. Cost-basis fields are simply absent
 * when the reader is logged out — the server never puts them in this payload.
 */
export type GalleryItem = {
  id: string;
  name: string;
  line: string | null;
  franchise: string | null;
  itemNumber: number | null;
  upc: string | null;
  variant: string;
  exclusiveTo: string | null;
  condition: string;
  hasBox: boolean;
  boxCondition: string;
  status: string;
  quantity: number;
  imageUrl: string | null;
  needsDisambiguation: boolean;
  createdAt: string;
  tier: string;
  valueCents: number | null;
  valueSource: string | null;
  salesVolumeYearly: number | null;
  purchasePriceCents?: number | null;
  gainCents?: number | null;
  gainRatio?: number | null;
};

type SortKey = 'name' | 'number' | 'value' | 'gain' | 'added';

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'added', label: 'Date added' },
  { key: 'name', label: 'Name' },
  { key: 'number', label: 'Item number' },
  { key: 'value', label: 'Value' },
  { key: 'gain', label: 'Gain/loss' },
];

export function CollectionView({
  items,
  showPrivate,
  emptyMessage,
}: {
  items: GalleryItem[];
  showPrivate: boolean;
  emptyMessage: string;
}) {
  const [query, setQuery] = useState('');
  const [franchise, setFranchise] = useState('');
  const [line, setLine] = useState('');
  const [variant, setVariant] = useState('');
  const [condition, setCondition] = useState('');
  const [boxFilter, setBoxFilter] = useState('');
  const [status, setStatus] = useState('');
  const [needsUpcOnly, setNeedsUpcOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('added');
  const [compact, setCompact] = useState(false);

  const franchises = useMemo(() => uniqueValues(items.map((i) => i.franchise)), [items]);
  const lines = useMemo(() => uniqueValues(items.map((i) => i.line)), [items]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const result = items.filter((item) => {
      if (needle) {
        const haystack = [item.name, item.franchise, item.line]
          .filter((value): value is string => typeof value === 'string')
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (franchise && item.franchise !== franchise) return false;
      if (line && item.line !== line) return false;
      if (variant && item.variant !== variant) return false;
      if (condition && item.condition !== condition) return false;
      if (status && item.status !== status) return false;
      if (needsUpcOnly && item.upc !== null) return false;
      if (boxFilter === 'has' && !item.hasBox) return false;
      if (boxFilter === 'none' && item.hasBox) return false;
      return true;
    });

    return result.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'number':
          return (a.itemNumber ?? Infinity) - (b.itemNumber ?? Infinity);
        case 'value':
          return (b.valueCents ?? -1) - (a.valueCents ?? -1);
        case 'gain':
          return (b.gainCents ?? -Infinity) - (a.gainCents ?? -Infinity);
        case 'added':
          return b.createdAt.localeCompare(a.createdAt);
      }
    });
  }, [items, query, franchise, line, variant, condition, boxFilter, status, needsUpcOnly, sort]);

  const activeFilters =
    Boolean(query || franchise || line || variant || condition || boxFilter || status) ||
    needsUpcOnly;

  return (
    <div className="space-y-3">
      {/* Filters in one row above the content. */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, franchise, line…"
          className="min-w-52 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-dim focus:border-accent"
        />
        <FilterSelect value={franchise} onChange={setFranchise} label="Franchise" options={franchises} />
        <FilterSelect value={line} onChange={setLine} label="Line" options={lines} />
        <FilterSelect value={variant} onChange={setVariant} label="Variant" options={[...VARIANTS]} />
        <FilterSelect value={condition} onChange={setCondition} label="Condition" options={[...CONDITIONS]} />
        <FilterSelect
          value={boxFilter}
          onChange={setBoxFilter}
          label="Box"
          options={['has', 'none']}
          labels={{ has: 'Has box', none: 'No box' }}
        />
        <FilterSelect value={status} onChange={setStatus} label="Status" options={[...STATUSES]} />

        <button
          type="button"
          onClick={() => setNeedsUpcOnly(!needsUpcOnly)}
          aria-pressed={needsUpcOnly}
          className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
            needsUpcOnly
              ? 'border-warn/50 bg-warn/10 text-warn'
              : 'border-border text-muted hover:bg-surface-hover'
          }`}
        >
          Needs UPC
        </button>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
        >
          {SORTS.map((option) => (
            <option key={option.key} value={option.key}>
              Sort: {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setCompact(!compact)}
          className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-surface-hover"
        >
          {compact ? 'Grid' : 'Table'}
        </button>
      </div>

      <p className="text-[11px] text-dim">
        {filtered.length} of {items.length} shown
        {activeFilters && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setFranchise('');
              setLine('');
              setVariant('');
              setCondition('');
              setBoxFilter('');
              setStatus('');
              setNeedsUpcOnly(false);
            }}
            className="ml-2 text-accent hover:underline"
          >
            Clear filters
          </button>
        )}
      </p>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-12 text-center">
          <p className="text-sm font-medium">
            {items.length === 0 ? emptyMessage : 'Nothing matches those filters.'}
          </p>
        </div>
      ) : compact ? (
        <CompactTable items={filtered} showPrivate={showPrivate} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((item) => (
            <Card key={item.id} item={item} showPrivate={showPrivate} />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ item, showPrivate }: { item: GalleryItem; showPrivate: boolean }) {
  const isChase = item.variant === 'chase';
  const liquidity = formatLiquidity(item.salesVolumeYearly);

  return (
    <Link
      href={`/pop/${item.id}`}
      className={`group flex flex-col overflow-hidden rounded-lg border bg-surface transition-colors hover:bg-surface-hover ${
        isChase ? 'border-chase/60' : 'border-border'
      }`}
    >
      {/* Photos are the hero element — chrome stays out of the way. */}
      <div className="relative aspect-square w-full bg-surface-raised">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.name}
            fill
            unoptimized
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-wider text-dim">
            no photo
          </div>
        )}

        <div className="absolute left-1.5 top-1.5 flex flex-wrap gap-1">
          {isChase && <Badge tone="chase">chase</Badge>}
          {item.exclusiveTo && <Badge tone="exclusive">{item.exclusiveTo}</Badge>}
          {item.needsDisambiguation && <Badge tone="warn">ambiguous</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-xs font-medium leading-snug text-foreground">
            {item.name}
          </span>
          <span className="tnum shrink-0 text-[11px] text-dim">
            {item.itemNumber ?? '—'}
          </span>
        </div>

        <span className="text-[10px] text-dim">{item.line ?? item.franchise ?? ''}</span>

        <div className="mt-auto pt-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="tnum text-sm font-semibold text-foreground">
              {formatCents(item.valueCents)}
            </span>
            {showPrivate && item.gainCents != null && (
              <span
                className={`tnum text-[11px] font-medium ${
                  item.gainCents >= 0 ? 'text-gain' : 'text-loss'
                }`}
              >
                {formatSignedCents(item.gainCents)}
              </span>
            )}
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-2">
            <span className="text-[10px] text-dim">{tierLabel(item.tier as never)}</span>
            {item.valueCents === null && (
              <span className="text-[10px] text-warn">no data</span>
            )}
          </div>

          {liquidity && (
            <div className={`mt-0.5 text-[10px] ${liquidity.tone === 'warn' ? 'text-warn' : 'text-dim'}`}>
              {liquidity.label}
            </div>
          )}

          {showPrivate && item.purchasePriceCents != null && (
            <div className="mt-0.5 text-[10px] text-dim">
              paid {formatCents(item.purchasePriceCents)}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function CompactTable({ items, showPrivate }: { items: GalleryItem[]; showPrivate: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wider text-dim">
            <th className="px-3 py-2 font-medium">Figure</th>
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 font-medium">Franchise</th>
            <th className="px-3 py-2 font-medium">Tier</th>
            <th className="px-3 py-2 text-right font-medium">Value</th>
            {showPrivate && <th className="px-3 py-2 text-right font-medium">Cost</th>}
            {showPrivate && <th className="px-3 py-2 text-right font-medium">Gain/loss</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border/60 hover:bg-surface-hover">
              <td className="px-3 py-1.5">
                <Link href={`/pop/${item.id}`} className="flex items-center gap-1.5 hover:underline">
                  <span className="font-medium">{item.name}</span>
                  {item.variant === 'chase' && <Badge tone="chase">chase</Badge>}
                  {!item.upc && <Badge tone="warn">needs UPC</Badge>}
                </Link>
              </td>
              <td className="tnum px-3 py-1.5 text-muted">{item.itemNumber ?? '—'}</td>
              <td className="px-3 py-1.5 text-muted">{item.franchise ?? '—'}</td>
              <td className="px-3 py-1.5 text-[11px] text-muted">
                {tierLabel(item.tier as never)}
              </td>
              <td className="tnum px-3 py-1.5 text-right">{formatCents(item.valueCents)}</td>
              {showPrivate && (
                <td className="tnum px-3 py-1.5 text-right text-muted">
                  {formatCents(item.purchasePriceCents)}
                </td>
              )}
              {showPrivate && (
                <td
                  className={`tnum px-3 py-1.5 text-right ${
                    item.gainCents == null
                      ? 'text-dim'
                      : item.gainCents >= 0
                        ? 'text-gain'
                        : 'text-loss'
                  }`}
                >
                  {item.gainCents == null ? '—' : formatSignedCents(item.gainCents)}
                  {item.gainRatio != null && (
                    <span className="ml-1 text-[10px] text-dim">
                      {formatPercent(item.gainRatio)}
                    </span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  options: string[];
  labels?: Record<string, string>;
}) {
  if (options.length === 0) return null;

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`rounded-md border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent ${
        value ? 'border-accent/50 text-foreground' : 'border-border text-muted'
      }`}
    >
      <option value="">{label}</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {labels?.[option] ?? option.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}

function uniqueValues(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}
