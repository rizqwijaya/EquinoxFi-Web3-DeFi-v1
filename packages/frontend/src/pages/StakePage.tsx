import { StakeCard } from '../components/StakeCard';
import { isDeployed } from '../config';

export function StakePage() {

  return (
    <div className="animate-fade-in pt-8">
      {!isDeployed ? (
        <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
          Contracts not configured. Set <code className="text-aurora">VITE_VAULT_A_ADDRESS</code> in
          the root <code>.env</code> after deploying.
        </div>
      ) : (
        <StakeCard />
      )}
    </div>
  );
}
