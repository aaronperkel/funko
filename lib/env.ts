/**
 * Typed, lazy environment access.
 *
 * Deliberately lazy: reading these at module scope would fail `next build`
 * whenever a secret is absent, which is exactly the situation the pricing
 * providers are supposed to survive. Required values throw at the point of
 * use; optional values return null so callers can degrade instead of crash.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

function optional(name: string): string | null {
  const value = process.env[name];
  return value && value.length > 0 ? value : null;
}

export const env = {
  get adminPassword(): string {
    return required('ADMIN_PASSWORD');
  },
  get authSecret(): string {
    return required('AUTH_SECRET');
  },
  /** Default true: the gallery is readable logged-out unless explicitly disabled. */
  get publicGallery(): boolean {
    return (process.env.PUBLIC_GALLERY ?? 'true').toLowerCase() !== 'false';
  },
  get cronSecret(): string | null {
    return optional('CRON_SECRET');
  },
  get priceChartingToken(): string | null {
    return optional('PRICECHARTING_API_TOKEN');
  },
  get ebayClientId(): string | null {
    return optional('EBAY_CLIENT_ID');
  },
  get ebayClientSecret(): string | null {
    return optional('EBAY_CLIENT_SECRET');
  },
  get blobToken(): string | null {
    return optional('BLOB_READ_WRITE_TOKEN');
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  },
} as const;
