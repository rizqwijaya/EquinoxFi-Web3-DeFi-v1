import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const tabs = [
  { to: '/swap', label: 'Swap' },
  { to: '/pool', label: 'Pool' },
  { to: '/stake', label: 'Stake' },
  { to: '/portfolio', label: 'Portfolio' },
];

/**
 * Wallet pill, restyled to the EquinoxFi brand via ConnectButton.Custom.
 * Connect / account / wrong-network flows all open RainbowKit's modals.
 */
function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              aria-hidden={!mounted}
              className={`rounded-full bg-gradient-to-r from-indigo to-indigo-bright px-5 py-2 text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-indigo/30 ${
                mounted ? '' : 'pointer-events-none select-none opacity-0'
              }`}
            >
              Connect
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              onClick={openChainModal}
              className="rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-400 hover:border-red-400/70 transition"
            >
              Wrong network
            </button>
          );
        }

        return (
          <button
            onClick={openAccountModal}
            className="rounded-full border border-indigo/30 bg-midnight-light/80 px-4 py-2 text-sm font-medium hover:border-aurora/40 transition"
          >
            <span className="text-aurora">●</span> {account.displayName}
            {account.displayBalance && (
              <span className="hidden md:inline text-slate-400"> · {account.displayBalance}</span>
            )}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function Navbar() {
  const [search, setSearch] = useState('');

  // Transparent/glassy at the top of the page; solid once the user scrolls so
  // content doesn't bleed through the bar (Uniswap-style header behaviour).
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-20 transition-colors duration-300 ${
        scrolled
          ? 'border-b border-white/5 bg-midnight'
          : 'border-b border-transparent bg-transparent backdrop-blur-md'
      }`}
    >
      <div className="relative flex w-full items-center gap-4 px-4 py-3 sm:px-6">
        {/* Logo */}
        <NavLink to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-aurora text-xl leading-none">◇</span>
          <span className="font-bold tracking-tight text-lg">
            Equinox<span className="text-aurora">Fi</span>
          </span>
        </NavLink>

        {/* Pill nav: desktop */}
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

        {/* Search bar: absolutely centered to the viewport */}
        <div className="hidden lg:block absolute left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
          <div className="flex w-full items-center gap-2 rounded-xl bg-midnight-light/50 border border-white/5 px-3 py-2 text-sm text-slate-400 hover:border-indigo/30 transition cursor-text">
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
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <WalletButton />
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
