import { describe, expect, it } from 'vitest';
import { escapeCsvValue, parseCsv, parseCsvRecords, toCsv } from '@/lib/csv';

describe('parseCsv', () => {
  it('parses a simple grid', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('name,line\n"Cal Kestis & BD-1, deluxe",Pop! Star Wars')).toEqual([
      ['name', 'line'],
      ['Cal Kestis & BD-1, deluxe', 'Pop! Star Wars'],
    ]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('notes\n"He said ""mint in box"" twice"')).toEqual([
      ['notes'],
      ['He said "mint in box" twice'],
    ]);
  });

  it('keeps newlines inside quoted fields', () => {
    expect(parseCsv('notes\n"line one\nline two"')).toEqual([
      ['notes'],
      ['line one\nline two'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('strips a UTF-8 BOM so the first header is not corrupted', () => {
    expect(parseCsv('﻿name,line\nMo,Pop! Wall-E')[0]).toEqual(['name', 'line']);
  });

  it('preserves empty cells positionally', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ]);
  });

  it('preserves intentional whitespace inside quotes but trims bare fields', () => {
    expect(parseCsv('a,b\n  spaced  ,"  kept  "')).toEqual([
      ['a', 'b'],
      ['spaced', '  kept  '],
    ]);
  });

  it('skips blank lines rather than emitting phantom rows', () => {
    expect(parseCsv('a\n1\n\n2\n')).toEqual([['a'], ['1'], ['2']]);
  });

  it('handles a final row with no trailing newline', () => {
    expect(parseCsv('a,b\n1,2')).toHaveLength(2);
  });

  it('returns no rows for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('parseCsvRecords', () => {
  it('keys rows by header', () => {
    expect(parseCsvRecords('name,itemNumber\nMo,1117')).toEqual([
      { name: 'Mo', itemNumber: '1117' },
    ]);
  });

  it('fills missing trailing columns with empty strings', () => {
    expect(parseCsvRecords('name,line,notes\nMo,Pop! Wall-E')).toEqual([
      { name: 'Mo', line: 'Pop! Wall-E', notes: '' },
    ]);
  });

  it('returns an empty list when there is only a header', () => {
    expect(parseCsvRecords('name,line')).toEqual([]);
  });
});

describe('escapeCsvValue', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsvValue('Dark Trooper')).toBe('Dark Trooper');
  });

  it('quotes values containing a comma, quote, or newline', () => {
    expect(escapeCsvValue('a,b')).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue('line\nbreak')).toBe('"line\nbreak"');
  });
});

describe('round trip', () => {
  it('survives the values that break naive CSV handling', () => {
    const original = [
      ['name', 'notes'],
      ['Cal Kestis & BD-1', 'Bought at a con, 2023'],
      ['Steamboat Mickey (Art Series)', 'Not the "metallic" #24'],
      ['Wall-E', 'multi\nline note'],
      ['Mo', ''],
    ];

    expect(parseCsv(toCsv(original))).toEqual(original);
  });
});
