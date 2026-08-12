import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

/**
 * One driver, two deployments. Local dev points at a plain SQLite file
 * (`file:./local.db`); production points at Turso (`libsql://…`). Nothing else
 * changes — same client, same schema, same migrations.
 */
function createDbClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Locally, copy .env.example to .env.local ("file:./local.db"). On Vercel, add it in Project Settings → Environment Variables.',
    );
  }

  const isLocalFile = url.startsWith('file:');
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  if (!isLocalFile && !authToken) {
    throw new Error(
      `DATABASE_URL is remote ("${url.split(':')[0]}:") but DATABASE_AUTH_TOKEN is not set.`,
    );
  }

  return createClient({
    url,
    authToken: isLocalFile ? undefined : authToken,
  });
}

function createDb() {
  return drizzle(createDbClient(), { schema });
}

export type Db = ReturnType<typeof createDb>;

let instance: Db | null = null;

function getDb(): Db {
  instance ??= createDb();
  return instance;
}

/**
 * Connected on first use, not on import.
 *
 * `next build` imports every route module to collect its configuration, so
 * anything that connects at module scope turns a missing environment variable
 * into a build failure reported against an unrelated route — which is exactly
 * how this first broke. `lib/env.ts` is lazy for the same reason; this file was
 * the one place that wasn't, and the inconsistency was the bug.
 *
 * The trade-off is deliberate: a missing DATABASE_URL now surfaces as a clear
 * error on the first request that needs the database, rather than at build
 * time, which is how every other required variable in this app already behaves.
 */
export const db = new Proxy({} as Db, {
  get(_target, property) {
    const real = getDb();
    // `receiver` is the real instance, not the proxy, so drizzle's internal
    // `this` and any prototype getters resolve against the actual client.
    const value = Reflect.get(real, property, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
  has(_target, property) {
    return Reflect.has(getDb(), property);
  },
});

export * from './schema';
