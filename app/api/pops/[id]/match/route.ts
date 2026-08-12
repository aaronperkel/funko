import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { pops } from '@/db/schema';
import { isAuthenticated } from '@/lib/auth';
import { jsonError, jsonOk, parseJsonBody, withErrorHandling } from '@/lib/api';
import { getPopById } from '@/lib/queries/pops';
import { createProviders } from '@/lib/pricing/registry';
import { refreshOnePop } from '@/lib/pricing/refresh';
import { matchDecisionSchema } from '@/lib/validation';

/**
 * Resolves a queued fuzzy match — the human half of the review queue.
 *
 * Text search never prices anything on its own, because a wrong match writes a
 * plausible-looking wrong number that nothing would ever catch. Confirming here
 * is what unlocks pricing, and it prices immediately so the decision has a
 * visible result rather than waiting a week for the cron.
 */

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  return withErrorHandling(async () => {
    if (!(await isAuthenticated())) return jsonError('Authentication required.', 401);

    const { id } = await params;

    const body = await parseJsonBody(request, matchDecisionSchema);
    if (!body.ok) return body.response;

    const existing = await getPopById(id);
    if (!existing) return jsonError('Figure not found.', 404);

    if (body.data.action === 'reject') {
      /*
       * Rejected figures are skipped by later refreshes while they stay
       * unidentified — re-running the same search would only re-queue the same
       * wrong candidates. Adding a UPC brings them straight back in.
       */
      await db
        .update(pops)
        .set({
          matchStatus: 'rejected',
          priceChartingId: null,
          priceChartingConsole: null,
          ebayEpid: null,
          matchCandidates: null,
          matchNote: 'You dismissed every candidate. Add a UPC or a search override to try again.',
        })
        .where(eq(pops.id, id));

      return jsonOk({
        matchStatus: 'rejected',
        message: 'Dismissed. Add a UPC or a search override to try again.',
      });
    }

    await db
      .update(pops)
      .set({
        matchStatus: 'confirmed',
        priceChartingId: body.data.priceChartingId,
        matchCandidates: null,
        matchNote: null,
      })
      .where(eq(pops.id, id));

    const confirmed = await getPopById(id);
    if (!confirmed) return jsonError('Figure not found.', 404);

    const providers = createProviders();
    if (!providers.priceCharting.isConfigured()) {
      return jsonOk({
        matchStatus: 'confirmed',
        message: 'Match saved. It will be priced once a PRICECHARTING_API_TOKEN is set.',
      });
    }

    const outcome = await refreshOnePop(confirmed, providers);
    return jsonOk({ matchStatus: outcome.matchStatus, message: outcome.message, outcome });
  });
}
