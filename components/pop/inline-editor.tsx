'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  BOX_CONDITIONS,
  CONDITIONS,
  STATUSES,
  VARIANTS,
  type Pop,
} from '@/db/schema';
import { apiFetch } from '@/lib/client-api';
import { centsToDollarString, parseDollarsToCents } from '@/lib/money';

type EditablePop = Pick<
  Pop,
  | 'id'
  | 'name'
  | 'line'
  | 'franchise'
  | 'itemNumber'
  | 'upc'
  | 'variant'
  | 'exclusiveTo'
  | 'releaseYear'
  | 'isVaulted'
  | 'condition'
  | 'hasBox'
  | 'boxCondition'
  | 'hasProtector'
  | 'quantity'
  | 'status'
  | 'manualValueCents'
  | 'notes'
> &
  Partial<Pick<Pop, 'purchasePriceCents' | 'purchaseDate' | 'purchaseSource'>>;

/**
 * Inline metadata editing on the detail page. Each field saves on blur (text)
 * or on change (selects and checkboxes), so there is no save button to forget.
 */
export function InlineEditor({ pop }: { pop: EditablePop }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(field: string, value: unknown) {
    setSaving(field);
    setError(null);

    const result = await apiFetch(`/api/pops/${pop.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });

    setSaving(null);

    if (!result.ok) {
      setError(`${field}: ${result.error}`);
      return;
    }

    setSaved(field);
    setTimeout(() => setSaved((current) => (current === field ? null : current)), 1500);
    router.refresh();
  }

  function saveMoney(field: string, raw: string) {
    const parsed = parseDollarsToCents(raw);
    if (parsed === undefined) {
      setError(`${field}: not a valid amount.`);
      return;
    }
    void save(field, parsed);
  }

  const state = (field: string) =>
    saving === field ? 'saving…' : saved === field ? 'saved' : null;

  return (
    <div className="space-y-0 divide-y divide-border">
      {error && (
        <p role="alert" className="bg-loss/10 px-4 py-2 text-xs text-loss">
          {error}
        </p>
      )}

      <Grid>
        <TextField label="Name" value={pop.name} onSave={(v) => save('name', v)} state={state('name')} />
        <TextField label="Line" value={pop.line ?? ''} onSave={(v) => save('line', v)} state={state('line')} />
        <TextField
          label="Franchise"
          value={pop.franchise ?? ''}
          onSave={(v) => save('franchise', v)}
          state={state('franchise')}
        />
        <NumberField
          label="Item number"
          value={pop.itemNumber}
          onSave={(v) => save('itemNumber', v)}
          state={state('itemNumber')}
        />
        <TextField
          label="UPC"
          value={pop.upc ?? ''}
          placeholder="8–14 digits"
          onSave={(v) => save('upc', v)}
          state={state('upc')}
        />
        <TextField
          label="Exclusive to"
          value={pop.exclusiveTo ?? ''}
          onSave={(v) => save('exclusiveTo', v)}
          state={state('exclusiveTo')}
        />
        <NumberField
          label="Release year"
          value={pop.releaseYear}
          onSave={(v) => save('releaseYear', v)}
          state={state('releaseYear')}
        />
        <NumberField
          label="Quantity"
          value={pop.quantity}
          min={1}
          onSave={(v) => save('quantity', v ?? 1)}
          state={state('quantity')}
        />
      </Grid>

      <Grid>
        <SelectField
          label="Condition"
          value={pop.condition}
          options={CONDITIONS}
          onSave={(v) => save('condition', v)}
          state={state('condition')}
        />
        <SelectField
          label="Box condition"
          value={pop.boxCondition}
          options={BOX_CONDITIONS}
          onSave={(v) => save('boxCondition', v)}
          state={state('boxCondition')}
        />
        <SelectField
          label="Variant"
          value={pop.variant}
          options={VARIANTS}
          onSave={(v) => save('variant', v)}
          state={state('variant')}
        />
        <SelectField
          label="Status"
          value={pop.status}
          options={STATUSES}
          onSave={(v) => save('status', v)}
          state={state('status')}
        />
      </Grid>

      <div className="flex flex-wrap gap-4 px-4 py-3">
        <ToggleField
          label="Has box"
          checked={pop.hasBox}
          onSave={(v) => save('hasBox', v)}
          state={state('hasBox')}
        />
        <ToggleField
          label="Has protector"
          checked={pop.hasProtector}
          onSave={(v) => save('hasProtector', v)}
          state={state('hasProtector')}
        />
        <ToggleField
          label="Vaulted"
          checked={pop.isVaulted}
          onSave={(v) => save('isVaulted', v)}
          state={state('isVaulted')}
        />
      </div>

      <Grid>
        <TextField
          label="Manual value"
          value={centsToDollarString(pop.manualValueCents)}
          placeholder="0.00"
          hint="Overrides every pricing source"
          onSave={(v) => saveMoney('manualValueCents', v)}
          state={state('manualValueCents')}
        />
        {pop.purchasePriceCents !== undefined && (
          <TextField
            label="Purchase price"
            value={centsToDollarString(pop.purchasePriceCents)}
            placeholder="0.00"
            onSave={(v) => saveMoney('purchasePriceCents', v)}
            state={state('purchasePriceCents')}
          />
        )}
        {pop.purchaseDate !== undefined && (
          <TextField
            label="Purchase date"
            value={pop.purchaseDate ?? ''}
            type="date"
            onSave={(v) => save('purchaseDate', v)}
            state={state('purchaseDate')}
          />
        )}
        {pop.purchaseSource !== undefined && (
          <TextField
            label="Purchase source"
            value={pop.purchaseSource ?? ''}
            onSave={(v) => save('purchaseSource', v)}
            state={state('purchaseSource')}
          />
        )}
      </Grid>

      <div className="px-4 py-3">
        <FieldLabel label="Notes" state={state('notes')} />
        <textarea
          defaultValue={pop.notes ?? ''}
          rows={3}
          onBlur={(event) => {
            if (event.target.value !== (pop.notes ?? '')) void save('notes', event.target.value);
          }}
          className="mt-1 w-full resize-y rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

function FieldLabel({ label, state, hint }: { label: string; state: string | null; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] uppercase tracking-wider text-dim">{label}</span>
      {state && (
        <span className={`text-[10px] ${state === 'saved' ? 'text-gain' : 'text-dim'}`}>
          {state}
        </span>
      )}
      {!state && hint && <span className="text-[10px] text-dim">{hint}</span>}
    </div>
  );
}

const fieldClass =
  'mt-1 w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground outline-none placeholder:text-dim focus:border-accent';

function TextField({
  label,
  value,
  placeholder,
  hint,
  type = 'text',
  onSave,
  state,
}: {
  label: string;
  value: string;
  placeholder?: string;
  hint?: string;
  type?: string;
  onSave: (value: string) => void;
  state: string | null;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} state={state} hint={hint} />
      <input
        type={type}
        defaultValue={value}
        placeholder={placeholder}
        onBlur={(event) => {
          if (event.target.value !== value) onSave(event.target.value);
        }}
        className={fieldClass}
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  min,
  onSave,
  state,
}: {
  label: string;
  value: number | null;
  min?: number;
  onSave: (value: number | null) => void;
  state: string | null;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} state={state} />
      <input
        type="number"
        min={min}
        defaultValue={value ?? ''}
        onBlur={(event) => {
          const raw = event.target.value.trim();
          const next = raw === '' ? null : Number.parseInt(raw, 10);
          if (next !== value && (next === null || Number.isFinite(next))) onSave(next);
        }}
        className={fieldClass}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onSave,
  state,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onSave: (value: string) => void;
  state: string | null;
}) {
  return (
    <label className="block">
      <FieldLabel label={label} state={state} />
      <select
        value={value}
        onChange={(event) => onSave(event.target.value)}
        className={fieldClass}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onSave,
  state,
}: {
  label: string;
  checked: boolean;
  onSave: (value: boolean) => void;
  state: string | null;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onSave(event.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {label}
      {state && (
        <span className={`text-[10px] ${state === 'saved' ? 'text-gain' : 'text-dim'}`}>
          {state}
        </span>
      )}
    </label>
  );
}
