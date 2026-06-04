/** Small reusable presentational components shared across pages. */
import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card-glow rounded-2xl px-5 py-4 animate-fade-in">
      <div className="text-xs uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold ${accent ? 'text-aurora' : 'text-slate-100'}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card-glow rounded-2xl px-6 py-12 text-center">
      <p className="text-slate-400">{title}</p>
      {hint && <p className="mt-2 text-sm text-slate-600">{hint}</p>}
    </div>
  );
}

export function Badge({ kind }: { kind: 'Staked' | 'Withdrawn' | 'RewardPaid' }) {
  const map = {
    Staked: 'bg-aurora/15 text-aurora',
    Withdrawn: 'bg-slate-500/15 text-slate-300',
    RewardPaid: 'bg-indigo/20 text-indigo-bright',
  } as const;
  const label = { Staked: 'Stake', Withdrawn: 'Withdraw', RewardPaid: 'Claim' }[kind];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${map[kind]}`}>{label}</span>
  );
}
