'use client';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Every client-side call returns a typed result rather than throwing, so a
 * failed request renders an inline message instead of an error boundary.
 */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(url, init);
  } catch {
    return { ok: false, error: 'Could not reach the server.' };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON responses are handled by the status check below.
  }

  if (!response.ok) {
    return { ok: false, error: extractError(body, response.status) };
  }

  return { ok: true, data: body as T };
}

function extractError(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;

    const detail =
      record.details && typeof record.details === 'object'
        ? Object.entries(record.details as Record<string, string[]>)
            .map(([field, messages]) => `${field}: ${messages.join(', ')}`)
            .join(' · ')
        : null;

    if (typeof record.error === 'string') {
      return detail ? `${record.error} ${detail}` : record.error;
    }
  }

  if (status === 401) return 'Session expired — sign in again.';
  return `Request failed (${status}).`;
}
