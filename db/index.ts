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
      'DATABASE_URL is not set. Copy .env.example to .env.local (local dev uses "file:./local.db").',
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

export const db = drizzle(createDbClient(), { schema });
export type Db = typeof db;
export * from './schema';
