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
  const provided = createHash('sha256').update(candidate, 'utf8').digest();
  const expected = createHash('sha256').update(env.adminPassword, 'utf8').digest();
  return timingSafeEqual(provided, expected);
}
