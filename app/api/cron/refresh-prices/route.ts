import { env } from '@/lib/env';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { secretMatches } from '@/lib/password';
import { DEFAULT_LIMIT, refreshPops } from '@/lib/pricing/refresh';

/**
 * The weekly price refresh, invoked by Vercel Cron (see vercel.json).
 *
 * Vercel Cron sends no cookies, so this route is exempt from the session guard
 * in proxy.ts and authenticates itself here with a bearer secret instead —
 * Vercel automatically attaches `Authorization: Bearer $CRON_SECRET` to cron
 * invocations of a project that has CRON_SECRET set.
 *
 * With no CRON_SECRET configured the route refuses everything. An unguarded
 * endpoint that spends paid API quota is not a safe default.
 */

export const dynamic = 'force-dynamic';

/** Sequential lookups with a delay need room; the platform default is 300s. */
export const maxDuration = 300;

export async function GET(request: Request) {
  return withErrorHandling(async () => {
    const secret = env.cronSecret;

    if (!secret) {
      return jsonError(
        'CRON_SECRET is not configured, so the refresh endpoint is disabled.',
        503,
      );
    }

    const header = request.headers.get('authorization') ?? '';
    const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

    if (provided === '' || !secretMatches(provided, secret)) {
      return jsonError('Unauthorized.', 401);
    }

    const result = await refreshPops({
      now: new Date(),
      limit: DEFAULT_LIMIT,
      trigger: 'cron',
    });

    return jsonOk({
      status: result.status,
      processed: result.processed,
      priced: result.priced,
      failed: result.failed,
      skipped: result.skipped,
      disabled: result.disabled ?? null,
    });
  });
}
