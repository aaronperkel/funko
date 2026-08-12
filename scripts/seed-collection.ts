import './load-env';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { and, eq } from 'drizzle-orm';
import { pops, type NewPop } from '../db/schema';

/**
 * Aaron's actual collection.
 *
 * Defaults are deliberately conservative: near_mint figure in a minor-damage box,
 * which resolves to the middle `damaged_box` tier. Bulk-edit upward in /admin
 * where boxes are genuinely mint rather than starting from a flattering number.
 *
 * `upc` is null everywhere — these surface as "needs UPC" in the UI, because an
 * unmatched figure cannot be priced automatically.
 *
 * `needsDisambiguation` marks names where multiple distinct figures share a title
 * and picking the wrong one produces a confidently wrong valuation.
 */
// `line` is required here so the idempotency check below has a stable composite key.
const COLLECTION: ReadonlyArray<Omit<NewPop, 'id'> & { line: string }> = [
  { name: 'Dark Trooper', line: 'Pop! Star Wars', franchise: 'Star Wars', itemNumber: 466 },
  { name: 'Emperor Palpatine', line: 'Pop! Star Wars', franchise: 'Star Wars', itemNumber: 433 },
  {
    name: 'Darth Maul with Lightsaber',
    line: 'Pop! Star Wars',
    franchise: 'Star Wars',
    itemNumber: null,
    needsDisambiguation: true,
    notes: 'Several Darth Maul releases carry a lightsaber — confirm the exact figure before pricing.',
  },
  {
    name: 'Darth Vader in TIE Fighter',
    line: 'Pop! Rides',
    franchise: 'Star Wars',
    itemNumber: 176,
    variant: 'ride',
    exclusiveTo: 'Target',
  },
  {
    name: 'Victory Shawarma Captain America',
    line: 'Pop! Marvel',
    franchise: 'Marvel',
    itemNumber: 758,
  },
  {
    name: 'Han Solo in Carbonite',
    line: 'Pop! Star Wars',
    franchise: 'Star Wars',
    itemNumber: null,
    needsDisambiguation: true,
    notes: 'Multiple Carbonite releases across sizes and exclusives — confirm which one before pricing.',
  },
  {
    name: 'Mandalorian with Grogu',
    line: 'Pop! Star Wars',
    franchise: 'Star Wars',
    itemNumber: null,
    needsDisambiguation: true,
    notes: 'Several Mando + Grogu variants exist — confirm the exact figure before pricing.',
  },
  { name: 'Enfys Nest', line: 'Pop! Star Wars', franchise: 'Star Wars', itemNumber: 247 },
  { name: 'Captain America', line: 'Pop! Marvel', franchise: 'Marvel', itemNumber: 817 },
  { name: 'Nightbrother', line: 'Pop! Star Wars', franchise: 'Star Wars', itemNumber: 457 },
  { name: 'Ahsoka', line: 'Pop! Star Wars', franchise: 'Star Wars', itemNumber: 414 },
  { name: 'Concept Series R2-D2', line: 'Pop! Star Wars', franchise: 'Star Wars', itemNumber: 424 },
  { name: 'Falcon', line: 'Pop! Marvel', franchise: 'Marvel', itemNumber: 812 },
  { name: 'Mo', line: 'Pop! Wall-E', franchise: 'Wall-E', itemNumber: 1117 },
  { name: 'Barney Gumble', line: 'Pop! Simpsons', franchise: 'The Simpsons', itemNumber: 901 },
  {
    name: 'Steamboat Mickey (Art Series)',
    line: 'Pop! Art Series',
    franchise: 'Disney',
    itemNumber: 18,
    needsDisambiguation: true,
    notes: 'Art Series #18 is worth a fraction of the metallic Steamboat Willie #24 — do not conflate.',
  },
  { name: 'Jay', line: 'Pop! Modern Family', franchise: 'Modern Family', itemNumber: 756 },
  {
    name: 'Inquisitor Second Sister',
    line: 'Pop! Star Wars',
    franchise: 'Star Wars',
    itemNumber: 338,
  },
  {
    name: 'Danny McGrath',
    line: 'Pop! Movies',
    franchise: 'Billy Madison',
    itemNumber: 898,
  },
  { name: 'Wall-E', line: 'Pop! Wall-E', franchise: 'Wall-E', itemNumber: 1196 },
  { name: 'Cal Kestis & BD-1', line: 'Pop! Star Wars', franchise: 'Star Wars', itemNumber: 337 },
  {
    name: 'Wall-E with Fire Extinguisher',
    line: 'Pop! Wall-E',
    franchise: 'Wall-E',
    itemNumber: 1115,
  },
  { name: 'Winter Soldier', line: 'Pop! Marvel', franchise: 'Marvel', itemNumber: 813 },
];

/**
 * Import defaults — see the note above.
 *
 * `near_mint` on both, which reads as the `new` tier. Boxes that have sat on a
 * shelf are near-mint, not damaged; the earlier `minor_damage` default valued
 * an undamaged collection at "In Dmg Box", which understated it by roughly a
 * quarter. Correct anything genuinely creased or crushed in the bulk editor.
 */
const DEFAULTS = {
  condition: 'near_mint',
  hasBox: true,
  boxCondition: 'near_mint',
  hasProtector: false,
  quantity: 1,
  status: 'owned',
  acquiredAs: 'unknown',
  upc: null,
  matchStatus: 'unmatched',
} as const satisfies Partial<NewPop>;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  const client = createClient({
    url,
    authToken: url.startsWith('file:') ? undefined : process.env.DATABASE_AUTH_TOKEN,
  });
  const db = drizzle(client);

  let inserted = 0;
  let skipped = 0;

  // Idempotent: re-running adds nothing and destroys nothing, so it is safe to
  // run again after hand-editing conditions in /admin.
  for (const entry of COLLECTION) {
    const existing = await db
      .select({ id: pops.id })
      .from(pops)
      .where(and(eq(pops.name, entry.name), eq(pops.line, entry.line)))
      .limit(1);

    if (existing.length > 0) {
      skipped += 1;
      continue;
    }

    await db.insert(pops).values({ ...DEFAULTS, ...entry });
    inserted += 1;
  }

  const ambiguous = COLLECTION.filter((entry) => entry.needsDisambiguation).length;
  const missingNumber = COLLECTION.filter((entry) => entry.itemNumber == null).length;

  console.log(`Seed complete: ${inserted} inserted, ${skipped} already present.`);
  console.log(`  ${COLLECTION.length} figures defined`);
  console.log(`  ${ambiguous} flagged needsDisambiguation`);
  console.log(`  ${missingNumber} missing an item number`);
  console.log(`  ${COLLECTION.length} needing a UPC before they can be priced automatically`);

  client.close();
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
