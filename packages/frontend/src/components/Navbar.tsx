/** Top navigation bar: logo, tab links, and wallet connect button. */
import { NavLink } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

const tabs = [
  { to: '/', label: 'Stake' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/history', label: 'History' },
];

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <header className="sticky top-0 z-20 border-b border-indigo/10 bg-midnight/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <NavLink to="/" className="flex items-center gap-2">
          <span className="text-aurora text-xl">◇</span>
          <span className="font-bold tracking-tight text-lg">
            Equinox<span className="text-aurora">Fi</span>
          </span>
        </NavLink>

        <nav className="hidden sm:flex items-center gap-1 rounded-full bg-midnight-light/60 p-1">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-indigo text-white shadow-lg shadow-indigo/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        {isConnected ? (
          <button
            onClick={() => disconnect()}
            className="rounded-full border border-indigo/30 bg-midnight-light/80 px-4 py-2 text-sm
                       font-medium hover:border-aurora/40 transition"
            title="Disconnect"
          >
            <span className="text-aurora">●</span> {address?.slice(0, 6)}…{address?.slice(-4)}
          </button>
        ) : (
          <button
            onClick={() => connect({ connector: injected() })}
            className="rounded-full bg-gradient-to-r from-indigo to-indigo-bright px-5 py-2 text-sm
                       font-semibold hover:brightness-110 transition shadow-lg shadow-indigo/30"
          >
            Connect Wallet
          </button>
        )}
      </div>

      {/* Mobile tabs */}
      <nav className="flex sm:hidden border-t border-indigo/10">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.to === '/'}
            className={({ isActive }) =>
              `flex-1 py-2.5 text-center text-sm font-medium transition ${
                isActive ? 'text-aurora border-b-2 border-aurora' : 'text-slate-500'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
