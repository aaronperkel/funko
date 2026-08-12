import { put } from '@vercel/blob';
import { jsonError, jsonOk, withErrorHandling } from '@/lib/api';
import { env } from '@/lib/env';

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']);

/**
 * Photo upload to Vercel Blob.
 *
 * Degrades honestly: with no BLOB_READ_WRITE_TOKEN this returns a clear 503
 * telling you which variable is missing, rather than throwing a 500 that looks
 * like a bug. Photos are optional; the app works without them.
 */
export async function POST(request: Request) {
  return withErrorHandling(async () => {
    if (!env.blobToken) {
      return jsonError(
        'Photo uploads need BLOB_READ_WRITE_TOKEN. Everything else works without it.',
        503,
      );
    }

    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return jsonError('Attach an image as the "file" field.', 400);
    }
    if (file.size === 0) {
      return jsonError('That file is empty.', 400);
    }
    if (file.size > MAX_BYTES) {
      return jsonError(`Images must be under ${MAX_BYTES / 1024 / 1024} MB.`, 413);
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return jsonError(
        `Unsupported image type "${file.type || 'unknown'}". Use JPEG, PNG, WebP, AVIF, or GIF.`,
        415,
      );
    }

    try {
      const blob = await put(`pops/${crypto.randomUUID()}-${sanitiseName(file.name)}`, file, {
        access: 'public',
        token: env.blobToken,
        contentType: file.type,
      });

      return jsonOk({ url: blob.url, pathname: blob.pathname }, 201);
    } catch (error: unknown) {
      console.error('[upload] blob put failed:', error);
      return jsonError('Upload failed. The photo was not saved.', 502);
    }
  });
}

function sanitiseName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '-').slice(-80) || 'image';
}
