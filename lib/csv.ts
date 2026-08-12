/**
 * Minimal RFC 4180 CSV reader/writer.
 *
 * Hand-rolled rather than pulled from a dependency because the requirements are
 * small and fixed, but NOT naive: figure names contain commas ("Cal Kestis &
 * BD-1"), notes contain quotes and newlines, and a `split(',')` implementation
 * would silently corrupt exactly the rows that matter. Unit-tested accordingly.
 */

/** Parses CSV text into rows of raw string cells. Handles quotes, escaped quotes, CRLF. */
export function parseCsv(input: string): string[][] {
  // Strip a UTF-8 BOM — Excel writes one and it would poison the first header.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;

  const endField = () => {
    row.push(fieldWasQuoted ? field : field.trim());
    field = '';
    fieldWasQuoted = false;
  };

  const endRow = () => {
    endField();
    // Skip blank lines rather than emitting a phantom single-empty-cell row.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === '') {
      inQuotes = true;
      fieldWasQuoted = true;
      field = '';
      continue;
    }

    if (char === ',') {
      endField();
      continue;
    }

    if (char === '\r') {
      if (text[i + 1] === '\n') i += 1;
      endRow();
      continue;
    }

    if (char === '\n') {
      endRow();
      continue;
    }

    field += char;
  }

  // Trailing field/row with no terminating newline.
  if (field !== '' || row.length > 0 || inQuotes) endRow();

  return rows;
}

/** Parses CSV with a header row into keyed records. */
export function parseCsvRecords(input: string): Record<string, string>[] {
  const rows = parseCsv(input);
  if (rows.length === 0) return [];

  const [header, ...body] = rows;
  const keys = header.map((key) => key.trim());

  return body.map((row) => {
    const record: Record<string, string> = {};
    keys.forEach((key, index) => {
      record[key] = row[index] ?? '';
    });
    return record;
  });
}

const NEEDS_QUOTING = /[",\r\n]/;

export function escapeCsvValue(value: string): string {
  return NEEDS_QUOTING.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialises rows to CSV text with CRLF line endings, as RFC 4180 specifies. */
export function toCsv(rows: ReadonlyArray<ReadonlyArray<string>>): string {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\r\n');
}
