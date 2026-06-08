/** Pool page: add/remove liquidity to the eTKNA/eTKNB pool, plus pool stats. */
import { LiquidityCard } from '../components/LiquidityCard';
import { StatCard } from '../components/ui';
import { useDexStats } from '../hooks';
import { fmt } from '../format';
import { isDexDeployed } from '../config';

export function PoolPage() {
  const { data } = useDexStats();

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mt-8 mb-4 text-center">Liquidity Pool</h2>

      {!isDexDeployed ? (
        <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
          DEX not configured. Set <code className="text-aurora">VITE_ROUTER_ADDRESS</code> in the
          root <code>.env</code> after deploying.
        </div>
      ) : (
        <>
          <LiquidityCard />

          <div className="mt-8 grid grid-cols-2 gap-3 max-w-md mx-auto">
            <StatCard
              label="eTKNA reserve"
              value={data ? fmt(BigInt(data.reserve0)) : '-'}
              accent
            />
            <StatCard label="eTKNB reserve" value={data ? fmt(BigInt(data.reserve1)) : '-'} />
          </div>
        </>
      )}
    </div>
  );
}
