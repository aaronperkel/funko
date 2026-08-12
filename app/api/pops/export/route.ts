import { isAuthenticated } from '@/lib/auth';
import { withErrorHandling } from '@/lib/api';
import { toCsv } from '@/lib/csv';
import { CSV_COLUMNS, popToCsvRow } from '@/lib/csv-mapping';
import { listPops } from '@/lib/queries/pops';

/**
 * Full-fidelity export: every row carries its id, so a round trip through a
 * spreadsheet updates existing figures rather than duplicating them.
 *
 * proxy.ts already gates /api/pops/* on a session. This re-checks anyway —
 * the payload contains purchase prices, and a defence that depends on one
 * matcher regex staying correct is not much of a defence.
 */
export async function GET() {
  return withErrorHandling(async () => {
    if (!(await isAuthenticated())) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), {
        status: 401,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });
    }

    const all = await listPops();
    const csv = toCsv([[...CSV_COLUMNS], ...all.map(popToCsvRow)]);
    const filename = `funko-collection-${new Date().toISOString().slice(0, 10)}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  });
}
