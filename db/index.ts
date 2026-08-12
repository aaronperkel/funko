import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { resolveDatabaseConnection } from './connection';
import * as schema from './schema';

/**
 * One driver, two deployments. Local dev points at a plain SQLite file
 * (`file:./local.db`); production points at Turso (`libsql://…`). Nothing else
 * changes — same client, same schema, same migrations.
 */
function createDbClient() {
  const { url, authToken } = resolveDatabaseConnection();
  return createClient({ url, authToken });
}

function createDb() {
  return drizzle(createDbClient(), { schema });
}

export type Db = ReturnType<typeof createDb>;

let instance: Db | null = null;

/**
 * Connects on first use, not on import.
 *
 * `next build` imports every route module to collect its configuration, so a
 * client created at module scope turns a missing environment variable into a
 * build failure reported against an unrelated route — which is exactly how
 * this first broke in production. `lib/env.ts` is lazy for the same reason;
 * this file was the one place that wasn't.
 *
 * Deliberately a function rather than a `Proxy`-wrapped `db` constant. The
 * proxy version reads more nicely at call sites, but it intercepts property
 * introspection, which silently breaks any library that inspects the client
 * (adapter-style integrations check for method existence and iterate
 * properties). Nothing here does that today; a plain function means nothing
 * added later can trip over it either.
 *
 * The trade-off of laziness is deliberate: a missing DATABASE_URL surfaces as
 * a clear error on the first request that needs the database, rather than at
 * build time — matching how every other required variable already behaves.
 */
export function getDb(): Db {
  instance ??= createDb();
  return instance;
}

export * from './schema';
