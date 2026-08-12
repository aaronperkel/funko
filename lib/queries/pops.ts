import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { pops, type Pop } from '@/db/schema';

/**
 * Read paths for the collection. Phase 3 extends this with the
 * public/private field stripping; for now these are admin-side reads.
 */

export async function listPops(): Promise<Pop[]> {
  return db.select().from(pops).orderBy(asc(pops.name));
}

export async function listPopsNewestFirst(): Promise<Pop[]> {
  return db.select().from(pops).orderBy(desc(pops.createdAt));
}

export async function getPopById(id: string): Promise<Pop | null> {
  const rows = await db.select().from(pops).where(eq(pops.id, id)).limit(1);
  return rows[0] ?? null;
}

export type CollectionCounts = {
  total: number;
  owned: number;
  wishlist: number;
  sold: number;
  needingUpc: number;
  needingDisambiguation: number;
  withManualValue: number;
};

export function summarise(all: Pop[]): CollectionCounts {
  return {
    total: all.length,
    owned: all.filter((pop) => pop.status === 'owned').length,
    wishlist: all.filter((pop) => pop.status === 'wishlist').length,
    sold: all.filter((pop) => pop.status === 'sold').length,
    needingUpc: all.filter((pop) => pop.upc === null).length,
    needingDisambiguation: all.filter((pop) => pop.needsDisambiguation).length,
    withManualValue: all.filter((pop) => pop.manualValueCents !== null).length,
  };
}
