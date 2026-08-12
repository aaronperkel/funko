import { jsonOk, withErrorHandling } from '@/lib/api';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session';

export async function POST() {
  return withErrorHandling(async () => {
    const response = jsonOk({ ok: true });
    response.cookies.set(SESSION_COOKIE, '', { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  });
}
