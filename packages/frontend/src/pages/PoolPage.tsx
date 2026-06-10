/** Pool page: add/remove liquidity to the eTKNA/eTKNB pool. */
import { LiquidityCard } from '../components/LiquidityCard';
import { isDexDeployed } from '../config';

export function PoolPage() {
  return (
    <div className="animate-fade-in pt-8">
      {!isDexDeployed ? (
        <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
          DEX not configured. Set <code className="text-aurora">VITE_ROUTER_ADDRESS</code> in the
          root <code>.env</code> after deploying.
        </div>
      ) : (
        <LiquidityCard />
      )}
    </div>
  );
}
