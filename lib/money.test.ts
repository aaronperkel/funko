import { describe, expect, it } from 'vitest';
import {
  centsToDollarString,
  formatCents,
  formatPercent,
  formatSignedCents,
  netOfFeesCents,
  parseDollarsToCents,
} from '@/lib/money';

describe('parseDollarsToCents', () => {
  it('parses whole dollars', () => {
    expect(parseDollarsToCents('12')).toBe(1200);
  });

  it('parses cents exactly, without float drift', () => {
    // Math.round(parseFloat('19.99') * 100) is 1998.9999999999998 before rounding.
    expect(parseDollarsToCents('19.99')).toBe(1999);
    expect(parseDollarsToCents('0.07')).toBe(7);
    expect(parseDollarsToCents('1.10')).toBe(110);
    expect(parseDollarsToCents('8.29')).toBe(829);
    expect(parseDollarsToCents('1234.56')).toBe(123456);
  });

  it('pads a single decimal place', () => {
    expect(parseDollarsToCents('5.5')).toBe(550);
  });

  it('tolerates currency symbols, commas, and whitespace', () => {
    expect(parseDollarsToCents(' $1,299.99 ')).toBe(129999);
  });

  it('handles a leading decimal point', () => {
    expect(parseDollarsToCents('.75')).toBe(75);
  });

  it('handles negatives', () => {
    expect(parseDollarsToCents('-4.20')).toBe(-420);
  });

  it('returns null for a cleared field', () => {
    expect(parseDollarsToCents('')).toBeNull();
    expect(parseDollarsToCents('   ')).toBeNull();
  });

  it('returns undefined for input that is not a number, distinct from cleared', () => {
    expect(parseDollarsToCents('abc')).toBeUndefined();
    expect(parseDollarsToCents('1.2.3')).toBeUndefined();
    expect(parseDollarsToCents('12.345')).toBeUndefined();
    expect(parseDollarsToCents('-')).toBeUndefined();
  });

  it('always yields an integer', () => {
    for (const input of ['19.99', '0.01', '100', '.5', '7.3']) {
      expect(Number.isInteger(parseDollarsToCents(input))).toBe(true);
    }
  });
});

describe('centsToDollarString', () => {
  it('round-trips with parseDollarsToCents', () => {
    for (const cents of [0, 1, 7, 110, 1999, 123456, -420]) {
      expect(parseDollarsToCents(centsToDollarString(cents))).toBe(cents);
    }
  });

  it('pads cents to two places', () => {
    expect(centsToDollarString(5)).toBe('0.05');
    expect(centsToDollarString(150)).toBe('1.50');
  });

  it('renders an absent value as an empty field', () => {
    expect(centsToDollarString(null)).toBe('');
    expect(centsToDollarString(undefined)).toBe('');
  });
});

describe('formatting', () => {
  it('formats cents as USD', () => {
    expect(formatCents(129999)).toBe('$1,299.99');
    expect(formatCents(0)).toBe('$0.00');
  });

  it('shows a placeholder for no value, not $0.00', () => {
    expect(formatCents(null)).toBe('—');
    expect(formatCents(undefined)).toBe('—');
  });

  it('signs gains and losses explicitly', () => {
    expect(formatSignedCents(1500)).toBe('+$15.00');
    expect(formatSignedCents(-1500)).toBe('−$15.00');
    expect(formatSignedCents(0)).toBe('$0.00');
  });

  it('formats percentages with a sign', () => {
    expect(formatPercent(0.125)).toBe('+12.5%');
    expect(formatPercent(-0.5)).toBe('−50.0%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('netOfFeesCents', () => {
  it('subtracts marketplace fees and per-item shipping', () => {
    // $100.00 gross, one item: 13% fee = $13.00, shipping $6.00 -> $81.00
    expect(netOfFeesCents(10_000, 1)).toBe(8_100);
  });

  it('scales shipping with item count', () => {
    expect(netOfFeesCents(10_000, 3)).toBe(10_000 - 1_300 - 1_800);
  });

  it('can go negative on low-value items, and says so rather than clamping', () => {
    expect(netOfFeesCents(200, 1)).toBeLessThan(0);
  });

  it('returns integer cents', () => {
    expect(Number.isInteger(netOfFeesCents(3_333, 2))).toBe(true);
  });
});
