import Link from 'next/link';
import type { Pop } from '@/db/schema';
import { parseMatchCandidates } from '@/lib/pricing/refresh';
import { MatchReview } from '@/components/pricing/match-review';

/**
 * Figures a text search found but would not price.
 *
 * This queue is the reason automatic pricing is trustworthy at all: everything
 * in it is a guess, and none of it becomes a number until a human agrees.
 */
export function ReviewQueue({ pops }: { pops: Pop[] }) {
  if (pops.length === 0) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-xs text-muted">Nothing waiting on a decision.</p>
        <p className="mt-1 text-[11px] text-dim">
          Fuzzy name matches land here instead of being priced automatically.
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {pops.map((pop) => {
        const candidates = parseMatchCandidates(pop.matchCandidates);

        return (
          <li key={pop.id}>
            <div className="flex items-baseline justify-between gap-3 px-4 pt-3">
              <Link
                href={`/pop/${pop.id}`}
                className="text-xs font-medium text-foreground hover:text-accent"
              >
                {pop.name}
              </Link>
              <span className="text-[10px] uppercase tracking-wider text-dim">
                {pop.franchise ?? pop.line ?? 'unattributed'}
              </span>
            </div>

            {candidates.length > 0 ? (
              <MatchReview popId={pop.id} candidates={candidates} note={pop.matchNote} />
            ) : (
              <p className="px-4 pb-3 pt-1 text-[11px] text-dim">
                Queued, but the stored candidates could not be read. Refresh this figure to
                search again.
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
