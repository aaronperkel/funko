import { CONDITION_TIERS, tierLabel, tierSourceLabel, type ConditionTier } from '@/lib/condition';
import { formatCents } from '@/lib/money';

/**
 * All three tiers side by side, with the figure's own tier emphasised and the
 * other two recessive.
 *
 * This is deliberately emphasis rather than three competing colors: the reader
 * has one question — "what is MINE worth" — and the other two are context that
 * shows what the box is worth. Three equal-weight colors would bury the answer.
 */
export function TierComparison({
  tier,
  tiers,
  manualValueCents,
}: {
  tier: ConditionTier;
  tiers: Record<ConditionTier, number | null>;
  manualValueCents: number | null;
}) {
  const hasAnyPrice = CONDITION_TIERS.some((key) => tiers[key] !== null);

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-3 gap-2">
        {CONDITION_TIERS.map((key) => {
          const isMine = key === tier;
          const price = tiers[key];

          return (
            <div
              key={key}
              className={`rounded-md border px-3 py-2.5 transition-colors ${
                isMine
                  ? 'border-accent/60 bg-accent/10'
                  : 'border-border bg-surface-raised'
              }`}
            >
              <div
                className={`text-[10px] font-medium uppercase tracking-wider ${
                  isMine ? 'text-accent' : 'text-dim'
                }`}
              >
                {tierSourceLabel(key)}
              </div>
              <div
                className={`tnum mt-1 text-lg font-semibold ${
                  isMine ? 'text-foreground' : 'text-muted'
                }`}
              >
                {formatCents(price)}
              </div>
              <div className="mt-0.5 text-[10px] text-dim">{tierLabel(key)}</div>
              {isMine && (
                <div className="mt-1 text-[10px] font-medium text-accent">yours</div>
              )}
            </div>
          );
        })}
      </div>

      {!hasAnyPrice && (
        <p className="mt-3 text-xs text-muted">
          {manualValueCents !== null ? (
            <>
              No market data yet — showing your manual value of{' '}
              <span className="tnum font-medium text-foreground">
                {formatCents(manualValueCents)}
              </span>
              .
            </>
          ) : (
            <>
              No market data yet. Add a UPC so this figure can be matched, or set a manual value.
            </>
          )}
        </p>
      )}

      {hasAnyPrice && manualValueCents !== null && (
        <p className="mt-3 text-xs text-warn">
          Your manual value of{' '}
          <span className="tnum font-medium">{formatCents(manualValueCents)}</span> overrides all
          three — your appraisal beats the API.
        </p>
      )}
    </div>
  );
}
