'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { MatchCandidate } from '@/lib/pricing/provider';
import { apiFetch } from '@/lib/client-api';

/**
 * The human half of the review queue.
 *
 * A text search never prices anything on its own — "Mo", "Jay", "Falcon" and
 * "Captain America" all collide with video games in PriceCharting's index, and
 * a wrong match writes a plausible-looking wrong number that nothing would ever
 * catch. So the candidates land here and wait for a decision.
 */
export function MatchReview({
  popId,
  candidates,
  note,
}: {
  popId: string;
  candidates: MatchCandidate[];
  note?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function decide(action: 'confirm' | 'reject', priceChartingId?: string) {
    setPending(priceChartingId ?? action);
    setError(null);

    const result = await apiFetch<{ message: string }>(`/api/pops/${popId}/match`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        action === 'confirm' ? { action, priceChartingId } : { action },
      ),
    });

    setPending(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setDone(result.data.message);
    router.refresh();
  }

  if (done) {
    return <p className="px-4 py-3 text-xs text-gain">{done}</p>;
  }

  return (
    <div className="space-y-2 px-4 py-3">
      {note && <p className="text-xs text-muted">{note}</p>}

      <ul className="divide-y divide-border">
        {candidates.map((candidate) => (
          <li key={candidate.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-foreground">{candidate.name}</div>
              <div className="truncate text-[11px] text-dim">{candidate.console}</div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href={`https://www.pricecharting.com/game/${encodeURIComponent(candidate.id)}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[11px] text-accent hover:underline"
              >
                check
              </a>
              <button
                type="button"
                onClick={() => decide('confirm', candidate.id)}
                disabled={pending !== null}
                className="rounded border border-accent/50 bg-accent/10 px-2 py-0.5 text-[11px] text-accent hover:bg-accent/20 disabled:opacity-50"
              >
                {pending === candidate.id ? 'saving…' : 'this one'}
              </button>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => decide('reject')}
          disabled={pending !== null}
          className="text-[11px] text-muted hover:text-foreground disabled:opacity-50"
        >
          {pending === 'reject' ? 'saving…' : 'None of these'}
        </button>
        <span className="text-[10px] text-dim">
          Confirming prices it immediately.
        </span>
      </div>

      {error && <p className="text-[11px] text-loss">{error}</p>}
    </div>
  );
}
