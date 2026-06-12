/**
 * Portfolio page: a connected user's at-a-glance position across EquinoxFi.
 *
 *   - Header: address + native Sepolia ETH balance;
 *   - Token balances: eSTAKE / eRWD / eTKNA / eTKNB wallet holdings;
 *   - Staking position: staked principal + live claimable rewards;
 *   - Activity: the user's stake/withdraw/claim events merged with swaps,
 *     newest first, from the backend.
 *
 * Replaces the old protocol-wide Analytics page (whose KPIs now live on the
 * landing page's stats panel).
 */
import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useBalance } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import type { Address } from 'viem';
import { erc20Abi } from '../abi';
import {
  REWARD_TOKEN_ADDRESS,
  TOKEN_A_ADDRESS,
  TOKEN_B_ADDRESS,
  WETH_ADDRESS,
  PAIR_ADDRESS,
  PAIR_WETH_A_ADDRESS,
  PAIR_WETH_B_ADDRESS,
} from '../config';
import { fmt, toNum, txUrl } from '../format';
import { useTotalStakePosition, useHistory, useSwapHistory, type SwapEvent } from '../hooks';
import { AnimatedNumber, Badge } from '../components/ui';
import { TokenBlobs } from '../components/TokenBlobs';

/** Display symbol per token address (ETH for WETH). */
const SWAP_SYMBOL: Record<string, string> = {
  [TOKEN_A_ADDRESS.toLowerCase()]: 'eTKNA',
  [TOKEN_B_ADDRESS.toLowerCase()]: 'eTKNB',
  [WETH_ADDRESS.toLowerCase()]: 'ETH',
};

/** UniswapV2 token ordering: token0 is the lower address. */
const sortPair = (a: Address, b: Address): [Address, Address] =>
  a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];

/** pool address → [token0, token1], so a Swap's amount0/1 can be mapped to tokens. */
const PAIR_TOKENS: Record<string, [Address, Address]> = {
  [PAIR_ADDRESS.toLowerCase()]: sortPair(TOKEN_A_ADDRESS, TOKEN_B_ADDRESS),
  [PAIR_WETH_A_ADDRESS.toLowerCase()]: sortPair(WETH_ADDRESS, TOKEN_A_ADDRESS),
  [PAIR_WETH_B_ADDRESS.toLowerCase()]: sortPair(WETH_ADDRESS, TOKEN_B_ADDRESS),
};

/** "12.5 eTKNA → 49 eTKNB" for a swap row; falls back to the main pool. */
function swapLabel(s: SwapEvent): string {
  const [token0, token1] = PAIR_TOKENS[s.pair?.toLowerCase() ?? ''] ?? PAIR_TOKENS[PAIR_ADDRESS.toLowerCase()];
  const sym = (a: Address) => SWAP_SYMBOL[a.toLowerCase()] ?? '???';
  const zeroIn = BigInt(s.amount0In) > 0n; // token0 sold?
  const inTok = zeroIn ? token0 : token1;
  const outTok = zeroIn ? token1 : token0;
  const inAmt = zeroIn ? s.amount0In : s.amount1In;
  const outAmt = zeroIn ? s.amount1Out : s.amount0Out;
  return `${fmt(BigInt(inAmt))} ${sym(inTok)} → ${fmt(BigInt(outAmt))} ${sym(outTok)}`;
}

/** Live ERC-20 balance for the connected account. */
function useTokenBalance(token: Address, address?: Address) {
  const { data } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && token !== ('0x0000000000000000000000000000000000000000' as Address), refetchInterval: 10_000 },
  });
  return data as bigint | undefined;
}

/** Per-token accent palette (eRWD is "gold" to read as the reward token). */
const TILE_COLOR = {
  aurora: { text: 'text-aurora', bar: 'bg-aurora', ring: 'hover:ring-aurora/40' },
  indigo: { text: 'text-indigo-bright', bar: 'bg-indigo-bright', ring: 'hover:ring-indigo-bright/40' },
  amber: { text: 'text-amber-300', bar: 'bg-amber-400', ring: 'hover:ring-amber-400/40' },
} as const;

/** One token-balance tile: glowing accent dot, animated value, share bar. */
function BalanceTile({
  symbol,
  name,
  value,
  color,
  share,
  delay,
  grow,
}: {
  symbol: string;
  name: string;
  value: bigint | undefined;
  color: keyof typeof TILE_COLOR;
  share: number;
  delay: number;
  grow: boolean;
}) {
  const c = TILE_COLOR[color];
  return (
    <div
      className={`group card-glow rounded-2xl px-5 py-4 ring-1 ring-transparent transition-all duration-300 hover:-translate-y-1 ${c.ring} animate-fade-in`}
      style={{ animationDelay: `${delay}s`, animationFillMode: 'backwards' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${c.bar} ${c.text} shadow-[0_0_12px_currentColor]`} />
          <div>
            <div className="font-semibold text-slate-100 text-sm">{symbol}</div>
            <div className="text-xs text-slate-500">{name}</div>
          </div>
        </div>
        <span className="text-xs font-medium text-slate-500 tabular-nums">{share.toFixed(0)}%</span>
      </div>
      <AnimatedNumber value={toNum(value)} className={`mt-3 block text-2xl font-bold tabular-nums ${c.text}`} />
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full ${c.bar} transition-all duration-700 ease-out`} style={{ width: `${grow ? share : 0}%` }} />
      </div>
    </div>
  );
}

/** Merged activity row shape (stake events + swaps) for the feed. */
type FeedRow =
  | { type: 'stake'; kind: 'Staked' | 'Withdrawn' | 'RewardPaid'; amount: string; blockNumber: number; txHash: string }
  | { type: 'swap'; label: string; blockNumber: number; txHash: string };

/** Short address with a copy-to-clipboard button + "Copied!" feedback. */
function CopyAddress({ address, short }: { address: string; short: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      title="Copy address"
      className={`group flex items-center gap-1.5 text-sm transition rounded-lg -ml-1 px-1.5 py-0.5 ${
        copied ? 'text-aurora' : 'text-slate-500 hover:text-aurora hover:bg-white/5'
      }`}
    >
      {short}
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" fill="none" viewBox="0 0 24 24">
          <rect x="9" y="9" width="11" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

export function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const { data: eth } = useBalance({ address, chainId: sepolia.id, query: { enabled: !!address } });
  const { staked, earned } = useTotalStakePosition();

  const eRwd = useTokenBalance(REWARD_TOKEN_ADDRESS, address);
  const eTknA = useTokenBalance(TOKEN_A_ADDRESS, address);
  const eTknB = useTokenBalance(TOKEN_B_ADDRESS, address);

  const { data: stakeHist } = useHistory();
  const { data: swapHist } = useSwapHistory();

  const feed = useMemo<FeedRow[]>(() => {
    const rows: FeedRow[] = [];
    for (const e of stakeHist?.events ?? []) {
      rows.push({ type: 'stake', kind: e.kind, amount: e.amount, blockNumber: e.blockNumber, txHash: e.txHash });
    }
    for (const s of swapHist?.swaps ?? []) {
      rows.push({ type: 'swap', label: swapLabel(s), blockNumber: s.blockNumber, txHash: s.txHash });
    }
    return rows.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 25);
  }, [stakeHist, swapHist]);

  // Flips true after first paint so the allocation bars animate from 0 → share.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!isConnected || !address) {
    return (
      <div className="relative flex min-h-[72vh] items-center justify-center overflow-hidden">
        {/* Ambient floating crypto coins + colored glow blobs for depth. */}
        <TokenBlobs />
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
          <div className="absolute left-1/3 top-1/4 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo/30 blur-[120px] animate-pulse-slow" />
          <div
            className="absolute bottom-1/4 right-1/3 h-72 w-72 translate-x-1/2 rounded-full bg-aurora/20 blur-[120px] animate-pulse-slow"
            style={{ animationDelay: '1.6s' }}
          />
        </div>

        <div className="relative z-10 w-full max-w-md animate-pop-in">
          <div className="card-glow rounded-3xl px-8 py-10 text-center">
            {/* Glowing, floating diamond mark. */}
            <div className="relative mx-auto mb-5 h-20 w-20">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo to-aurora opacity-60 blur-xl animate-pulse-slow" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo to-aurora text-3xl text-white shadow-lg shadow-indigo/40 ring-1 ring-white/20 animate-float">
                ◇
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-100">Connect your wallet</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-400">
              View your balances, staking position, and activity, all in one place.
            </p>

            <button
              onClick={openConnectModal}
              className="group relative mt-6 inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-indigo to-indigo-bright px-7 py-3 text-sm font-semibold shadow-lg shadow-indigo/30 transition hover:brightness-110 active:scale-[0.98]"
            >
              {/* Sweeping sheen on hover. */}
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
                <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1h-2V7H5v10h14v-1h2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm14 4h4v4h-4a2 2 0 0 1 0-4Z" fill="currentColor" />
              </svg>
              Connect wallet
            </button>

            {/* Teaser tiles hinting at what's behind the wall. */}
            <div className="mt-8 grid grid-cols-3 gap-2">
              {[
                { label: 'Staked', accent: 'text-slate-300' },
                { label: 'Rewards', accent: 'text-aurora' },
                { label: 'Activity', accent: 'text-indigo-bright' },
              ].map((t, i) => (
                <div
                  key={t.label}
                  className="rounded-xl border border-white/5 bg-midnight/40 px-3 py-3 animate-float"
                  style={{ animationDelay: `${i * 0.6}s` }}
                >
                  <div className="text-[0.65rem] uppercase tracking-wider text-slate-500">{t.label}</div>
                  <div className={`mt-1 text-lg font-bold tracking-widest ${t.accent} opacity-50`}>•••</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const ethNum = eth ? parseFloat(eth.formatted) : 0;
  const ethSym = eth?.symbol ?? 'ETH';

  // Truthful relative split of wallet holdings (token units, not USD).
  const aNum = toNum(eTknA);
  const bNum = toNum(eTknB);
  const rNum = toNum(eRwd);
  const totalTokens = aNum + bNum + rNum;
  const share = (n: number) => (totalTokens > 0 ? (n / totalTokens) * 100 : 0);

  return (
    <div className="relative animate-fade-in max-w-5xl mx-auto">
      {/* Ambient depth behind the dashboard. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-10 left-1/4 h-64 w-64 rounded-full bg-indigo/20 blur-[120px] animate-pulse-slow" />
        <div
          className="absolute top-24 right-1/4 h-64 w-64 rounded-full bg-aurora/10 blur-[120px] animate-pulse-slow"
          style={{ animationDelay: '1.6s' }}
        />
      </div>

      {/* Hero: identity + headline staking position. */}
      <div className="relative mt-8 overflow-hidden rounded-3xl card-glow px-6 py-6 sm:px-8 sm:py-7 animate-pop-in">
        <div aria-hidden className="pointer-events-none absolute -inset-px rounded-3xl bg-gradient-to-br from-indigo/10 via-transparent to-aurora/10" />
        <div className="relative">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12">
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo to-aurora opacity-60 blur-md animate-pulse-slow" />
                <div className="relative grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo to-aurora text-xl text-white shadow-lg shadow-indigo/40 ring-1 ring-white/20 animate-float">
                  ◇
                </div>
              </div>
              <div>
                <h2 className="text-2xl font-bold leading-tight">Portfolio</h2>
                <CopyAddress address={address} short={short} />
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">Wallet ETH</div>
              <div className="text-lg font-bold text-slate-100">
                <AnimatedNumber value={ethNum} fixed className="tabular-nums" /> {ethSym}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">Staked</div>
              <div className="mt-1 flex items-baseline gap-2">
                <AnimatedNumber value={toNum(staked)} className="text-4xl font-bold text-slate-100 tabular-nums" />
                <span className="text-sm text-slate-500">eTKNA + eTKNB</span>
              </div>
            </div>
            <div className="sm:border-l sm:border-white/10 sm:pl-6">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-slate-500">
                Claimable rewards
                <span className="inline-flex items-center gap-1 rounded-full bg-aurora/15 px-1.5 py-0.5 text-[0.6rem] font-semibold normal-case tracking-normal text-aurora">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-aurora opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-aurora" />
                  </span>
                  Live
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <AnimatedNumber value={toNum(earned)} fixed className="text-4xl font-bold text-aurora tabular-nums" />
                <span className="text-sm text-slate-500">eRWD · earning</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Token balances + allocation. */}
      <div className="mt-8 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Token balances</h3>
        <span className="text-xs text-slate-600">Allocation</span>
      </div>
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full bg-aurora transition-all duration-700 ease-out" style={{ width: `${mounted ? share(aNum) : 0}%` }} />
        <div className="h-full bg-indigo-bright transition-all duration-700 ease-out" style={{ width: `${mounted ? share(bNum) : 0}%` }} />
        <div className="h-full bg-amber-400 transition-all duration-700 ease-out" style={{ width: `${mounted ? share(rNum) : 0}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BalanceTile symbol="eTKNA" name="Staking token" value={eTknA} color="aurora" share={share(aNum)} delay={0} grow={mounted} />
        <BalanceTile symbol="eTKNB" name="Staking token" value={eTknB} color="indigo" share={share(bNum)} delay={0.08} grow={mounted} />
        <BalanceTile symbol="eRWD" name="Reward token" value={eRwd} color="amber" share={share(rNum)} delay={0.16} grow={mounted} />
      </div>

      {/* Activity */}
      <div className="mt-8 mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-300">Recent activity</h3>
        {feed.length > 0 && <span className="text-xs text-slate-600 tabular-nums">{feed.length} events</span>}
      </div>
      <div className="card-glow rounded-2xl overflow-hidden">
        {feed.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-600 text-sm">
            No activity yet. Swap or stake to get started.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {feed.map((row, i) => (
              <a
                key={`${row.txHash}-${i}`}
                href={txUrl(row.txHash)}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-white/[0.03] animate-fade-in"
                style={{ animationDelay: `${Math.min(i, 12) * 0.03}s`, animationFillMode: 'backwards' }}
              >
                {row.type === 'stake' ? (
                  <Badge kind={row.kind} />
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo/20 text-indigo-bright">Swap</span>
                )}
                <span className="text-slate-300">
                  {row.type === 'stake' ? `${fmt(BigInt(row.amount))} eSTAKE` : row.label}
                </span>
                <span className="ml-auto text-xs text-slate-600 tabular-nums">Block {row.blockNumber}</span>
                <svg className="w-3.5 h-3.5 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-aurora" fill="none" viewBox="0 0 24 24">
                  <path d="M7 17L17 7m0 0H8m9 0v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
