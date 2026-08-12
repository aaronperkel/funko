import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { pops } from '@/db/schema';
import { jsonError, jsonOk, parseJsonBody, withErrorHandling } from '@/lib/api';
import { getPopById } from '@/lib/queries/pops';
import { popUpdateSchema } from '@/lib/validation';

/** Next 15+ route params are async and must be awaited. */
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const pop = await getPopById(id);
    if (!pop) return jsonError('Figure not found.', 404);
    return jsonOk({ pop });
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return withErrorHandling(async () => {
    const { id } = await params;

    const body = await parseJsonBody(request, popUpdateSchema);
    if (!body.ok) return body.response;

    if (Object.keys(body.data).length === 0) {
      return jsonError('No fields to update.', 400);
    }

    const existing = await getPopById(id);
    if (!existing) return jsonError('Figure not found.', 404);

    const [updated] = await db
      .update(pops)
      .set(body.data)
      .where(eq(pops.id, id))
      .returning();

    return jsonOk({ pop: updated });
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return withErrorHandling(async () => {
    const { id } = await params;

    const existing = await getPopById(id);
    if (!existing) return jsonError('Figure not found.', 404);

    // price_snapshots cascade via the FK.
    await db.delete(pops).where(eq(pops.id, id));
    return jsonOk({ ok: true, deletedId: id });
  });
}
