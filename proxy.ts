import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session';

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts` (exported function `proxy`),
 * and it now runs on the Node.js runtime — so `jose` verification here is the
 * same code path as everywhere else in the app.
 *
 * Three classes of route:
 *   - always public: login, logout, static assets
 *   - session-required: /admin, and every mutating API call
 *   - conditionally public: the gallery, gated on PUBLIC_GALLERY
 *
 * /api/cron/* is deliberately NOT session-guarded: it authenticates with a
 * CRON_SECRET bearer token inside the handler, because Vercel Cron has no cookie.
 */

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Admin-only JSON APIs, guarded on EVERY method rather than just mutations.
 * These return whole pop rows including purchase price and source, so a
 * method-only rule would leave cost basis readable via GET while the UI
 * carefully hid it. The public gallery never calls these — Server Components
 * read the database directly through the query layer.
 */
const ADMIN_API_PREFIXES = ['/api/pops', '/api/upload'];

/** Reachable without a session, whatever else is configured. */
const ALWAYS_PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

/**
 * Read-only pages that PUBLIC_GALLERY can expose to logged-out visitors.
 * The overview lives at "/" and is matched exactly — treating it as a prefix
 * would match every path in the app.
 */
const GALLERY_PREFIXES = ['/collection', '/pop', '/wishlist'];

function isAlwaysPublic(pathname: string): boolean {
  return ALWAYS_PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function isGalleryPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return GALLERY_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: 'Authentication required.' },
    { status: 401, headers: { 'cache-control': 'no-store' } },
  );
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = new URL('/login', request.url);
  const target = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (target && target !== '/') url.searchParams.set('next', target);
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isAlwaysPublic(pathname)) return NextResponse.next();

  // Cron authenticates itself with a bearer secret, not a session cookie.
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();

  const isApi = pathname.startsWith('/api/');
  const isMutation = MUTATING_METHODS.has(request.method);
  const isAdminArea = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdminApi = ADMIN_API_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // The admin area, the admin APIs (all methods), and anything that mutates.
  const requiresSession = isAdminArea || isAdminApi || (isApi && isMutation);

  // Read-only gallery routes are open only when PUBLIC_GALLERY allows it.
  const galleryRequiresSession =
    !env.publicGallery && !isApi && isGalleryPath(pathname);

  if (!requiresSession && !galleryRequiresSession) return NextResponse.next();

  const authenticated = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (authenticated) return NextResponse.next();

  return isApi ? unauthorized() : redirectToLogin(request);
}

export const config = {
  /*
   * Skip Next internals and static assets. Everything else — pages and API
   * routes alike — passes through the checks above.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)'],
};
