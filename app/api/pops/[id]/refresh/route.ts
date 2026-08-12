import { isAuthenticated } from '@/lib/auth';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { getPopById } from '@/lib/queries/pops';
import { createProviders } from '@/lib/pricing/registry';
import { refreshOnePop } from '@/lib/pricing/refresh';

/** "Refresh price now" on the detail page. Ignores staleness — you asked for it. */

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Context) {
  return withErrorHandling(async () => {
    if (!(await isAuthenticated())) return jsonError('Authentication required.', 401);

    const { id } = await params;
    const pop = await getPopById(id);
    if (!pop) return jsonError('Figure not found.', 404);

    const providers = createProviders();

    if (!providers.priceCharting.isConfigured()) {
      return jsonOk({
        outcome: {
          popId: pop.id,
          name: pop.name,
          priced: false,
          matchStatus: pop.matchStatus,
          message:
            'No PRICECHARTING_API_TOKEN is set. Set a manual value instead — it beats the API anyway.',
          tone: 'warn' as const,
        },
      });
    }

    const outcome = await refreshOnePop(pop, providers);
    return jsonOk({ outcome });
  });
}
