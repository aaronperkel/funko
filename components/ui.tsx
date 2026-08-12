import type { ReactNode } from 'react';

/**
 * Shared primitives for the dense, dark inventory chrome. Deliberately small —
 * the gallery in Phase 3 is where the visual weight goes.
 */

export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-lg border border-border bg-surface ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div>
            {title && (
              <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
            )}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'gain' | 'loss' | 'warn';
}) {
  const toneClass =
    tone === 'gain'
      ? 'text-gain'
      : tone === 'loss'
        ? 'text-loss'
        : tone === 'warn'
          ? 'text-warn'
          : 'text-foreground';

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wider text-dim">{label}</div>
      <div className={`tnum mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'border-border-strong bg-surface-raised text-muted',
  chase: 'border-chase/40 bg-chase/10 text-chase',
  exclusive: 'border-exclusive/40 bg-exclusive/10 text-exclusive',
  warn: 'border-warn/40 bg-warn/10 text-warn',
  gain: 'border-gain/40 bg-gain/10 text-gain',
  loss: 'border-loss/40 bg-loss/10 text-loss',
  accent: 'border-accent/40 bg-accent/10 text-accent',
} as const;

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONES;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${BADGE_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      {children && <div className="mt-1 text-xs text-muted">{children}</div>}
    </div>
  );
}
