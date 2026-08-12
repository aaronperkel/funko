'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/client-api';

type ImportSummary = {
  summary: { rows: number; created: number; updated: number; skipped: number };
  outcomes: Array<
    | { row: number; action: 'created' | 'updated'; id: string; name: string }
    | { row: number; action: 'skipped'; reason: string }
  >;
};

export function ImportExport() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function importFile(file: File) {
    setPending(true);
    setError(null);
    setResult(null);

    const body = new FormData();
    body.append('file', file);

    const response = await apiFetch<ImportSummary>('/api/pops/import', {
      method: 'POST',
      body,
    });

    if (response.ok) {
      setResult(response.data);
      router.refresh();
    } else {
      setError(response.error);
    }
    setPending(false);
  }

  const skipped = result?.outcomes.filter((o) => o.action === 'skipped') ?? [];

  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {/*
          A real anchor, not next/link: this is a file download served with
          Content-Disposition. Client-side routing would try to render the CSV
          as a page instead of saving it.
        */}
        <a
          href="/api/pops/export"
          download
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-hover"
        >
          Export CSV
        </a>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-foreground hover:bg-surface-hover disabled:opacity-40"
        >
          {pending ? 'Importing…' : 'Import CSV'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
            event.target.value = '';
          }}
        />
      </div>

      <p className="text-[11px] text-dim">
        Exported rows carry their id, so re-importing an edited file updates those figures instead
        of duplicating them. Rows without an id are created.
      </p>

      {error && (
        <p role="alert" className="rounded border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded border border-border bg-surface-raised px-3 py-2 text-xs">
          <p className="tnum text-foreground">
            {result.summary.rows} rows · {result.summary.created} created ·{' '}
            {result.summary.updated} updated ·{' '}
            <span className={result.summary.skipped > 0 ? 'text-warn' : ''}>
              {result.summary.skipped} skipped
            </span>
          </p>
          {skipped.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
              {skipped.slice(0, 10).map((outcome) => (
                <li key={outcome.row}>
                  Row {outcome.row}: {'reason' in outcome ? outcome.reason : ''}
                </li>
              ))}
              {skipped.length > 10 && <li>…and {skipped.length - 10} more.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
