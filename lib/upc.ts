/**
 * UPC/GTIN normalisation and check-digit validation.
 *
 * This matters more than it looks. A wrong UPC does not fail loudly — it
 * resolves to *something else* in PriceCharting's catalogue and writes a
 * confident, plausible, completely wrong price. A single mistyped digit on a
 * Funko box is how a $12 figure ends up valued like a boxed Nintendo game.
 *
 * The last digit of every UPC is a checksum over the others, so most typos are
 * catchable before they ever reach the API.
 */

/** Lengths the GTIN check-digit algorithm is defined for. */
const GTIN_LENGTHS = [8, 12, 13, 14] as const;

export type UpcResult =
  | { ok: true; upc: string; padded: boolean }
  | { ok: false; error: string };

/**
 * Cleans, zero-pads, and checksums a typed UPC.
 *
 * The padding step exists because of spreadsheets. Funko's own barcodes start
 * with 889698 and survive a round-trip fine, but any UPC with a leading zero
 * loses it the moment a CSV column is treated as a number — 045496830434
 * becomes 45496830434, which is still *checksum-valid* (a leading zero adds
 * nothing to the weighted sum) and so would sail through validation as a
 * different, shorter identifier. Padding back to a standard GTIN length undoes
 * that silently and correctly.
 */
export function normaliseUpc(input: string): UpcResult {
  const digits = input.replace(/[\s-]/g, '');

  if (digits === '') return { ok: false, error: 'Empty.' };

  if (!/^\d+$/.test(digits)) {
    return { ok: false, error: 'A UPC is digits only.' };
  }

  if (digits.length < 8) {
    return { ok: false, error: `Too short — a UPC has at least 8 digits, this has ${digits.length}.` };
  }

  if (digits.length > 14) {
    return { ok: false, error: `Too long — a GTIN has at most 14 digits, this has ${digits.length}.` };
  }

  const target = GTIN_LENGTHS.find((length) => length >= digits.length);
  if (target === undefined) {
    return { ok: false, error: 'Not a recognisable UPC length.' };
  }

  const padded = digits.padStart(target, '0');

  if (!hasValidCheckDigit(padded)) {
    return {
      ok: false,
      error:
        'Check digit does not match — one of these digits is wrong. Re-read the barcode rather than guessing.',
    };
  }

  return { ok: true, upc: padded, padded: padded.length !== digits.length };
}

/**
 * The standard GTIN checksum: weight the digits 3 and 1 alternately from the
 * right (excluding the check digit itself), then the check digit is whatever
 * rounds the total up to a multiple of ten.
 */
export function hasValidCheckDigit(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  if (!GTIN_LENGTHS.includes(digits.length as (typeof GTIN_LENGTHS)[number])) return false;

  const body = digits.slice(0, -1);
  const check = Number(digits[digits.length - 1]);

  let sum = 0;
  for (let index = 0; index < body.length; index += 1) {
    const digit = Number(body[body.length - 1 - index]);
    sum += digit * (index % 2 === 0 ? 3 : 1);
  }

  return (10 - (sum % 10)) % 10 === check;
}

/**
 * Funko's GS1 company prefixes.
 *
 * `889698` covers modern Pops, but the early line used two others, verified
 * against real catalogue entries rather than assumed:
 *
 *   830395023908  Darth Maul #9      (January 2011)
 *   849803068271  Darth Vader #1     (January 2011)
 *   849803055400  Yoda #2            (May 2011)
 *
 * Checking only the modern prefix cried wolf on every pre-2017 figure, which
 * is the fastest way to teach someone to ignore a warning.
 *
 * Still not a validation rule — retailers sometimes barcode exclusives
 * themselves — just a nudge to look twice before a UPC reaches the pricing API.
 */
export const FUNKO_PREFIXES = ['889698', '849803', '830395'] as const;

/** The current prefix, used when a single example is wanted. */
export const FUNKO_PREFIX = FUNKO_PREFIXES[0];

export function looksLikeFunkoUpc(upc: string): boolean {
  return FUNKO_PREFIXES.some((prefix) => upc.startsWith(prefix));
}
