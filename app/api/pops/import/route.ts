import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { pops } from '@/db/schema';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { flattenZodError } from '@/lib/api';
import { parseCsvRecords } from '@/lib/csv';
import { csvRecordToPopInput } from '@/lib/csv-mapping';
import { popCreateSchema, popUpdateSchema } from '@/lib/validation';

const MAX_ROWS = 5000;

type RowOutcome =
  | { row: number; action: 'created' | 'updated'; id: string; name: string }
  | { row: number; action: 'skipped'; reason: string };

/**
 * CSV import. Rows with an `id` update that figure; rows without one are
 * created. A row that fails validation is reported and skipped — one bad cell
 * must not roll back an otherwise good import of 22 other figures.
 *
 * Accepts either a multipart file upload or a raw text/csv body.
 */
export async function POST(request: Request) {
  return withErrorHandling(async () => {
    const csvText = await readCsvBody(request);
    if (csvText === null) {
      return jsonError('Send a CSV file as multipart form-data, or a text/csv body.', 400);
    }

    const records = parseCsvRecords(csvText);
    if (records.length === 0) {
      return jsonError('That CSV has a header but no data rows.', 400);
    }
    if (records.length > MAX_ROWS) {
      return jsonError(`Too many rows — the limit is ${MAX_ROWS}.`, 413);
    }

    const outcomes: RowOutcome[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const [index, record] of records.entries()) {
      // +2 puts the number in spreadsheet terms: 1-indexed, past the header.
      const rowNumber = index + 2;
      const mapped = csvRecordToPopInput(record);

      if (mapped.errors.length > 0) {
        outcomes.push({
          row: rowNumber,
          action: 'skipped',
          reason: mapped.errors.map((e) => `${e.column}: ${e.message}`).join('; '),
        });
        skipped += 1;
        continue;
      }

      if (mapped.id) {
        const existing = await getDb()
          .select({ id: pops.id })
          .from(pops)
          .where(eq(pops.id, mapped.id))
          .limit(1);

        if (existing.length === 0) {
          outcomes.push({
            row: rowNumber,
            action: 'skipped',
            reason: `No figure with id ${mapped.id}.`,
          });
          skipped += 1;
          continue;
        }

        const parsed = popUpdateSchema.safeParse(mapped.values);
        if (!parsed.success) {
          outcomes.push({
            row: rowNumber,
            action: 'skipped',
            reason: describeZodFailure(parsed.error),
          });
          skipped += 1;
          continue;
        }

        if (Object.keys(parsed.data).length === 0) {
          outcomes.push({ row: rowNumber, action: 'skipped', reason: 'No changed fields.' });
          skipped += 1;
          continue;
        }

        const [row] = await getDb()
          .update(pops)
          .set(parsed.data)
          .where(eq(pops.id, mapped.id))
          .returning({ id: pops.id, name: pops.name });

        outcomes.push({ row: rowNumber, action: 'updated', id: row.id, name: row.name });
        updated += 1;
        continue;
      }

      const parsed = popCreateSchema.safeParse(mapped.values);
      if (!parsed.success) {
        outcomes.push({
          row: rowNumber,
          action: 'skipped',
          reason: describeZodFailure(parsed.error),
        });
        skipped += 1;
        continue;
      }

      const [row] = await getDb()
        .insert(pops)
        .values(parsed.data)
        .returning({ id: pops.id, name: pops.name });

      outcomes.push({ row: rowNumber, action: 'created', id: row.id, name: row.name });
      created += 1;
    }

    return jsonOk({
      ok: true,
      summary: { rows: records.length, created, updated, skipped },
      outcomes,
    });
  });
}

async function readCsvBody(request: Request): Promise<string | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (file instanceof File) return file.text();
    if (typeof file === 'string') return file;
    return null;
  }

  const text = await request.text();
  return text.trim() === '' ? null : text;
}

function describeZodFailure(error: Parameters<typeof flattenZodError>[0]): string {
  return Object.entries(flattenZodError(error))
    .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
    .join('; ');
}
