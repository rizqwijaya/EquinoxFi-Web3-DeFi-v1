/**
 * EquinoxFi landing / introduction page (the app's "/" entry point).
 *
 * Mirrors a Uniswap-style homepage while keeping Swap as the hero feature:
 *   1. Hero band: tagline + the live SwapCard (the protocol's primary action);
 *   2. Protocol stats panel: TVL / stakers / swaps / reward rate, live from the
 *      backend (`useStats` + `useDexStats`) with graceful "-" fallbacks;
 *   3. Feature grid: "Built for all the ways you swap", each card routing to a
 *      real in-app page (Swap / Pool / Stake / Analytics);
 *   4. "Explore the EQUINOX-verse" resource links.
 *
 * The plain swap-only view still lives at /swap; this page reuses the same
 * SwapCard component so both stay in sync.
 */
import type { ReactNode } from 'react';
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

/** One card in the "Built for all the ways you swap" grid. */
function FeatureCard({
  to,
  tag,
  title,
  body,
  cta,
  glyph,
}: {
  to: string;
  tag: string;
  title: string;
  body: string;
  cta: string;
  glyph: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group card-glow rounded-3xl p-6 flex flex-col transition hover:border-aurora/40 hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-2 text-aurora text-sm font-semibold">
        {glyph}
        {tag}
      </div>
      <h3 className="mt-3 text-xl font-bold text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-400 leading-relaxed flex-1">{body}</p>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-bright group-hover:gap-2 transition-all">
        {cta}
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
          <path d="M5 12h14m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
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

      {/* ── Feature grid ───────────────────────────────────────────────── */}
      <section className="mt-24">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Built for all the ways you DeFi
        </h2>
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <FeatureCard
            to="/swap"
            tag="Swap"
            title="Trade in seconds."
            body="Swap eTKNA and eTKNB instantly with live quotes, slippage controls, and one-tap approvals on the EquinoxFi AMM."
            cta="Open swap"
            glyph={<span className="text-lg leading-none">⇄</span>}
          />
          <FeatureCard
            to="/pool"
            tag="Pool"
            title="Provide liquidity."
            body="Add liquidity to the pair, watch live reserves, and power on-chain trading for the whole protocol."
            cta="Explore pool"
            glyph={<span className="text-lg leading-none">◇</span>}
          />
          <FeatureCard
            to="/stake"
            tag="Stake"
            title="Earn continuous yield."
            body="Stake eSTAKE to accrue eRWD rewards every block. Claim or compound any time, fully non-custodial."
            cta="Start staking"
            glyph={<span className="text-lg leading-none">✦</span>}
          />
          <FeatureCard
            to="/portfolio"
            tag="Portfolio"
            title="Track your position."
            body="See your balances, staked principal, claimable rewards, and full activity history in one place."
            cta="View portfolio"
            glyph={<span className="text-lg leading-none">▦</span>}
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
