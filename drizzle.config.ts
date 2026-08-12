import './scripts/load-env';
import { defineConfig } from 'drizzle-kit';
import { resolveDatabaseConnection } from './db/connection';

/*
 * Resolved through the same helper the app and the migration script use, so
 * drizzle-kit can never generate against a different database than the one the
 * migrations are applied to.
 */
const connection = resolveDatabaseConnection();

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: {
    url: connection.url,
    authToken: connection.authToken,
  },
});
