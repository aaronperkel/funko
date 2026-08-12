import { formatCents } from '@/lib/money';
import type { FranchiseBreakdown } from '@/lib/valuation';

/**
 * Magnitude comparison, so bar length carries the value and a single hue is
 * correct — assigning a different color per franchise would imply the hues
 * mean something they don't. Plain CSS, no charting library and no client JS.
 */
export function FranchiseBreakdownChart({
  rows,
  showValue,
}: {
  rows: FranchiseBreakdown[];
  showValue: boolean;
}) {
  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted">No figures yet.</p>;
  }

  const scaleBy = showValue
    ? Math.max(...rows.map((row) => row.valueCents), 1)
    : Math.max(...rows.map((row) => row.count), 1);

  return (
    <ul className="space-y-1.5 px-4 py-3">
      {rows.map((row) => {
        const magnitude = showValue ? row.valueCents : row.count;
        const percent = Math.max((magnitude / scaleBy) * 100, magnitude > 0 ? 2 : 0);

        return (
          <li key={row.franchise}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate text-foreground">{row.franchise}</span>
              <span className="tnum shrink-0 text-muted">
                {showValue ? formatCents(row.valueCents) : `${row.count}`}
                <span className="ml-1.5 text-dim">
                  {showValue ? `· ${row.count}` : row.count === 1 ? 'figure' : 'figures'}
                </span>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
              <div
                className="h-full rounded-full bg-accent-mark"
                style={{ width: `${percent}%` }}
              />
            </div>
            {row.unvaluedCount > 0 && showValue && (
              <p className="mt-0.5 text-[10px] text-dim">
                {row.unvaluedCount} not yet valued
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
