import { describe, expect, it } from 'vitest';
import { resolveDatabaseConnection } from '@/db/connection';

/**
 * The deploy-shaped failure modes. Every case here is one someone actually
 * hits: a fresh Vercel project with nothing set, a Marketplace integration
 * that injects its own variable names, and a hand-configured deployment.
 */

describe('resolveDatabaseConnection', () => {
  it('uses a local file with no auth token', () => {
    expect(resolveDatabaseConnection({ DATABASE_URL: 'file:./local.db' })).toEqual({
      url: 'file:./local.db',
      authToken: undefined,
      isLocalFile: true,
      source: 'DATABASE_URL',
    });
  });

  it('accepts the app’s own variable names', () => {
    expect(
      resolveDatabaseConnection({
        DATABASE_URL: 'libsql://funko.turso.io',
        DATABASE_AUTH_TOKEN: 'token',
      }),
    ).toMatchObject({ url: 'libsql://funko.turso.io', authToken: 'token' });
  });

  /*
   * The Turso integration on the Vercel Marketplace injects TURSO_DATABASE_URL
   * and TURSO_AUTH_TOKEN. Reading only DATABASE_URL would mean a correctly
   * provisioned database still failed at runtime with "not set".
   */
  it('accepts the names the Turso Vercel integration injects', () => {
    expect(
      resolveDatabaseConnection({
        TURSO_DATABASE_URL: 'libsql://funko.turso.io',
        TURSO_AUTH_TOKEN: 'injected',
      }),
    ).toEqual({
      url: 'libsql://funko.turso.io',
      authToken: 'injected',
      isLocalFile: false,
      source: 'TURSO_DATABASE_URL',
    });
  });

  it('lets an explicit override beat an injected default', () => {
    const resolved = resolveDatabaseConnection({
      DATABASE_URL: 'libsql://explicit.turso.io',
      DATABASE_AUTH_TOKEN: 'explicit',
      TURSO_DATABASE_URL: 'libsql://injected.turso.io',
      TURSO_AUTH_TOKEN: 'injected',
    });
    expect(resolved.url).toBe('libsql://explicit.turso.io');
    expect(resolved.authToken).toBe('explicit');
  });

  it('mixes conventions rather than failing on a half-match', () => {
    const resolved = resolveDatabaseConnection({
      DATABASE_URL: 'libsql://funko.turso.io',
      TURSO_AUTH_TOKEN: 'injected',
    });
    expect(resolved.authToken).toBe('injected');
  });

  it('names both options when nothing is configured', () => {
    expect(() => resolveDatabaseConnection({})).toThrow(/DATABASE_URL/);
    expect(() => resolveDatabaseConnection({})).toThrow(/Turso integration/);
  });

  it('refuses a remote database with no auth token', () => {
    expect(() =>
      resolveDatabaseConnection({ DATABASE_URL: 'libsql://funko.turso.io' }),
    ).toThrow(/no auth token/i);
  });

  it('ignores an auth token that would be meaningless on a local file', () => {
    const resolved = resolveDatabaseConnection({
      DATABASE_URL: 'file:./local.db',
      DATABASE_AUTH_TOKEN: 'pointless',
    });
    expect(resolved.authToken).toBeUndefined();
  });
});
