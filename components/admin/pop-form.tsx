'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  ACQUIRED_AS,
  BOX_CONDITIONS,
  CONDITIONS,
  STATUSES,
  VARIANTS,
  type Pop,
} from '@/db/schema';
import { apiFetch } from '@/lib/client-api';
import { centsToDollarString, parseDollarsToCents } from '@/lib/money';
import { PhotoUpload } from './photo-upload';

type Props = { pop: Pop | null; onClose: () => void };

/**
 * Full add/edit form. Money fields are typed in dollars and converted to
 * integer cents before they ever leave the browser.
 */
export function PopForm({ pop, onClose }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(pop?.imageUrl ?? null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = buildPayload(form, imageUrl);

    if ('error' in payload) {
      setError(payload.error);
      setPending(false);
      return;
    }

    const result = pop
      ? await apiFetch(`/api/pops/${pop.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload.values),
        })
      : await apiFetch('/api/pops', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload.values),
        });

    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }

    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-background"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 flex items-center justify-between border-b border-border bg-background px-5 py-3">
          <h2 className="text-sm font-semibold">{pop ? `Edit ${pop.name}` : 'Add a figure'}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-surface-hover hover:text-foreground"
          >
            Close
          </button>
        </header>

        <form onSubmit={onSubmit} className="space-y-5 px-5 py-5">
          <Fieldset legend="Identity">
            <Field label="Name" required>
              <input name="name" defaultValue={pop?.name ?? ''} required className={inputClass} />
            </Field>
            <Row>
              <Field label="Line">
                <input name="line" defaultValue={pop?.line ?? ''} className={inputClass} />
              </Field>
              <Field label="Franchise">
                <input
                  name="franchise"
                  defaultValue={pop?.franchise ?? ''}
                  className={inputClass}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Item number">
                <input
                  name="itemNumber"
                  type="number"
                  defaultValue={pop?.itemNumber ?? ''}
                  className={inputClass}
                />
              </Field>
              <Field label="UPC" hint="The single best matching key for automatic pricing.">
                <input
                  name="upc"
                  inputMode="numeric"
                  defaultValue={pop?.upc ?? ''}
                  placeholder="8–14 digits"
                  className={inputClass}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Variant">
                <Select name="variant" defaultValue={pop?.variant ?? 'common'} options={VARIANTS} />
              </Field>
              <Field label="Exclusive to">
                <input
                  name="exclusiveTo"
                  defaultValue={pop?.exclusiveTo ?? ''}
                  placeholder="Target, SDCC 2019…"
                  className={inputClass}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Release year">
                <input
                  name="releaseYear"
                  type="number"
                  defaultValue={pop?.releaseYear ?? ''}
                  className={inputClass}
                />
              </Field>
              <Field label="Quantity">
                <input
                  name="quantity"
                  type="number"
                  min={1}
                  defaultValue={pop?.quantity ?? 1}
                  className={inputClass}
                />
              </Field>
            </Row>
            <Row>
              <Checkbox name="isVaulted" label="Vaulted" defaultChecked={pop?.isVaulted ?? false} />
              <Checkbox
                name="needsDisambiguation"
                label="Ambiguous name — needs disambiguation"
                defaultChecked={pop?.needsDisambiguation ?? false}
              />
            </Row>
          </Fieldset>

          <Fieldset legend="Condition" hint="Determines which of the three price tiers this figure is valued at.">
            <Row>
              <Field label="Figure condition">
                <Select
                  name="condition"
                  defaultValue={pop?.condition ?? 'near_mint'}
                  options={CONDITIONS}
                />
              </Field>
              <Field label="Box condition">
                <Select
                  name="boxCondition"
                  defaultValue={pop?.boxCondition ?? 'minor_damage'}
                  options={BOX_CONDITIONS}
                />
              </Field>
            </Row>
            <Row>
              <Checkbox name="hasBox" label="Has box" defaultChecked={pop?.hasBox ?? true} />
              <Checkbox
                name="hasProtector"
                label="Has protector"
                defaultChecked={pop?.hasProtector ?? false}
              />
            </Row>
          </Fieldset>

          <Fieldset legend="Ownership">
            <Row>
              <Field label="Status">
                <Select name="status" defaultValue={pop?.status ?? 'owned'} options={STATUSES} />
              </Field>
              <Field label="Acquired as">
                <Select
                  name="acquiredAs"
                  defaultValue={pop?.acquiredAs ?? 'unknown'}
                  options={ACQUIRED_AS}
                />
              </Field>
            </Row>
            <Row>
              <Field label="Purchase price" hint="Dollars — stored as integer cents.">
                <input
                  name="purchasePrice"
                  inputMode="decimal"
                  placeholder="0.00"
                  defaultValue={centsToDollarString(pop?.purchasePriceCents)}
                  className={inputClass}
                />
              </Field>
              <Field label="Purchase date">
                <input
                  name="purchaseDate"
                  type="date"
                  defaultValue={pop?.purchaseDate ?? ''}
                  className={inputClass}
                />
              </Field>
            </Row>
            <Field label="Purchase source">
              <input
                name="purchaseSource"
                defaultValue={pop?.purchaseSource ?? ''}
                className={inputClass}
              />
            </Field>
            <Row>
              <Field label="Sold price">
                <input
                  name="soldPrice"
                  inputMode="decimal"
                  placeholder="0.00"
                  defaultValue={centsToDollarString(pop?.soldPriceCents)}
                  className={inputClass}
                />
              </Field>
              <Field label="Sold date">
                <input
                  name="soldDate"
                  type="date"
                  defaultValue={pop?.soldDate ?? ''}
                  className={inputClass}
                />
              </Field>
            </Row>
          </Fieldset>

          <Fieldset legend="Valuation & media">
            <Field
              label="Manual value"
              hint="Your own appraisal. Beats every pricing API when set."
            >
              <input
                name="manualValue"
                inputMode="decimal"
                placeholder="0.00"
                defaultValue={centsToDollarString(pop?.manualValueCents)}
                className={inputClass}
              />
            </Field>
            <Field label="Search override" hint="Used when name-based matching picks the wrong figure.">
              <input
                name="searchOverride"
                defaultValue={pop?.searchOverride ?? ''}
                className={inputClass}
              />
            </Field>
            <Field label="Photo">
              <PhotoUpload value={imageUrl} onChange={setImageUrl} />
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                rows={3}
                defaultValue={pop?.notes ?? ''}
                className={`${inputClass} resize-y`}
              />
            </Field>
          </Fieldset>

          {error && (
            <p role="alert" className="rounded border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
              {error}
            </p>
          )}

          <div className="flex items-center gap-2 border-t border-border pt-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40"
            >
              {pending ? 'Saving…' : pop ? 'Save changes' : 'Add figure'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-2 text-sm text-muted hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none placeholder:text-dim focus:border-accent';

function buildPayload(
  form: FormData,
  imageUrl: string | null,
): { values: Record<string, unknown> } | { error: string } {
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };

  const integer = (key: string) => {
    const value = text(key);
    if (value === null) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  // Explicit union so `'error' in result` narrows to a defined string.
  type MoneyResult = { error: string } | { value: number | null };

  const money = (key: string, label: string): MoneyResult => {
    const raw = form.get(key);
    const parsed = parseDollarsToCents(typeof raw === 'string' ? raw : '');
    if (parsed === undefined) return { error: `${label} is not a valid amount.` };
    return { value: parsed };
  };

  const purchase = money('purchasePrice', 'Purchase price');
  if ('error' in purchase) return { error: purchase.error };
  const sold = money('soldPrice', 'Sold price');
  if ('error' in sold) return { error: sold.error };
  const manual = money('manualValue', 'Manual value');
  if ('error' in manual) return { error: manual.error };

  const name = text('name');
  if (!name) return { error: 'Name is required.' };

  return {
    values: {
      name,
      line: text('line'),
      franchise: text('franchise'),
      itemNumber: integer('itemNumber'),
      upc: text('upc') ?? '',
      variant: form.get('variant'),
      exclusiveTo: text('exclusiveTo'),
      releaseYear: integer('releaseYear'),
      quantity: integer('quantity') ?? 1,
      isVaulted: form.get('isVaulted') === 'on',
      needsDisambiguation: form.get('needsDisambiguation') === 'on',
      condition: form.get('condition'),
      boxCondition: form.get('boxCondition'),
      hasBox: form.get('hasBox') === 'on',
      hasProtector: form.get('hasProtector') === 'on',
      status: form.get('status'),
      acquiredAs: form.get('acquiredAs'),
      purchasePriceCents: purchase.value,
      purchaseDate: text('purchaseDate'),
      purchaseSource: text('purchaseSource'),
      soldPriceCents: sold.value,
      soldDate: text('soldDate'),
      manualValueCents: manual.value,
      searchOverride: text('searchOverride'),
      imageUrl,
      notes: text('notes'),
    },
  };
}

function Fieldset({
  legend,
  hint,
  children,
}: {
  legend: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-[11px] font-semibold uppercase tracking-wider text-dim">
        {legend}
      </legend>
      {hint && <p className="-mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted">
        {label}
        {required && <span className="text-loss"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-1 block text-[11px] text-dim">{hint}</span>}
    </label>
  );
}

function Select({
  name,
  defaultValue,
  options,
}: {
  name: string;
  defaultValue: string;
  options: readonly string[];
}) {
  return (
    <select name={name} defaultValue={defaultValue} className={inputClass}>
      {options.map((option) => (
        <option key={option} value={option}>
          {option.replace(/_/g, ' ')}
        </option>
      ))}
    </select>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}
