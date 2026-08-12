import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';

/**
 * Shared shapes for route handlers so every endpoint fails the same way and
 * nothing leaks a stack trace to the client.
 */

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export function jsonError(message: string, status: number, details?: unknown): NextResponse {
  return NextResponse.json(
    details === undefined ? { error: message } : { error: message, details },
    { status, headers: { 'cache-control': 'no-store' } },
  );
}

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/**
 * Parses and Zod-validates a JSON request body. Returns a 400 with field-level
 * detail on failure rather than throwing.
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<ParsedBody<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError('Request body must be valid JSON.', 400) };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      response: jsonError('Validation failed.', 400, flattenZodError(result.error)),
    };
  }

  return { ok: true, data: result.data };
}

export function flattenZodError(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/**
 * Wraps a handler so an unexpected throw becomes a 500 with a logged cause
 * instead of an unhandled rejection.
 */
export async function withErrorHandling(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error: unknown) {
    console.error('[api] unhandled error:', error);
    return jsonError('Something went wrong.', 500);
  }
}
