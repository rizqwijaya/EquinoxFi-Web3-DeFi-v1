import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

const tabs = [
  { to: '/', label: 'Swap' },
  { to: '/pool', label: 'Pool' },
  { to: '/stake', label: 'Stake' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/history', label: 'History' },
];

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const [search, setSearch] = useState('');

  return (
    <header className="sticky top-0 z-20 border-b border-white/5 bg-midnight/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-aurora text-xl leading-none">◇</span>
          <span className="font-bold tracking-tight text-lg">
            Equinox<span className="text-aurora">Fi</span>
          </span>
        </NavLink>

        {/* Pill nav — desktop */}
        <nav className="hidden sm:flex items-center gap-1 rounded-full bg-midnight-light/50 border border-white/5 p-1 shrink-0">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `rounded-full px-4 py-1.5 text-sm font-semibold transition ${
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

        {/* Search bar */}
        <div className="hidden md:flex flex-1 items-center gap-2 rounded-xl bg-midnight-light/50 border border-white/5 px-3 py-2 text-sm text-slate-400 hover:border-indigo/30 transition cursor-text">
          <svg className="w-4 h-4 shrink-0 opacity-50" viewBox="0 0 24 24" fill="none">
            <path
              d="M11 4a7 7 0 1 0 0 14A7 7 0 0 0 11 4zm-9 7a9 9 0 1 1 18 0 9 9 0 0 1-18 0zm14.293 4.293a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1-1.414 1.414l-3-3a1 1 0 0 1 0-1.414z"
              fill="currentColor"
              fillRule="evenodd"
              clipRule="evenodd"
            />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tokens, pools…"
            className="bg-transparent outline-none w-full placeholder:text-slate-600 text-slate-300"
          />
          <kbd className="hidden lg:inline text-xs border border-white/10 rounded px-1.5 py-0.5 text-slate-600">/</kbd>
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="rounded-full border border-indigo/30 bg-midnight-light/80 px-4 py-2 text-sm font-medium hover:border-aurora/40 transition"
              title="Disconnect"
            >
              <span className="text-aurora">●</span> {address?.slice(0, 6)}…{address?.slice(-4)}
            </button>
          ) : (
            <button
              onClick={() => connect({ connector: injected() })}
              className="rounded-full bg-gradient-to-r from-indigo to-indigo-bright px-5 py-2 text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-indigo/30"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Mobile tabs */}
      <nav className="flex sm:hidden border-t border-white/5">
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
