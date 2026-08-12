'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/client-api';

type Props = { value: string | null; onChange: (url: string | null) => void };

export function PhotoUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setUploading(true);
    setError(null);

    const body = new FormData();
    body.append('file', file);

    const result = await apiFetch<{ url: string }>('/api/upload', { method: 'POST', body });

    if (result.ok) {
      onChange(result.data.url);
    } else {
      setError(result.error);
    }
    setUploading(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          <Image
            src={value}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="size-16 rounded border border-border object-cover"
          />
        ) : (
          <div className="flex size-16 items-center justify-center rounded border border-dashed border-border text-[10px] text-dim">
            no photo
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-md border border-border px-2.5 py-1.5 text-xs text-foreground hover:bg-surface-hover disabled:opacity-40"
          >
            {uploading ? 'Uploading…' : value ? 'Replace' : 'Upload photo'}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-surface-hover"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.target.value = '';
        }}
      />

      {error && <p className="text-[11px] text-loss">{error}</p>}
    </div>
  );
}
