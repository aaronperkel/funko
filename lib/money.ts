/**
 * Currency lives as integer cents everywhere in this app. These helpers are
 * the only place a value becomes a string, and the only place a string becomes
 * a value. Nothing in between ever sees a float.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formats cents as USD. Returns the placeholder when there is genuinely no value. */
export function formatCents(cents: number | null | undefined, placeholder = '—'): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return placeholder;
  return USD.format(cents / 100);
}

/** Compact form for KPI tiles, where cents are noise. */
export function formatCentsWhole(cents: number | null | undefined, placeholder = '—'): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return placeholder;
  return USD_WHOLE.format(Math.round(cents / 100));
}

/** Always carries an explicit sign, for gain/loss figures. */
export function formatSignedCents(cents: number | null | undefined, placeholder = '—'): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return placeholder;
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return `${sign}${USD.format(Math.abs(cents) / 100)}`;
}

export function formatPercent(ratio: number | null | undefined, placeholder = '—'): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) return placeholder;
  const sign = ratio > 0 ? '+' : ratio < 0 ? '−' : '';
  return `${sign}${Math.abs(ratio * 100).toFixed(1)}%`;
}

/**
 * Parses a user-typed dollar amount into integer cents using string arithmetic.
 *
 * `Math.round(parseFloat(input) * 100)` is the obvious implementation and it is
 * subtly wrong — 19.99 * 100 is 1998.9999999999998. Splitting on the decimal
 * point and padding keeps everything in integer space.
 *
 * Returns null for empty input, and undefined for input that isn't a number at
 * all, so callers can tell "cleared the field" from "typed nonsense".
 */
export function parseDollarsToCents(input: string): number | null | undefined {
  const trimmed = input.trim().replace(/[$,\s]/g, '');
  if (trimmed === '') return null;

  const match = /^(-)?(\d*)(?:\.(\d{0,2}))?$/.exec(trimmed);
  if (!match) return undefined;

  const [, sign, wholePart, fractionPart] = match;
  if (!wholePart && !fractionPart) return undefined;

  const whole = wholePart === '' ? 0 : Number.parseInt(wholePart, 10);
  const fraction = Number.parseInt((fractionPart ?? '').padEnd(2, '0'), 10);
  if (!Number.isFinite(whole) || !Number.isFinite(fraction)) return undefined;

  const cents = whole * 100 + fraction;
  return sign === '-' ? -cents : cents;
}

/** Inverse of the above, for populating an editable form field. */
export function centsToDollarString(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  const negative = cents < 0;
  const absolute = Math.abs(Math.trunc(cents));
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * What a sale would actually net. The gross number flatters the collection:
 * marketplaces take a cut and shipping is real money leaving the account.
 */
export const MARKETPLACE_FEE_RATE = 0.13;
export const SHIPPING_COST_CENTS = 600;

export function netOfFeesCents(grossCents: number, itemCount: number): number {
  const fees = Math.round(grossCents * MARKETPLACE_FEE_RATE);
  const shipping = SHIPPING_COST_CENTS * itemCount;
  return grossCents - fees - shipping;
}
