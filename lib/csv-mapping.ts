import {
  ACQUIRED_AS,
  BOX_CONDITIONS,
  CONDITIONS,
  STATUSES,
  VARIANTS,
  type Pop,
} from '@/db/schema';
import { centsToDollarString, parseDollarsToCents } from '@/lib/money';

/**
 * The CSV contract for import/export.
 *
 * Money is exported as a human-editable dollar string ("19.99") because the
 * whole point of the CSV is hand-editing in a spreadsheet — but it is parsed
 * straight back to integer cents on the way in. Cents never become floats.
 */

export const CSV_COLUMNS = [
  'id',
  'name',
  'line',
  'franchise',
  'itemNumber',
  'upc',
  'variant',
  'exclusiveTo',
  'releaseYear',
  'isVaulted',
  'condition',
  'hasBox',
  'boxCondition',
  'hasProtector',
  'quantity',
  'status',
  'acquiredAs',
  'purchasePrice',
  'purchaseDate',
  'purchaseSource',
  'soldPrice',
  'soldDate',
  'manualValue',
  'imageUrl',
  'searchOverride',
  'needsDisambiguation',
  'notes',
] as const;

export function popToCsvRow(pop: Pop): string[] {
  return [
    pop.id,
    pop.name,
    pop.line ?? '',
    pop.franchise ?? '',
    pop.itemNumber?.toString() ?? '',
    pop.upc ?? '',
    pop.variant,
    pop.exclusiveTo ?? '',
    pop.releaseYear?.toString() ?? '',
    boolToCsv(pop.isVaulted),
    pop.condition,
    boolToCsv(pop.hasBox),
    pop.boxCondition,
    boolToCsv(pop.hasProtector),
    pop.quantity.toString(),
    pop.status,
    pop.acquiredAs,
    centsToDollarString(pop.purchasePriceCents),
    pop.purchaseDate ?? '',
    pop.purchaseSource ?? '',
    centsToDollarString(pop.soldPriceCents),
    pop.soldDate ?? '',
    centsToDollarString(pop.manualValueCents),
    pop.imageUrl ?? '',
    pop.searchOverride ?? '',
    boolToCsv(pop.needsDisambiguation),
    pop.notes ?? '',
  ];
}

function boolToCsv(value: boolean): string {
  return value ? 'yes' : 'no';
}

const TRUTHY = new Set(['yes', 'y', 'true', '1', 't']);
const FALSY = new Set(['no', 'n', 'false', '0', 'f', '']);

export type CsvFieldError = { column: string; message: string };

export type MappedCsvRow = {
  id: string | null;
  values: Record<string, unknown>;
  errors: CsvFieldError[];
};

/**
 * Converts one CSV record into a partial pop payload, collecting per-cell
 * errors instead of throwing — a single bad row should not abort the import.
 */
export function csvRecordToPopInput(record: Record<string, string>): MappedCsvRow {
  const errors: CsvFieldError[] = [];
  const values: Record<string, unknown> = {};

  const text = (column: string) => {
    const raw = record[column];
    if (raw === undefined) return;
    values[column] = raw.trim() === '' ? null : raw.trim();
  };

  const integer = (column: string, target = column) => {
    const raw = record[column];
    if (raw === undefined) return;
    if (raw.trim() === '') {
      values[target] = null;
      return;
    }
    const parsed = Number.parseInt(raw.trim(), 10);
    if (!Number.isFinite(parsed)) {
      errors.push({ column, message: `"${raw}" is not a whole number.` });
      return;
    }
    values[target] = parsed;
  };

  const money = (column: string, target: string) => {
    const raw = record[column];
    if (raw === undefined) return;
    const parsed = parseDollarsToCents(raw);
    if (parsed === undefined) {
      errors.push({ column, message: `"${raw}" is not a valid amount.` });
      return;
    }
    values[target] = parsed;
  };

  const boolean = (column: string) => {
    const raw = record[column];
    if (raw === undefined) return;
    const normalised = raw.trim().toLowerCase();
    if (TRUTHY.has(normalised)) values[column] = true;
    else if (FALSY.has(normalised)) values[column] = false;
    else errors.push({ column, message: `"${raw}" is not yes/no.` });
  };

  const enumField = (column: string, allowed: readonly string[]) => {
    const raw = record[column];
    if (raw === undefined) return;
    const normalised = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (normalised === '') return;
    if (!allowed.includes(normalised)) {
      errors.push({ column, message: `"${raw}" must be one of: ${allowed.join(', ')}.` });
      return;
    }
    values[column] = normalised;
  };

  text('name');
  text('line');
  text('franchise');
  text('upc');
  text('exclusiveTo');
  text('purchaseDate');
  text('purchaseSource');
  text('soldDate');
  text('imageUrl');
  text('searchOverride');
  text('notes');

  integer('itemNumber');
  integer('releaseYear');
  integer('quantity');

  money('purchasePrice', 'purchasePriceCents');
  money('soldPrice', 'soldPriceCents');
  money('manualValue', 'manualValueCents');

  boolean('isVaulted');
  boolean('hasBox');
  boolean('hasProtector');
  boolean('needsDisambiguation');

  enumField('variant', VARIANTS);
  enumField('condition', CONDITIONS);
  enumField('boxCondition', BOX_CONDITIONS);
  enumField('status', STATUSES);
  enumField('acquiredAs', ACQUIRED_AS);

  // A blank quantity means "unchanged", not zero.
  if (values.quantity === null) delete values.quantity;

  const id = record.id?.trim();
  return { id: id ? id : null, values, errors };
}
