import { createHash, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * Constant-time password check.
 *
 * Both sides are hashed first so the comparison operates on two equal-length
 * 32-byte digests — `timingSafeEqual` throws on length mismatch, and comparing
 * raw inputs would leak the password's length through that error.
 *
 * Kept in its own module (node:crypto) so lib/auth.ts stays runtime-portable.
 */
export function passwordMatches(candidate: string): boolean {
  return secretMatches(candidate, env.adminPassword);
}

/**
 * The same constant-time comparison for any shared secret — used by the cron
 * route's bearer check, which is a password by another name.
 */
export function secretMatches(candidate: string, expected: string): boolean {
  const a = createHash('sha256').update(candidate, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}
