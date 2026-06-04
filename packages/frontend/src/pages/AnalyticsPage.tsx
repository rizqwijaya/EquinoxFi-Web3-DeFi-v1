/**
 * Analytics page: protocol KPI cards plus a TVL-over-time area chart derived
 * from the indexed Staked/Withdrawn activity (cumulative net stake by block),
 * and a recent-activity feed.
 */
import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatUnits } from 'viem';
import { useStats, useActivity, type HistoryEvent } from '../hooks';
import { StatCard } from '../components/ui';
import { fmt } from '../format';

/** Build a cumulative TVL series (ascending by block) from activity events. */
function buildTvlSeries(events: HistoryEvent[]): { block: number; tvl: number }[] {
  const ordered = [...events]
    .filter((e) => e.kind === 'Staked' || e.kind === 'Withdrawn')
    .sort((a, b) => a.blockNumber - b.blockNumber);

  let running = 0;
  return ordered.map((e) => {
    const delta = Number(formatUnits(BigInt(e.amount), 18));
    running += e.kind === 'Staked' ? delta : -delta;
    return { block: e.blockNumber, tvl: Math.max(running, 0) };
  });
}

export function AnalyticsPage() {
  const { data: stats } = useStats();
  const { data: activity } = useActivity();

  const series = useMemo(() => buildTvlSeries(activity?.events ?? []), [activity]);

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      <h2 className="text-2xl font-bold mt-8 mb-4">Analytics</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Value Locked"
          value={stats ? fmt(BigInt(stats.totalStaked)) : '—'}
          sub="eSTAKE"
          accent
        />
        <StatCard label="Total Stakers" value={stats ? stats.totalStakers : '—'} />
        <StatCard
          label="Reward Rate"
          value={stats ? `${fmt(BigInt(stats.rewardRate))}` : '—'}
          sub="eRWD / sec"
        />
        <StatCard
          label="Rewards Paid"
          value={stats ? fmt(BigInt(stats.totalRewardsPaid)) : '—'}
          sub="eRWD"
        />
      </div>

      <div className="card-glow rounded-2xl p-5 mt-4">
        <div className="text-sm font-semibold text-slate-300 mb-4">TVL over time</div>
        {series.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-slate-600 text-sm">
            No staking activity indexed yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="tvlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.1)" />
              <XAxis dataKey="block" tick={{ fill: '#64748b', fontSize: 11 }} stroke="#1e293b" />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} stroke="#1e293b" width={48} />
              <Tooltip
                contentStyle={{
                  background: '#11162e',
                  border: '1px solid rgba(99,102,241,0.3)',
                  borderRadius: 12,
                  color: '#e2e8f0',
                }}
                labelFormatter={(b) => `Block ${b}`}
                formatter={(v) => [`${Number(v).toFixed(2)} eSTAKE`, 'TVL']}
              />
              <Area
                type="monotone"
                dataKey="tvl"
                stroke="#2dd4bf"
                strokeWidth={2}
                fill="url(#tvlFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

    </div>
  );
}
