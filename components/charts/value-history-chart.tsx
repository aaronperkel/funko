'use client';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCents, formatCentsWhole } from '@/lib/money';

export type ValueHistoryPoint = { date: string; valueCents: number; pricedCount: number };

/**
 * Collection value over time.
 *
 * A single series, so no legend — the panel title names it. Recharts renders
 * client-side, hence the boundary here; the data is computed on the server.
 */
export function ValueHistoryChart({ data }: { data: ValueHistoryPoint[] }) {
  return (
    <div className="h-64 w-full px-2 pb-2">
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
            width={64}
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
            formatter={(value, _name, item) => {
              const cents = typeof value === 'number' ? value : Number(value);
              const point = item?.payload as ValueHistoryPoint | undefined;
              return [
                `${formatCents(cents)} · ${point?.pricedCount ?? 0} priced`,
                'Collection value',
              ];
            }}
          />
          <Line
            type="monotone"
            dataKey="valueCents"
            stroke="var(--accent-mark)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--background)', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
