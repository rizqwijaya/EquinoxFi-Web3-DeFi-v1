/**
 * Stake page: the StakeCard action card, dressed up with the homepage's visual
 * language — ambient glow blobs, a live "your position" rail (claimable eRWD
 * visibly ticks up), and protocol-wide stats.
 */
import { useAccount } from 'wagmi';
import { StakeCard } from '../components/StakeCard';
import { AnimatedNumber, MiniStat } from '../components/ui';
import { isDeployed, REWARD_SYMBOL } from '../config';
import { toNum } from '../format';
import { useStats, useTotalStakePosition } from '../hooks';

/** Connected user's aggregate position: staked principal + live claimable eRWD. */
function PositionRail() {
  const { address } = useAccount();
  const { staked, earned } = useTotalStakePosition();

  return (
    <div
      style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
      className="card-glow relative overflow-hidden rounded-3xl p-5 animate-pop-in"
    >
      {/* Aurora corner glow. */}
      <div aria-hidden className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-aurora/20 blur-3xl animate-pulse-slow" />

      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-aurora/15 ring-1 ring-aurora/30">
          <svg className="h-4 w-4 text-aurora" fill="none" viewBox="0 0 24 24">
            <path d="M12 3v18m6-13-6-5-6 5m12 8-6 5-6-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="font-semibold text-slate-100">Your position</h2>
        {address && (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-aurora/10 px-2.5 py-1 text-[0.65rem] font-semibold text-aurora">
            <span className="h-1.5 w-1.5 rounded-full bg-aurora animate-pulse" />
            LIVE
          </span>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div className="rounded-2xl bg-midnight/60 border border-white/5 px-4 py-3">
          <div className="text-xs text-slate-500">Total staked</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-slate-100">
            {address ? <AnimatedNumber value={toNum(staked)} decimals={2} /> : '-'}
          </div>
        </div>
        <div className="rounded-2xl bg-midnight/60 border border-aurora/20 px-4 py-3">
          <div className="text-xs text-slate-500">Claimable rewards</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-aurora">
            {address ? <AnimatedNumber value={toNum(earned)} decimals={4} fixed /> : '-'}
            <span className="ml-1.5 text-sm font-semibold text-aurora/70">{REWARD_SYMBOL}</span>
          </div>
        </div>
      </div>

      {!address && (
        <p className="mt-3 text-xs text-slate-600">Connect your wallet to see staked balances and live rewards.</p>
      )}
    </div>
  );
}

export function StakePage() {
  const { data: stats } = useStats();

  return (
    <div className="relative pt-8 animate-fade-in">
      {/* Ambient colored glow blobs for depth. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute left-1/4 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo/25 blur-[120px] animate-pulse-slow" />
        <div
          className="absolute right-1/4 top-1/3 h-72 w-72 translate-x-1/2 rounded-full bg-aurora/15 blur-[120px] animate-pulse-slow"
          style={{ animationDelay: '1.6s' }}
        />
      </div>

      <div className="relative z-10">
        {!isDeployed ? (
          <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
            Contracts not configured. Set <code className="text-aurora">VITE_VAULT_A_ADDRESS</code> in
            the root <code>.env</code> after deploying.
          </div>
        ) : (
          <div className="mx-auto grid max-w-4xl items-start gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:justify-center">
            {/* Action card */}
            <div className="animate-pop-in" style={{ animationFillMode: 'backwards' }}>
              <StakeCard />
            </div>

            {/* Right rail: live position + protocol stats */}
            <div className="space-y-4">
              <PositionRail />
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Total staked" value={stats ? toNum(BigInt(stats.totalStaked)) : 0} loading={!stats} delay={250} />
                <MiniStat label="Stakers" value={stats ? stats.totalStakers : 0} loading={!stats} delay={330} />
                <MiniStat label="Rewards paid" value={stats ? toNum(BigInt(stats.totalRewardsPaid)) : 0} decimals={2} loading={!stats} delay={410} />
                <MiniStat label={`${REWARD_SYMBOL}/sec`} value={stats ? toNum(BigInt(stats.rewardRate)) : 0} decimals={4} loading={!stats} delay={490} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
