'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client-api';

type Outcome = {
  priced: boolean;
  message: string;
  tone: 'ok' | 'warn' | 'error';
};

/**
 * "Refresh price now" for a single figure.
 *
 * The result is always shown, including the unglamorous ones — "no prices for
 * this figure yet" and "queued for review" are information, and a button that
 * silently does nothing on those paths would read as broken.
 */
export function RefreshPriceButton({ popId }: { popId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function refresh() {
    setPending(true);
    setOutcome(null);

    const result = await apiFetch<{ outcome: Outcome }>(`/api/pops/${popId}/refresh`, {
      method: 'POST',
    });

    setPending(false);

    if (!result.ok) {
      setOutcome({ priced: false, message: result.error, tone: 'error' });
      return;
    }

    setOutcome(result.data.outcome);
    if (result.data.outcome.priced) router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={refresh}
        disabled={pending}
        className="rounded-md border border-border px-2.5 py-1 text-xs text-foreground hover:bg-surface-hover disabled:opacity-50"
      >
        {pending ? 'Checking…' : 'Refresh price'}
      </button>
      {outcome && (
        <p
          className={`max-w-[26rem] text-right text-[11px] ${
            outcome.tone === 'error'
              ? 'text-loss'
              : outcome.tone === 'warn'
                ? 'text-warn'
                : 'text-gain'
          }`}
        >
          {outcome.message}
        </p>
      )}
    </div>
  );
}
