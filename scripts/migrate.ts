import './load-env';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { resolveDatabaseConnection } from '../db/connection';

/**
 * Applies generated migrations. Works identically against a local SQLite file
 * and a remote Turso database — the URL is the only difference.
 */
async function main() {
  const { url, authToken, isLocalFile } = resolveDatabaseConnection();
  const client = createClient({ url, authToken });

  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './drizzle' });

  console.log(`Migrations applied to ${isLocalFile ? url : 'remote Turso database'}.`);
  client.close();
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
