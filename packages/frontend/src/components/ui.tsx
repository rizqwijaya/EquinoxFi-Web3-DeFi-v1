/** Small reusable presentational components shared across pages. */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A number that smoothly counts to `value` whenever it changes (easeOutCubic
 * over ~700ms), starting from 0 on first mount. Gives dashboards a live,
 * "ticking" feel — balances animate in and accruing rewards visibly climb.
 *
 *   - `decimals` caps the fraction digits; `fixed` pads to exactly that many
 *     (steadier for live figures); both group thousands with locale separators.
 */
export function AnimatedNumber({
  value,
  decimals = 4,
  fixed = false,
  className = '',
}: {
  value: number;
  decimals?: number;
  fixed?: boolean;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number.isFinite(value) ? value : 0;
    if (from === to) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value]);

  return (
    <span className={className}>
      {display.toLocaleString(undefined, {
        minimumFractionDigits: fixed ? decimals : 0,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

/**
 * Transaction status banner shared by the Stake/Swap cards. Renders a colored,
 * glowing pill (pending / success / error) instead of a flat line of text.
 *
 * Exactly one state shows at a time, decided by the caller:
 *   - `pending`  → indigo pill with spinner (tx in flight / confirming);
 *   - `success`  → emerald pill with check + Etherscan link;
 *   - `error`    → rose pill with a warning glyph (shakes in).
 */
export function TxStatus({
  pending,
  pendingLabel,
  success,
  successHref,
  error,
}: {
  pending?: boolean;
  pendingLabel?: ReactNode;
  success?: boolean;
  successHref?: string;
  error?: ReactNode;
}) {
  const show = pending || success || !!error;
  return (
    <div className={`mt-3 overflow-hidden transition-all duration-300 ${show ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
      {pending && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-indigo-bright/30 bg-indigo/10 px-4 py-3 text-sm text-indigo-bright shadow-lg shadow-indigo/20 animate-fade-in">
          <Spinner className="text-indigo-bright" />
          <span className="font-medium">{pendingLabel ?? 'Confirming transaction…'}</span>
          <span className="ml-auto flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-bright/70 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-bright/70 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-bright/70 animate-bounce" />
          </span>
        </div>
      )}

      {!pending && success && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300 shadow-lg shadow-emerald-500/20 animate-pop-in">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-400/20">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-semibold">Transaction confirmed</span>
          {successHref && (
            <a
              href={successHref}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-emerald-400/15 px-2.5 py-1 text-xs font-semibold hover:bg-emerald-400/25 transition"
            >
              Etherscan
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24">
                <path d="M7 17L17 7m0 0H8m9 0v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
        </div>
      )}

      {!pending && !success && error && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300 shadow-lg shadow-rose-500/20 animate-shake">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-400/20">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
              <path d="M12 8v5m0 3h.01" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="font-medium leading-tight line-clamp-2">{error}</span>
        </div>
      )}
    </div>
  );
}

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

/**
 * Compact stat tile for page side-rails (Stake/Swap): staggered pop-in,
 * hover lift, animated count-up, dash placeholder while loading.
 */
export function MiniStat({
  label,
  value,
  decimals = 0,
  loading,
  delay,
}: {
  label: string;
  value: number;
  decimals?: number;
  loading: boolean;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
      className="rounded-2xl border border-white/5 bg-midnight/40 px-4 py-3 animate-pop-in transition-all duration-300 hover:-translate-y-0.5 hover:border-indigo/30"
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">
        {loading ? <span className="text-slate-600">-</span> : <AnimatedNumber value={value} decimals={decimals} />}
      </div>
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
