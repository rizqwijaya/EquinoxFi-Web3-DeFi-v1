/** Landing/swap page: hero, the swap card, and live pool stats from the AMM. */
import { SwapCard } from '../components/SwapCard';
import { StatCard } from '../components/ui';
import { useDexStats } from '../hooks';
import { fmt } from '../format';
import { isDexDeployed } from '../config';
import { formatUnits } from 'viem';

export function SwapPage() {
  const { data } = useDexStats();

  // Spot price of token0 in token1 terms, formatted to 4 dp.
  const price = data ? Number(formatUnits(BigInt(data.price0In1), 18)).toFixed(4) : '—';

  return (
    <div className="animate-fade-in">
      <section className="text-center pt-10 pb-8">
        <h1 className="text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-indigo-bright via-aurora to-indigo-bright bg-clip-text text-transparent">
          EquinoxFi
        </h1>
        <p className="mt-3 text-lg text-slate-300">Swap at the heart of yield.</p>
      </section>

      {!isDexDeployed ? (
        <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
          DEX not configured. Set <code className="text-aurora">VITE_ROUTER_ADDRESS</code> and{' '}
          <code className="text-aurora">VITE_PAIR_ADDRESS</code> in the root <code>.env</code> after
          deploying.
        </div>
      ) : (
        <>
          <SwapCard />

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
            <StatCard
              label="eTKNA reserve"
              value={data ? fmt(BigInt(data.reserve0)) : '—'}
              accent
            />
            <StatCard label="eTKNB reserve" value={data ? fmt(BigInt(data.reserve1)) : '—'} />
            <StatCard label="Price" value={price} sub="eTKNB / eTKNA" />
            <StatCard label="Swaps" value={data ? data.swapCount : '—'} />
          </div>
        </>
      )}
    </div>
  );
}
