import { SwapCard } from '../components/SwapCard';
import { isDexDeployed } from '../config';

export function SwapPage() {
  return (
    <div className="animate-fade-in pt-8">
      {!isDexDeployed ? (
        <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
          DEX not configured. Set <code className="text-aurora">VITE_ROUTER_ADDRESS</code> and{' '}
          <code className="text-aurora">VITE_PAIR_ADDRESS</code> in the root <code>.env</code> after
          deploying.
        </div>
      ) : (
        <SwapCard />
      )}
    </div>
  );
}
