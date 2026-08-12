'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCents, formatCentsWhole } from '@/lib/money';

export type PopHistoryPoint = { date: string; valueCents: number };

/**
 * One figure's value over time, at its own tier.
 *
 * `costBasisCents` draws the line that actually matters — above it you are up,
 * below it you are down — and is only ever passed in for an authenticated
 * reader, because it is cost basis.
 */
export function PopHistoryChart({
  data,
  costBasisCents,
}: {
  data: PopHistoryPoint[];
  costBasisCents?: number | null;
}) {
  return (
    <div className="h-56 w-full px-2 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="var(--grid)" strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--dim)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--axis)' }}
            tickFormatter={(value: string) => value.slice(5)}
            minTickGap={24}
          />
          <YAxis
            tick={{ fill: 'var(--dim)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={60}
            tickFormatter={(value: number) => formatCentsWhole(value)}
          />
          <Tooltip
            cursor={{ stroke: 'var(--axis)', strokeWidth: 1 }}
            contentStyle={{
              background: 'var(--surface-raised)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              fontSize: 12,
            }}
            labelStyle={{ color: 'var(--muted)' }}
            formatter={(value) => {
              const cents = typeof value === 'number' ? value : Number(value);
              return [formatCents(cents), 'Value at your tier'];
            }}
          />
          {typeof costBasisCents === 'number' && costBasisCents > 0 && (
            <ReferenceLine
              y={costBasisCents}
              stroke="var(--axis)"
              strokeDasharray="4 4"
              label={{
                value: `paid ${formatCentsWhole(costBasisCents)}`,
                position: 'insideBottomLeft',
                fill: 'var(--dim)',
                fontSize: 10,
              }}
            />
          )}
          <Line
            type="monotone"
            dataKey="valueCents"
            stroke="var(--accent-mark)"
            strokeWidth={2}
            dot={{ r: 2, fill: 'var(--accent-mark)' }}
            activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--background)', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
