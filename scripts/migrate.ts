import './load-env';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

/**
 * Applies generated migrations. Works identically against a local SQLite file
 * and a remote Turso database — the URL is the only difference.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  const isLocalFile = url.startsWith('file:');
  const client = createClient({
    url,
    authToken: isLocalFile ? undefined : process.env.DATABASE_AUTH_TOKEN,
  });

  const db = drizzle(client);
  await migrate(db, { migrationsFolder: './drizzle' });

  console.log(`Migrations applied to ${isLocalFile ? url : 'remote Turso database'}.`);
  client.close();
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
