/**
 * Where the database connection details come from.
 *
 * Two naming conventions have to work here:
 *
 *   DATABASE_URL / DATABASE_AUTH_TOKEN   — this app's own names, used locally
 *                                          and by anyone setting variables by hand
 *   TURSO_DATABASE_URL / TURSO_AUTH_TOKEN — what the Turso integration on the
 *                                          Vercel Marketplace injects automatically
 *
 * Supporting both means provisioning Turso through the Marketplace needs no
 * manual environment work at all, while a hand-configured deployment keeps the
 * names in `.env.example`. The app's own names win when both are present, so an
 * explicit override always beats an injected default.
 *
 * Shared by the runtime client, the migration script, and drizzle-kit, so all
 * three can never disagree about which database they are pointed at.
 */

export type DatabaseConnection = {
  url: string;
  /** Undefined for a local `file:` database, which needs no auth. */
  authToken: string | undefined;
  isLocalFile: boolean;
  /** Which variable the URL came from, for error messages and logging. */
  source: string;
};

/**
 * URL variables in precedence order.
 *
 * `DATABASE_TURSO_*` is what the Turso integration on the Vercel Marketplace
 * actually injects — the `DATABASE_` prefix is Vercel's, added per storage
 * integration. The unprefixed `TURSO_*` pair is what Turso's own docs and
 * quickstarts use, so it is accepted too for a hand-provisioned database.
 */
const URL_VARS = ['DATABASE_URL', 'DATABASE_TURSO_DATABASE_URL', 'TURSO_DATABASE_URL'] as const;

const TOKEN_VARS = [
  'DATABASE_AUTH_TOKEN',
  'DATABASE_TURSO_AUTH_TOKEN',
  'TURSO_AUTH_TOKEN',
] as const;

/**
 * Takes a plain string map rather than `NodeJS.ProcessEnv`: this reads a handful
 * of named keys and nothing else, and the wider type would force every test to
 * supply `NODE_ENV` to describe a database.
 */
export function resolveDatabaseConnection(
  env: Record<string, string | undefined> = process.env,
): DatabaseConnection {
  const source = URL_VARS.find((name) => env[name]);
  const url = source ? env[source] : undefined;

  if (!source || !url) {
    throw new Error(
      'No database URL. Locally, copy .env.example to .env.local and use "file:./local.db". ' +
        'On Vercel, install the Turso integration — it provides DATABASE_TURSO_DATABASE_URL ' +
        'automatically — or set DATABASE_URL yourself in Project Settings → Environment Variables.',
    );
  }

  const isLocalFile = url.startsWith('file:');

  /*
   * A `file:` database on Vercel is always a mistake — the filesystem is
   * ephemeral and read-only, so it yields an empty database rather than an
   * error, which is the worst possible failure: the app "works" and shows
   * nothing. It happens by copying .env.local into the project settings, and
   * because an explicit DATABASE_URL outranks an injected TURSO_DATABASE_URL,
   * a leftover file: URL silently wins even after Turso is provisioned.
   */
  if (isLocalFile && env.VERCEL) {
    throw new Error(
      `${source} is "${url}", a local file, but this is running on Vercel where there is no ` +
        'persistent filesystem. Remove that variable from your Vercel project settings and use a ' +
        'Turso database — the Turso integration provides TURSO_DATABASE_URL automatically.',
    );
  }

  const tokenVar = TOKEN_VARS.find((name) => env[name]);
  const authToken = tokenVar ? env[tokenVar] : undefined;

  if (!isLocalFile && !authToken) {
    throw new Error(
      `${source} is remote ("${url.split(':')[0]}:") but no auth token is set. ` +
        `Set one of: ${TOKEN_VARS.join(', ')}.`,
    );
  }

  return {
    url,
    authToken: isLocalFile ? undefined : authToken,
    isLocalFile,
    source,
  };
}
