import { isAuthenticated } from '@/lib/auth';
import { jsonError, jsonOk, parseJsonBody, withErrorHandling } from '@/lib/api';
import { DEFAULT_LIMIT, refreshPops } from '@/lib/pricing/refresh';
import { refreshRequestSchema } from '@/lib/validation';

/**
 * "Refresh prices" for the whole collection, from /admin.
 *
 * proxy.ts already guards every method on /api/pops, but this route is checked
 * again here on purpose: it spends paid API quota, and that is not something to
 * leave resting on a single matcher regex staying correct.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: Request) {
  return withErrorHandling(async () => {
    if (!(await isAuthenticated())) return jsonError('Authentication required.', 401);

    const body = await parseJsonBody(request, refreshRequestSchema);
    if (!body.ok) return body.response;

    const result = await refreshPops({
      now: new Date(),
      force: body.data.force,
      limit: body.data.limit ?? DEFAULT_LIMIT,
      trigger: 'manual',
    });

    return jsonOk({
      status: result.status,
      processed: result.processed,
      priced: result.priced,
      failed: result.failed,
      skipped: result.skipped,
      disabled: result.disabled ?? null,
      outcomes: result.outcomes,
    });
  });
}
