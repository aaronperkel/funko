import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { pops } from '@/db/schema';
import { jsonOk, parseJsonBody, withErrorHandling } from '@/lib/api';
import { popBulkUpdateSchema } from '@/lib/validation';

/**
 * Bulk edit: correcting condition and box state across many figures in one
 * pass, rather than opening 23 forms.
 */
export async function PATCH(request: Request) {
  return withErrorHandling(async () => {
    const body = await parseJsonBody(request, popBulkUpdateSchema);
    if (!body.ok) return body.response;

    const { ids, patch } = body.data;

    const updated = await db
      .update(pops)
      .set(patch)
      .where(inArray(pops.id, ids))
      .returning({ id: pops.id });

    return jsonOk({
      ok: true,
      requested: ids.length,
      updated: updated.length,
      updatedIds: updated.map((row) => row.id),
    });
  });
}
