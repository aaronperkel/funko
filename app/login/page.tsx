import { redirect } from 'next/navigation';
import { isAuthenticated } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await isAuthenticated()) redirect('/admin');

  const { next } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold tracking-tight">Collection</h1>
        <p className="mt-1 text-sm text-muted">Sign in to manage the collection.</p>
        <LoginForm next={sanitiseNext(next)} />
      </div>
    </main>
  );
}

/**
 * Only same-origin relative paths are accepted as a post-login destination —
 * echoing an arbitrary `next` back into a redirect is an open redirect.
 */
function sanitiseNext(next: string | undefined): string {
  if (!next) return '/admin';
  if (!next.startsWith('/') || next.startsWith('//')) return '/admin';
  return next;
}
