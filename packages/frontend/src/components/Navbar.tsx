import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useAccount, useConnect, useDisconnect, useBalance } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { sepolia } from 'wagmi/chains';

const tabs = [
  { to: '/swap', label: 'Swap' },
  { to: '/pool', label: 'Pool' },
  { to: '/stake', label: 'Stake' },
  { to: '/portfolio', label: 'Portfolio' },
];

function WalletMenu({ address, disconnect }: { address: string; disconnect: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: balance } = useBalance({ address: address as `0x${string}`, chainId: sepolia.id });

  function copyAddress() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const ethBal = balance ? `${parseFloat(balance.formatted).toFixed(4)} ${balance.symbol}` : '…';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-full border border-indigo/30 bg-midnight-light/80 px-4 py-2 text-sm font-medium hover:border-aurora/40 transition"
      >
        <span className="text-aurora">●</span> {short}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-white/10 bg-midnight-light shadow-xl shadow-black/40 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-slate-200">{short}</span>
              <button
                onClick={copyAddress}
                className={`flex items-center gap-1 text-xs transition rounded-lg px-2 py-1 ${copied ? 'text-aurora bg-aurora/10' : 'text-slate-500 hover:text-aurora hover:bg-white/5'}`}
                title="Copy address"
              >
                {copied ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <rect x="9" y="9" width="11" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Copy
                  </>
                )}
              </button>
            </div>
            <div className="text-xs text-slate-500">Sepolia Testnet</div>
            <div className="mt-2 text-lg font-bold text-slate-100">{ethBal}</div>
          </div>

          {/* Actions */}
          <div className="p-2 flex flex-col gap-1">
            <a
              href={`https://sepolia.etherscan.io/address/${address}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition"
              onClick={() => setOpen(false)}
            >
              <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24">
                <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              View on Etherscan
            </a>

            <button
              onClick={() => { disconnect(); setOpen(false); }}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition w-full text-left"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
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
          {isConnected && address ? (
            <WalletMenu address={address} disconnect={disconnect} />
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
