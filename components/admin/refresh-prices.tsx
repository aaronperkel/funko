'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client-api';

type Outcome = {
  popId: string;
  name: string;
  priced: boolean;
  message: string;
  tone: 'ok' | 'warn' | 'error';
};

type RefreshResponse = {
  status: 'completed' | 'partial' | 'failed';
  processed: number;
  priced: number;
  failed: number;
  skipped: number;
  disabled: string | null;
  outcomes: Outcome[];
};

/**
 * Runs the same refresh the weekly cron runs, on demand.
 *
 * "Everything" exists because the normal run skips figures priced in the last
 * six days — which is right for a cron and wrong for the moment you have just
 * fixed a UPC and want to see whether it worked.
 */
export function RefreshPrices({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<RefreshResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(force: boolean) {
    setPending(true);
    setError(null);
    setResult(null);

    const response = await apiFetch<RefreshResponse>('/api/pops/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force }),
    });

    setPending(false);

    if (!response.ok) {
      setError(response.error);
      return;
    }

    setResult(response.data);
    router.refresh();
  }

  const notable = result?.outcomes.filter((outcome) => outcome.tone !== 'ok') ?? [];

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run(false)}
          disabled={pending || !configured}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-hover disabled:opacity-50"
        >
          {pending ? 'Refreshing…' : 'Refresh stale prices'}
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={pending || !configured}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-hover hover:text-foreground disabled:opacity-50"
        >
          Re-price everything
        </button>
      </div>

      {!configured && (
        <p className="text-[11px] text-dim">
          Needs a PRICECHARTING_API_TOKEN. Without one the collection runs on manual values,
          which is a perfectly good way to run it.
        </p>
      )}

      {error && <p className="text-[11px] text-loss">{error}</p>}

      {result && (
        <div className="space-y-1 text-[11px]">
          {result.disabled ? (
            <p className="text-warn">{result.disabled}</p>
          ) : (
            <p className="text-muted">
              <span className="tnum">{result.priced}</span> priced ·{' '}
              <span className="tnum">{result.processed}</span> checked ·{' '}
              <span className="tnum">{result.skipped}</span> skipped as fresh
              {result.failed > 0 && (
                <>
                  {' '}
                  · <span className="tnum text-loss">{result.failed}</span> failed
                </>
              )}
            </p>
          )}

          {notable.length > 0 && (
            <ul className="max-h-48 space-y-0.5 overflow-y-auto border-t border-border pt-1">
              {notable.map((outcome) => (
                <li key={outcome.popId} className="flex gap-2">
                  <span className="shrink-0 text-foreground">{outcome.name}</span>
                  <span className={outcome.tone === 'error' ? 'text-loss' : 'text-dim'}>
                    {outcome.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
