/**
 * Swap page: the SwapCard action card plus a live "market" rail — on-chain
 * pool price and reserves that tick as they refresh, and backend DEX stats
 * (swap count / volume). Ambient glow blobs match the rest of the app.
 */
import { SwapCard } from '../components/SwapCard';
import { AnimatedNumber, MiniStat } from '../components/ui';
import { isDexDeployed, STAKE_VAULTS, TOKEN_A_ADDRESS } from '../config';
import { toNum } from '../format';
import { useDexStats, useReserves } from '../hooks';

/** Gradient coin + symbol row showing one side of the pool's reserves. */
function ReserveRow({ symbol, amount }: { symbol: string; amount: number | undefined }) {
  const meta = STAKE_VAULTS.find((v) => v.symbol === symbol);
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-midnight/60 border border-white/5 px-4 py-3">
      <span
        className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${meta?.grad ?? 'from-indigo to-indigo-bright'} ring-1 ring-white/20 text-[0.6rem] font-bold text-white shrink-0`}
      >
        {meta?.badge ?? symbol.slice(0, 2)}
      </span>
      <span className="text-sm text-slate-400">{symbol}</span>
      <span className="ml-auto text-base font-bold tabular-nums text-slate-100">
        {amount === undefined ? '-' : <AnimatedNumber value={amount} decimals={2} />}
      </span>
    </div>
  );
}

/** Live pool snapshot: spot price + reserves, read straight from the pair. */
function MarketRail() {
  const { reserve0, reserve1, token0 } = useReserves();

  // Map pair ordering (token0/token1) onto the eTKNA/eTKNB catalogue.
  const aIsToken0 = token0?.toLowerCase() === TOKEN_A_ADDRESS.toLowerCase();
  const reserveA = aIsToken0 ? reserve0 : reserve1;
  const reserveB = aIsToken0 ? reserve1 : reserve0;
  const price =
    reserveA !== undefined && reserveB !== undefined && reserveA > 0n
      ? toNum(reserveB) / toNum(reserveA)
      : undefined;

  return (
    <div
      style={{ animationDelay: '150ms', animationFillMode: 'backwards' }}
      className="card-glow relative overflow-hidden rounded-3xl p-5 animate-pop-in"
    >
      {/* Aurora corner glow. */}
      <div aria-hidden className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-aurora/20 blur-3xl animate-pulse-slow" />

      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-aurora/15 ring-1 ring-aurora/30">
          <svg className="h-4 w-4 text-aurora" fill="none" viewBox="0 0 24 24">
            <path d="M3 17l5-6 4 3 5-8 4 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h2 className="font-semibold text-slate-100">Market</h2>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-aurora/10 px-2.5 py-1 text-[0.65rem] font-semibold text-aurora">
          <span className="h-1.5 w-1.5 rounded-full bg-aurora animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Spot price */}
      <div className="mt-4 rounded-2xl bg-midnight/60 border border-aurora/20 px-4 py-3">
        <div className="text-xs text-slate-500">Pool price</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-aurora">
          {price === undefined ? '-' : <AnimatedNumber value={price} decimals={4} fixed />}
          <span className="ml-1.5 text-sm font-semibold text-aurora/70">eTKNB / eTKNA</span>
        </div>
      </div>

      {/* Pool reserves */}
      <div className="mt-3 space-y-2">
        <div className="text-xs text-slate-500 px-1">Pool reserves</div>
        <ReserveRow symbol="eTKNA" amount={reserveA === undefined ? undefined : toNum(reserveA)} />
        <ReserveRow symbol="eTKNB" amount={reserveB === undefined ? undefined : toNum(reserveB)} />
      </div>
    </div>
  );
}

export function SwapPage() {
  const { data: dex } = useDexStats();

  // Backend reports volumes in pair order; map onto eTKNA/eTKNB.
  const aIsToken0 = dex?.token0?.toLowerCase() === TOKEN_A_ADDRESS.toLowerCase();
  const volumeA = dex ? toNum(BigInt(aIsToken0 ? dex.volume0In : dex.volume1In)) : 0;
  const volumeB = dex ? toNum(BigInt(aIsToken0 ? dex.volume1In : dex.volume0In)) : 0;

  return (
    <div className="relative pt-8 animate-fade-in">
      {/* Ambient colored glow blobs for depth. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute left-1/4 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo/25 blur-[120px] animate-pulse-slow" />
        <div
          className="absolute right-1/4 top-1/3 h-72 w-72 translate-x-1/2 rounded-full bg-aurora/15 blur-[120px] animate-pulse-slow"
          style={{ animationDelay: '1.6s' }}
        />
      </div>

      <div className="relative z-10">
        {!isDexDeployed ? (
          <div className="max-w-md mx-auto card-glow rounded-2xl px-6 py-10 text-center text-slate-400">
            DEX not configured. Set <code className="text-aurora">VITE_ROUTER_ADDRESS</code> and{' '}
            <code className="text-aurora">VITE_PAIR_ADDRESS</code> in the root <code>.env</code> after
            deploying.
          </div>
        ) : (
          <div className="mx-auto grid max-w-4xl items-start gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:justify-center">
            {/* Action card */}
            <div className="animate-pop-in" style={{ animationFillMode: 'backwards' }}>
              <SwapCard />
            </div>

            {/* Right rail: live market + DEX stats */}
            <div className="space-y-4">
              <MarketRail />
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="All-time swaps" value={dex ? dex.swapCount : 0} loading={!dex} delay={250} />
                <MiniStat label="Volume (eTKNA in)" value={volumeA} decimals={2} loading={!dex} delay={330} />
                <MiniStat label="Volume (eTKNB in)" value={volumeB} decimals={2} loading={!dex} delay={410} />
                <MiniStat label="Pool fee (%)" value={0.3} decimals={1} loading={false} delay={490} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
