import { z } from 'zod';
import { jsonError, jsonOk, parseJsonBody, withErrorHandling } from '@/lib/api';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/session';
import { passwordMatches } from '@/lib/password';

const loginSchema = z.object({
  password: z.string().min(1, 'Password is required.'),
});

export async function POST(request: Request) {
  return withErrorHandling(async () => {
    const body = await parseJsonBody(request, loginSchema);
    if (!body.ok) return body.response;

    if (!passwordMatches(body.data.password)) {
      // Deliberately vague, and identical in shape to any other failure.
      return jsonError('Incorrect password.', 401);
    }

    const token = await createSessionToken();
    const response = jsonOk({ ok: true });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  });
}
