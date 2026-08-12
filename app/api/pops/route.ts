import { getDb } from '@/db';
import { pops } from '@/db/schema';
import { jsonOk, parseJsonBody, withErrorHandling } from '@/lib/api';
import { listPops } from '@/lib/queries/pops';
import { popCreateSchema } from '@/lib/validation';

export async function GET() {
  return withErrorHandling(async () => {
    const all = await listPops();
    return jsonOk({ pops: all });
  });
}

export async function POST(request: Request) {
  return withErrorHandling(async () => {
    const body = await parseJsonBody(request, popCreateSchema);
    if (!body.ok) return body.response;

    const [created] = await getDb().insert(pops).values(body.data).returning();
    return jsonOk({ pop: created }, 201);
  });
}
