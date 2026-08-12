'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  BOX_CONDITIONS,
  CONDITIONS,
  STATUSES,
  type BoxCondition,
  type Condition,
  type Pop,
  type Status,
} from '@/db/schema';
import { effectiveTier, tierLabel } from '@/lib/condition';
import { apiFetch } from '@/lib/client-api';
import { looksLikeFunkoUpc, normaliseUpc } from '@/lib/upc';
import { formatCents } from '@/lib/money';
import { Badge } from '@/components/ui';
import { PopForm } from './pop-form';

/**
 * The bulk-edit surface. Two ways to correct data fast:
 *   - change a single row's condition inline, which saves immediately
 *   - select many rows and apply one change to all of them
 *
 * The tier column recomputes locally as you edit so the consequence of a
 * change is visible before the page revalidates.
 */
export function PopTable({ pops }: { pops: Pop[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [editing, setEditing] = useState<Pop | null>(null);
  const [adding, setAdding] = useState(false);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return pops;
    return pops.filter((pop) =>
      [pop.name, pop.line, pop.franchise, pop.notes]
        .filter((field): field is string => typeof field === 'string')
        .some((field) => field.toLowerCase().includes(needle)),
    );
  }, [pops, query]);

  const allVisibleSelected = visible.length > 0 && visible.every((pop) => selected.has(pop.id));

  function toggleAll() {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((pop) => pop.id)));
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function patchOne(id: string, patch: Record<string, unknown>) {
    setBusyIds(new Set([...busyIds, id]));
    setError(null);

    const result = await apiFetch(`/api/pops/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });

    if (!result.ok) setError(result.error);
    else router.refresh();

    setBusyIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  async function applyBulk(patch: Record<string, unknown>) {
    if (selected.size === 0) return;
    setError(null);

    const result = await apiFetch<{ updated: number }>('/api/pops/bulk', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [...selected], patch }),
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSelected(new Set());
    router.refresh();
  }

  async function remove(pop: Pop) {
    if (!confirm(`Delete "${pop.name}"? This also deletes its price history.`)) return;
    setError(null);

    const result = await apiFetch(`/api/pops/${pop.id}`, { method: 'DELETE' });
    if (!result.ok) setError(result.error);
    else router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name, franchise, notes…"
          className="min-w-56 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm outline-none placeholder:text-dim focus:border-accent"
        />
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-background hover:opacity-90"
        >
          Add figure
        </button>
      </div>

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          onApply={applyBulk}
          onClear={() => setSelected(new Set())}
        />
      )}

      {error && (
        <p role="alert" className="rounded border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
          {error}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[1000px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-[11px] uppercase tracking-wider text-dim">
              <th className="w-8 px-2 py-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                  className="size-3.5 accent-[var(--accent)]"
                />
              </th>
              <th className="px-2 py-2 font-medium">Figure</th>
              <th className="px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">UPC</th>
              <th className="px-2 py-2 font-medium">Condition</th>
              <th className="px-2 py-2 font-medium">Box</th>
              <th className="px-2 py-2 text-center font-medium">Boxed</th>
              <th className="px-2 py-2 text-center font-medium">Prot.</th>
              <th className="px-2 py-2 font-medium">Tier</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 text-right font-medium">Manual value</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((pop, rowIndex) => {
              const tier = effectiveTier(pop);
              const busy = busyIds.has(pop.id);

              return (
                <tr
                  key={pop.id}
                  className={`border-b border-border/60 transition-colors hover:bg-surface-hover ${
                    busy ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selected.has(pop.id)}
                      onChange={() => toggleOne(pop.id)}
                      aria-label={`Select ${pop.name}`}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-foreground">{pop.name}</span>
                      {pop.variant === 'chase' && <Badge tone="chase">chase</Badge>}
                      {pop.exclusiveTo && <Badge tone="exclusive">{pop.exclusiveTo}</Badge>}
                      {pop.needsDisambiguation && (
                        <Badge tone="warn" title="Multiple figures share this name">
                          ambiguous
                        </Badge>
                      )}
                      {!pop.upc && (
                        <Badge tone="warn" title="Cannot be priced automatically without a UPC">
                          needs UPC
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-dim">{pop.line ?? '—'}</div>
                  </td>

                  <td className="tnum px-2 py-1.5 text-muted">{pop.itemNumber ?? '—'}</td>

                  <td className="px-2 py-1.5">
                    <UpcCell
                      key={pop.upc ?? 'empty'}
                      rowIndex={rowIndex}
                      upc={pop.upc}
                      disabled={busy}
                      label={pop.name}
                      onSave={(value) => patchOne(pop.id, { upc: value })}
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <InlineSelect
                      value={pop.condition}
                      options={CONDITIONS}
                      disabled={busy}
                      onChange={(value) => patchOne(pop.id, { condition: value as Condition })}
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <InlineSelect
                      value={pop.boxCondition}
                      options={BOX_CONDITIONS}
                      disabled={busy}
                      onChange={(value) =>
                        patchOne(pop.id, { boxCondition: value as BoxCondition })
                      }
                    />
                  </td>

                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={pop.hasBox}
                      disabled={busy}
                      aria-label={`${pop.name} has box`}
                      onChange={(event) => patchOne(pop.id, { hasBox: event.target.checked })}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                  </td>

                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={pop.hasProtector}
                      disabled={busy}
                      aria-label={`${pop.name} has protector`}
                      onChange={(event) => patchOne(pop.id, { hasProtector: event.target.checked })}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                  </td>

                  <td className="px-2 py-1.5">
                    <TierPill tier={tier} />
                  </td>

                  <td className="px-2 py-1.5">
                    <InlineSelect
                      value={pop.status}
                      options={STATUSES}
                      disabled={busy}
                      onChange={(value) => patchOne(pop.id, { status: value as Status })}
                    />
                  </td>

                  <td className="tnum px-2 py-1.5 text-right text-muted">
                    {formatCents(pop.manualValueCents)}
                  </td>

                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setEditing(pop)}
                      className="rounded px-1.5 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(pop)}
                      className="rounded px-1.5 py-1 text-xs text-muted hover:bg-loss/10 hover:text-loss"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {pops.length === 0 ? 'No figures yet.' : 'Nothing matches that filter.'}
          </p>
        )}
      </div>

      <p className="text-[11px] text-dim">
        Showing {visible.length} of {pops.length}. Inline changes save immediately.
      </p>

      {(editing || adding) && (
        <PopForm
          pop={editing}
          onClose={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function TierPill({ tier }: { tier: ReturnType<typeof effectiveTier> }) {
  const tone = tier === 'new' ? 'gain' : tier === 'damaged_box' ? 'neutral' : 'warn';
  return <Badge tone={tone}>{tierLabel(tier)}</Badge>;
}

/**
 * Inline UPC entry, built for filling in a whole shelf in one sitting.
 *
 * Validation happens here, before the request: a mistyped barcode is caught by
 * its own check digit and never leaves the browser, so a typo costs you a red
 * outline rather than a wrong price. Enter commits and jumps to the next row,
 * which is what makes 23 of these bearable.
 */
function UpcCell({
  rowIndex,
  upc,
  disabled,
  label,
  onSave,
}: {
  rowIndex: number;
  upc: string | null;
  disabled: boolean;
  label: string;
  onSave: (value: string | null) => void | Promise<void>;
}) {
  const [value, setValue] = useState(upc ?? '');
  const [error, setError] = useState<string | null>(null);

  function commit(): boolean {
    const trimmed = value.trim();

    if (trimmed === (upc ?? '')) {
      setError(null);
      return true;
    }

    if (trimmed === '') {
      setError(null);
      void onSave(null);
      return true;
    }

    const result = normaliseUpc(trimmed);
    if (!result.ok) {
      setError(result.error);
      return false;
    }

    // Show the normalised form, so a restored leading zero is visible.
    setValue(result.upc);
    setError(null);
    void onSave(result.upc);
    return true;
  }

  const suspicious = upc !== null && !looksLikeFunkoUpc(upc);

  return (
    <div className="min-w-[9.5rem]">
      <input
        value={value}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        placeholder="scan or type"
        aria-label={`UPC for ${label}`}
        aria-invalid={error !== null}
        data-upc-index={rowIndex}
        onChange={(event) => {
          setValue(event.target.value);
          if (error) setError(null);
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          if (!commit()) return;
          const next = document.querySelector<HTMLInputElement>(
            `[data-upc-index="${rowIndex + 1}"]`,
          );
          next?.focus();
          next?.select();
        }}
        className={`tnum w-full rounded border bg-surface-raised px-1.5 py-1 text-xs outline-none placeholder:text-dim focus:border-accent ${
          error ? 'border-loss text-loss' : 'border-border text-foreground'
        }`}
      />
      {error ? (
        <p className="mt-0.5 text-[10px] text-loss">{error}</p>
      ) : (
        suspicious && (
          <p className="mt-0.5 text-[10px] text-warn" title="Funko barcodes normally start 889698">
            unusual prefix
          </p>
        )
      )}
    </div>
  );
}

function InlineSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: readonly string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-foreground outline-none hover:border-border focus:border-accent"
    >
      {options.map((option) => (
        <option key={option} value={option} className="bg-surface">
          {option.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}

/** Applies one field change across every selected figure. */
function BulkBar({
  count,
  onApply,
  onClear,
}: {
  count: number;
  onApply: (patch: Record<string, unknown>) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2">
      <span className="text-xs font-medium text-foreground">
        {count} selected — apply to all:
      </span>

      <BulkSelect
        label="Condition"
        options={CONDITIONS}
        onPick={(value) => onApply({ condition: value })}
      />
      <BulkSelect
        label="Box"
        options={BOX_CONDITIONS}
        onPick={(value) => onApply({ boxCondition: value })}
      />
      <BulkSelect
        label="Status"
        options={STATUSES}
        onPick={(value) => onApply({ status: value })}
      />

      <button
        type="button"
        onClick={() => onApply({ hasBox: true })}
        className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-hover"
      >
        Has box
      </button>
      <button
        type="button"
        onClick={() => onApply({ hasBox: false })}
        className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-hover"
      >
        No box
      </button>
      <button
        type="button"
        onClick={() => onApply({ hasProtector: true })}
        className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-hover"
      >
        Protector
      </button>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto rounded px-2 py-1 text-xs text-muted hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
}

function BulkSelect({
  label,
  options,
  onPick,
}: {
  label: string;
  options: readonly string[];
  onPick: (value: string) => void;
}) {
  return (
    <select
      value=""
      onChange={(event) => {
        if (event.target.value) onPick(event.target.value);
        event.target.value = '';
      }}
      className="rounded border border-border bg-surface px-2 py-1 text-xs text-foreground outline-none focus:border-accent"
    >
      <option value="">{label}…</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}
