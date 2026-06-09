/**
 * EquinoxFi landing / introduction page (the app's "/" entry point).
 *
 * Mirrors a Uniswap-style homepage while keeping Swap as the hero feature:
 *   1. Hero band: tagline + the live SwapCard (the protocol's primary action);
 *   2. Protocol stats panel: TVL / stakers / swaps / reward rate, live from the
 *      backend (`useStats` + `useDexStats`) with graceful "-" fallbacks;
 *   3. Feature bento: asymmetric, per-tone cards + one gradient hero (Stake),
 *      each routing to a real in-app page (Swap / Pool / Stake / Portfolio);
 *   4. "Explore the EQUINOX-verse" resource links.
 *
 * The plain swap-only view still lives at /swap; this page reuses the same
 * SwapCard component so both stay in sync.
 */
import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SwapCard } from '../components/SwapCard';
import { TokenBlobs } from '../components/TokenBlobs';
import { useStats, useDexStats } from '../hooks';
import { fmt } from '../format';
import { isDexDeployed } from '../config';

/** One protocol KPI inside the stats panel. */
function StatTile({ label, value, accent }: { label: string; value: ReactNode; accent?: boolean }) {
  return (
    <div className="bg-midnight/50 rounded-2xl border border-white/5 px-5 py-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${accent ? 'text-aurora' : 'text-slate-100'}`}>
        {value}
      </div>
    </div>
  );
}

/** Shared CTA arrow. Slides right on card hover. */
function ArrowRight({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 transition-transform duration-300 group-hover:translate-x-1 ${className}`} fill="none" viewBox="0 0 24 24">
      <path d="M5 12h14m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Move the hover spotlight to follow the cursor (sets CSS vars on the card). */
function spotlight(e: MouseEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

/** Cursor-tracking glow + a diagonal shine sweep, revealed on card hover. */
function HoverFx({ light = 'rgba(255,255,255,0.10)' }: { light?: string }) {
  return (
    <>
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: `radial-gradient(16rem 16rem at var(--mx,50%) var(--my,50%), ${light}, transparent 65%)` }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 left-0 h-[200%] w-1/4 -translate-x-[150%] rotate-12 bg-gradient-to-r from-transparent via-white/15 to-transparent group-hover:translate-x-[500%] group-hover:transition-transform group-hover:duration-700 group-hover:ease-out" />
      </div>
    </>
  );
}

/** Per-feature line icons. */
const icons = {
  swap: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7h11m0 0l-3-3m3 3l-3 3M17 17H6m0 0l3 3m-3-3l3-3" />
    </svg>
  ),
  pool: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3s6 5.5 6 10a6 6 0 1 1-12 0c0-4.5 6-10 6-10z" />
    </svg>
  ),
  stake: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l8 4-8 4-8-4 8-4zM4 12l8 4 8-4M4 16.5l8 4 8-4" />
    </svg>
  ),
  portfolio: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19V5m0 14h16M8 16v-4m4 4V8m4 8v-6" />
    </svg>
  ),
};

/** Accent classes per tone (kept as full literals so Tailwind keeps them). */
const TONES = {
  indigo: {
    badge: 'bg-indigo/15 text-indigo-bright ring-indigo/30',
    blob: 'bg-indigo/30',
    border: 'hover:border-indigo/50',
    cta: 'text-indigo-bright',
    shadow: 'hover:shadow-indigo/25',
    light: 'rgba(99,102,241,0.18)',
  },
  fuchsia: {
    badge: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-500/30',
    blob: 'bg-fuchsia-500/30',
    border: 'hover:border-fuchsia-400/50',
    cta: 'text-fuchsia-300',
    shadow: 'hover:shadow-fuchsia-500/25',
    light: 'rgba(217,70,239,0.18)',
  },
  amber: {
    badge: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
    blob: 'bg-amber-500/30',
    border: 'hover:border-amber-400/50',
    cta: 'text-amber-300',
    shadow: 'hover:shadow-amber-500/25',
    light: 'rgba(245,158,11,0.18)',
  },
} as const;

/** One bento card. `tone` colours it; `className` sets its grid span. */
function FeatureCard({
  to, tag, title, body, cta, icon, tone, className = '', delay = 0,
}: {
  to: string; tag: string; title: string; body: string; cta: string;
  icon: ReactNode; tone: keyof typeof TONES; className?: string; delay?: number;
}) {
  const t = TONES[tone];
  return (
    <Link
      to={to}
      onMouseMove={spotlight}
      style={{ animationDelay: `${delay}ms` }}
      className={`group relative overflow-hidden card-glow rounded-3xl p-6 flex flex-col animate-pop-in transition duration-300 will-change-transform hover:-translate-y-1.5 hover:scale-[1.015] hover:shadow-2xl ${t.border} ${t.shadow} ${className}`}
    >
      <HoverFx light={t.light} />
      <div className={`pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full blur-2xl opacity-50 transition-all duration-300 group-hover:opacity-100 group-hover:scale-125 ${t.blob}`} />
      <div className="relative flex items-center gap-3">
        <span className={`grid h-11 w-11 place-items-center rounded-xl ring-1 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6 ${t.badge}`}>
          {icon}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 transition-colors group-hover:text-slate-300">{tag}</span>
      </div>
      <h3 className="relative mt-4 text-xl font-bold text-slate-100 transition-colors group-hover:text-white">{title}</h3>
      <p className="relative mt-2 text-sm text-slate-400 leading-relaxed flex-1">{body}</p>
      <span className={`relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold ${t.cta}`}>
        {cta}
        <ArrowRight />
      </span>
    </Link>
  );
}

/** The highlighted, gradient-filled feature (Stake). */
function FeatureHero({ to, className = '', delay = 0 }: { to: string; className?: string; delay?: number }) {
  return (
    <Link
      to={to}
      onMouseMove={spotlight}
      style={{ animationDelay: `${delay}ms` }}
      className={`group relative overflow-hidden rounded-3xl p-7 flex flex-col animate-pop-in text-white shadow-xl shadow-indigo/30 transition duration-300 will-change-transform hover:-translate-y-1.5 hover:scale-[1.015] hover:shadow-2xl hover:shadow-indigo/40 bg-gradient-to-br from-indigo via-indigo-bright to-aurora-dim ${className}`}
    >
      <HoverFx light="rgba(255,255,255,0.16)" />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-52 w-52 rounded-full bg-white/10 blur-2xl transition-transform duration-500 group-hover:scale-125" />
      <div className="pointer-events-none absolute top-8 right-8 h-28 w-28 rounded-full border border-white/15 transition-transform duration-500 group-hover:scale-125" />
      <div className="relative flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 ring-1 ring-white/30">
          {icons.stake}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-white/90">Stake</span>
        <span className="ml-auto rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
          Popular
        </span>
      </div>
      <h3 className="relative mt-5 text-2xl font-bold leading-tight">Earn continuous yield.</h3>
      <p className="relative mt-2 text-sm text-white/80 leading-relaxed flex-1">
        Stake eSTAKE to accrue eRWD rewards every block. Claim or compound any
        time, fully non-custodial.
      </p>
      <span className="relative mt-6 inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur transition-all group-hover:gap-3 group-hover:bg-white/25">
        Start staking
        <ArrowRight />
      </span>
    </Link>
  );
}

/** One row in the "Explore" resource list. */
function ExploreRow({ icon, title, body, href }: { icon: ReactNode; title: string; body: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-4 border-t border-white/5 py-5 transition hover:bg-white/[0.02] px-2 -mx-2 rounded-xl"
    >
      <span className="text-aurora shrink-0">{icon}</span>
      <div className="flex-1">
        <div className="font-semibold text-slate-100">{title}</div>
        <div className="text-sm text-slate-500">{body}</div>
      </div>
      <svg className="w-4 h-4 text-slate-600 group-hover:text-aurora transition" fill="none" viewBox="0 0 24 24">
        <path d="M7 17L17 7m0 0H8m9 0v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

export function HomePage() {
  const { data: stats } = useStats();
  const { data: dex } = useDexStats();

  const tvl = stats ? fmt(BigInt(stats.totalStaked)) : '-';
  const stakers = stats ? stats.totalStakers.toLocaleString() : '-';
  const swaps = dex ? dex.swapCount.toLocaleString() : '-';
  const rewardRate = stats ? `${fmt(BigInt(stats.rewardRate))}` : '-';

  return (
    <div className="animate-fade-in">
      {/* ── Hero: tagline + live swap widget over blurred token art ─────── */}
      <section className="relative overflow-hidden pt-12 sm:pt-16 text-center">
        <TokenBlobs />
        <div className="relative z-10">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-100">
            Swap easily, stake instantly.
          </h1>
          <div className="mt-8">
            {isDexDeployed ? (
              <SwapCard swapOnly />
            ) : (
              <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
                DEX not configured. Set <code className="text-aurora">VITE_ROUTER_ADDRESS</code> and{' '}
                <code className="text-aurora">VITE_PAIR_ADDRESS</code> in the root <code>.env</code>{' '}
                after deploying.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Protocol pitch + live stats ────────────────────────────────── */}
      <section className="mt-20 grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">
            DeFi yield, powered by{' '}
            <span className="bg-gradient-to-r from-indigo-bright to-aurora bg-clip-text text-transparent">
              EquinoxFi
            </span>
            .
          </h2>
          <p className="mt-5 text-slate-400 leading-relaxed">
            EquinoxFi brings swapping and staking into one place. Trade on the
            built-in AMM, provide liquidity, and stake to earn continuous on-chain
            rewards, all non-custodial on Sepolia.
          </p>
          <Link
            to="/stake"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo to-indigo-bright px-6 py-3 text-sm font-semibold transition hover:brightness-110 shadow-lg shadow-indigo/30"
          >
            Start earning
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
              <path d="M5 12h14m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        <div className="card-glow rounded-3xl p-2">
          <div className="px-4 py-3 text-sm font-semibold text-slate-300 flex items-center gap-2">
            <span className="text-aurora">●</span> Protocol stats
          </div>
          <div className="grid grid-cols-2 gap-2 p-2">
            <StatTile label="Total value locked" value={tvl} accent />
            <StatTile label="Total stakers" value={stakers} />
            <StatTile label="All-time swaps" value={swaps} />
            <StatTile label="Reward rate (eRWD/s)" value={rewardRate} />
          </div>
        </div>
      </section>

      {/* ── Feature bento ──────────────────────────────────────────────── */}
      <section className="mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Built for all the ways you DeFi
          </h2>
          <span className="text-sm text-slate-500">Swap · Pool · Stake · Track</span>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-6">
          <FeatureCard
            to="/swap"
            tone="indigo"
            tag="Swap"
            title="Trade in seconds."
            body="Swap eTKNA and eTKNB instantly with live quotes, slippage controls, and one-tap approvals on the EquinoxFi AMM."
            cta="Open swap"
            icon={icons.swap}
            className="sm:col-span-4"
            delay={0}
          />
          <FeatureHero to="/stake" className="sm:col-span-2" delay={80} />
          <FeatureCard
            to="/pool"
            tone="fuchsia"
            tag="Pool"
            title="Provide liquidity."
            body="Add liquidity to the pair, watch live reserves, and power on-chain trading for the whole protocol."
            cta="Explore pool"
            icon={icons.pool}
            className="sm:col-span-3"
            delay={160}
          />
          <FeatureCard
            to="/portfolio"
            tone="amber"
            tag="Portfolio"
            title="Track your position."
            body="See your balances, staked principal, claimable rewards, and full activity history in one place."
            cta="View portfolio"
            icon={icons.portfolio}
            className="sm:col-span-3"
            delay={240}
          />
        </div>
      </section>

      {/* ── Explore resources ──────────────────────────────────────────── */}
      <section className="mt-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Explore the EquinoxFi-verse</h2>
        <div className="mt-6">
          <ExploreRow
            href="https://sepolia.etherscan.io"
            title="Block explorer"
            body="Verify every contract and transaction on Sepolia Etherscan."
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                <path d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
          <ExploreRow
            href="https://sepoliafaucet.com"
            title="Testnet faucet"
            body="Grab free Sepolia ETH to pay gas and start testing."
            icon={
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                <path d="M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5L14 8m-6.5-2.5L10 8m6.5 8.5L14 16m-6.5 2.5L10 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="mt-24 border-t border-white/5 pt-8 pb-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-2">
          <span className="text-aurora text-lg leading-none">◇</span>
          <span className="font-bold text-slate-300">
            Equinox<span className="text-aurora">Fi</span>
          </span>
        </div>
        <span>© {new Date().getFullYear()} EquinoxFi · Sepolia Testnet</span>
      </footer>
    </div>
  );
}
