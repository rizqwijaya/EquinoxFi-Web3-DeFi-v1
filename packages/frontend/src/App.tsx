/**
 * EquinoxFi dApp root.
 *
 * Hero with the protocol tagline, wallet connect (injected/MetaMask), pool TVL
 * from the backend /stats endpoint, and the stake/withdraw/claim panel. Deep
 * space palette per GENERAL.md Section 0/8.
 */
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { StakePanel } from './StakePanel';
import { useStats } from './useStats';
import { isDeployed, VAULT_ADDRESS } from './config';
import { fmt, addressUrl } from './format';

export function App() {
  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-10">
      <Header />

      <section className="mt-12 text-center">
        <h1 className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-indigo to-aurora bg-clip-text text-transparent">
          EquinoxFi
        </h1>
        <p className="mt-4 text-xl text-slate-300">Balance at the heart of yield.</p>
      </section>

      <Tvl />

      <section className="mt-10 w-full flex justify-center">
        {isDeployed ? (
          <StakePanel />
        ) : (
          <p className="text-slate-500 max-w-md text-center">
            Contracts not yet configured. Set <code>VITE_VAULT_ADDRESS</code> and token
            addresses in <code>.env</code> after deploying to Sepolia.
          </p>
        )}
      </section>

      <footer className="mt-auto pt-16 text-xs text-slate-600">
        {isDeployed && (
          <a className="underline" href={addressUrl(VAULT_ADDRESS)} target="_blank" rel="noreferrer">
            Vault on Sepolia Etherscan
          </a>
        )}
      </footer>
    </main>
  );
}

function Header() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <header className="w-full max-w-4xl flex justify-between items-center">
      <span className="font-semibold tracking-tight text-aurora">◇ EquinoxFi</span>
      {isConnected ? (
        <button
          onClick={() => disconnect()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700"
        >
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </button>
      ) : (
        <button
          onClick={() => connect({ connector: injected() })}
          className="rounded-lg bg-indigo px-4 py-2 text-sm font-medium hover:brightness-110"
        >
          Connect Wallet
        </button>
      )}
    </header>
  );
}

function Tvl() {
  const { data, isError } = useStats();
  return (
    <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/40 px-6 py-4 text-center">
      <div className="text-xs uppercase tracking-wide text-slate-500">Total Value Locked</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">
        {isError || !data ? '—' : `${fmt(BigInt(data.totalStaked))} eSTAKE`}
      </div>
      {data && (
        <div className="mt-1 text-xs text-slate-500">
          {data.totalStakers} stakers · {fmt(BigInt(data.totalRewardsPaid))} eRWD paid
        </div>
      )}
    </div>
  );
}
