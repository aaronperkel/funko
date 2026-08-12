import Link from 'next/link';
import { isAuthenticated } from '@/lib/auth';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/collection', label: 'Collection' },
  { href: '/wishlist', label: 'Wishlist' },
] as const;

export async function Nav() {
  const signedIn = await isAuthenticated();

  return (
    <nav className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-1 px-5 py-2.5">
        <Link href="/" className="mr-3 text-sm font-semibold tracking-tight">
          Collection
        </Link>

        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}

        <div className="ml-auto">
          <Link
            href={signedIn ? '/admin' : '/login'}
            className="rounded px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {signedIn ? 'Admin' : 'Sign in'}
          </Link>
        </div>
      </div>
    </nav>
  );
}
