/** Landing/stake page: hero, swap-style stake card, and a compact pool summary. */
import { StakeCard } from '../components/StakeCard';
import { StatCard } from '../components/ui';
import { useStats } from '../hooks';
import { fmt } from '../format';
import { isDeployed } from '../config';

export function StakePage() {
  const { data } = useStats();

  return (
    <div className="animate-fade-in">
      <section className="text-center pt-10 pb-8">
        <h1 className="text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-indigo-bright via-aurora to-indigo-bright bg-clip-text text-transparent">
          EquinoxFi
        </h1>
        <p className="mt-3 text-lg text-slate-300">Balance at the heart of yield.</p>
      </section>

      {!isDeployed ? (
        <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
          Contracts not configured. Set <code className="text-aurora">VITE_VAULT_ADDRESS</code> in
          the root <code>.env</code> after deploying.
        </div>
      ) : (
        <>
          <StakeCard />

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl mx-auto">
            <StatCard
              label="TVL"
              value={data ? `${fmt(BigInt(data.totalStaked))}` : '—'}
              sub="eSTAKE"
              accent
            />
            <StatCard label="Stakers" value={data ? data.totalStakers : '—'} />
            <StatCard
              label="Rewards paid"
              value={data ? `${fmt(BigInt(data.totalRewardsPaid))}` : '—'}
              sub="eRWD"
            />
          </div>
        </>
      )}
    </div>
  );
}
