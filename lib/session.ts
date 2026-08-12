import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/env';

export const SESSION_COOKIE = 'funko_session';

/** 30 days, per spec. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const ALGORITHM = 'HS256';

/**
 * Signed with AUTH_SECRET rather than something derived from ADMIN_PASSWORD:
 * rotating the password should be a deliberate act, not a silent mass logout.
 */
function signingKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret);
}

export async function createSessionToken(): Promise<string> {
  return new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject('admin')
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(signingKey());
}

/** Never throws — an invalid, expired, or absent token is simply "not signed in". */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, signingKey(), { algorithms: [ALGORITHM] });
    return true;
  } catch {
    return false;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}
