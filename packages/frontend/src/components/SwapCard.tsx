/**
 * Uniswap-style swap card backed by the EquinoxFi AMM router.
 *
 * Three tabs map onto the same on-chain `swapExactTokensForTokens` call:
 *   - Swap: free direction with a flip arrow + token dropdowns (eTKNA ↔ eTKNB);
 *   - Buy:  direction locked to eTKNB → eTKNA, with input-amount presets;
 *   - Sell: direction locked to eTKNA → eTKNB, with 25/50/75/Max of balance.
 *
 * Output is quoted live from the router's `getAmountsOut`; the gear popup's
 * slippage tolerance sets `amountOutMin` and its deadline sets the router
 * `deadline` argument. ERC-20 approval to the router is handled inline (the
 * primary button becomes "Approve" when allowance is short).
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import {
  useAccount,
  useBalance,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import type { Address } from 'viem';
import { erc20Abi, routerAbi } from '../abi';
import {
  ROUTER_ADDRESS,
  TOKEN_A_ADDRESS,
  TOKEN_B_ADDRESS,
  STAKING_TOKEN_ADDRESS,
  REWARD_TOKEN_ADDRESS,
  WETH_ADDRESS,
  TOKENS,
} from '../config';
import { fmt, txUrl } from '../format';
import { useQuote } from '../hooks';
import { Spinner, TxStatus } from './ui';
import { SettingsPopup, GearIcon } from './SettingsPopup';

type Tab = 'swap' | 'buy' | 'sell';

const SYMBOL = (addr: Address) =>
  TOKENS[addr.toLowerCase()]?.symbol ?? metaOf(addr)?.symbol ?? '???';

/** ETH logo from the same pinned crypto-icon CDN used by the homepage art. */
const ETH_ICON = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/color/eth.svg';

type TokenMeta = {
  address: Address;
  symbol: string;
  name: string;
  /** Native ETH balance comes from `useBalance`, not an ERC-20 read. */
  native?: boolean;
  /** Optional remote logo (ETH); otherwise a lettered gradient coin is drawn. */
  img?: string;
  /** 1–3 char label drawn inside the gradient coin. */
  badge?: string;
  /** Tailwind gradient (`from-… to-…`) for the lettered coin. */
  grad?: string;
};

// Full wallet catalogue shown in the picker, Uniswap-style: native ETH first,
// then every Equinox token. ETH is represented by the WETH address (the router
// wraps/unwraps it); the deployed pools are eTKNA⇄eTKNB, WETH⇄eTKNA, WETH⇄eTKNB.
const TOKEN_CATALOG: TokenMeta[] = [
  { address: WETH_ADDRESS, symbol: 'ETH', name: 'Ethereum', native: true, img: ETH_ICON },
  { address: REWARD_TOKEN_ADDRESS, symbol: 'eRWD', name: 'Equinox Reward', badge: 'eR', grad: 'from-indigo-bright to-indigo' },
  { address: STAKING_TOKEN_ADDRESS, symbol: 'eSTAKE', name: 'Equinox Stake', badge: 'eS', grad: 'from-rose-500 to-rose-700' },
  { address: TOKEN_A_ADDRESS, symbol: 'eTKNA', name: 'Equinox Token A', badge: 'eA', grad: 'from-aurora to-aurora-dim' },
  { address: TOKEN_B_ADDRESS, symbol: 'eTKNB', name: 'Equinox Token B', badge: 'eB', grad: 'from-cyan-400 to-sky-600' },
];

const isNative = (addr: Address) => addr.toLowerCase() === WETH_ADDRESS.toLowerCase();

// Tokens with a deployed pool: eTKNA, eTKNB, and WETH (paired with each).
const POOLED = new Set([
  TOKEN_A_ADDRESS.toLowerCase(),
  TOKEN_B_ADDRESS.toLowerCase(),
  WETH_ADDRESS.toLowerCase(),
]);
const hasPool = (a: Address, b: Address) =>
  a.toLowerCase() !== b.toLowerCase() && POOLED.has(a.toLowerCase()) && POOLED.has(b.toLowerCase());

const metaOf = (addr: Address): TokenMeta | undefined =>
  TOKEN_CATALOG.find((t) => t.address.toLowerCase() === addr.toLowerCase());

const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Balance with thousands separators + full precision, e.g. 2.39534, 899,000 (Uniswap-style). */
function fmtBalance(v: bigint | undefined): string {
  if (v === undefined) return '0';
  return Number(formatUnits(v, 18)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

/** Circular token coin: remote logo when available, else a lettered gradient. */
function TokenCoin({ meta, className = 'h-6 w-6' }: { meta?: TokenMeta; className?: string }) {
  if (meta?.img) {
    return <img src={meta.img} alt="" draggable={false} className={`rounded-full ${className}`} />;
  }
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${
        meta?.grad ?? 'from-indigo-bright to-aurora'
      } ring-1 ring-white/20 text-[0.6rem] font-bold text-white ${className}`}
    >
      {meta?.badge ?? '◇'}
    </span>
  );
}

/** Reads every catalogue balance (ETH + ERC-20s) for the picker; lazy via `enabled`. */
function useWalletBalances(account: Address | undefined, enabled: boolean) {
  const erc20 = TOKEN_CATALOG.filter((t) => !t.native);
  const { data: native } = useBalance({
    address: account,
    query: { enabled: enabled && !!account },
  });
  const { data: reads } = useReadContracts({
    contracts: erc20.map((t) => ({
      address: t.address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: account ? [account] : undefined,
    })),
    query: { enabled: enabled && !!account },
  });

  const map: Record<string, bigint> = {};
  if (native) map[TOKEN_CATALOG[0].address.toLowerCase()] = native.value;
  erc20.forEach((t, i) => {
    const r = reads?.[i];
    if (r?.status === 'success') map[t.address.toLowerCase()] = r.result as bigint;
  });
  return map;
}

function TokenSelector({
  selected,
  onChange,
  disabled,
}: {
  selected: Address;
  onChange?: (addr: Address) => void;
  disabled?: boolean;
}) {
  const { address: account } = useAccount();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const balances = useWalletBalances(account, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const selectedMeta = metaOf(selected);
  const q = query.trim().toLowerCase();
  const rows = TOKEN_CATALOG.filter(
    (t) => !q || t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q),
  );

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && onChange && setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 pl-1.5 pr-2.5 py-1.5 shadow-sm transition ${
          disabled || !onChange
            ? 'cursor-default'
            : 'hover:bg-white/[0.1] hover:border-white/20 cursor-pointer active:scale-[0.98]'
        }`}
      >
        <TokenCoin meta={selectedMeta} />
        <span className="font-semibold text-sm tracking-tight">{SYMBOL(selected)}</span>
        {!disabled && onChange && (
          <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-24 sm:items-center sm:pt-4 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[420px] max-h-[80vh] flex-col rounded-3xl border border-white/10 bg-midnight-light shadow-2xl shadow-black/60 animate-pop-in"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-lg font-semibold text-slate-100">Select a token</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-slate-400 hover:text-slate-100 hover:bg-white/5 transition"
                title="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Search */}
            <div className="px-5 pb-4">
              <div className="flex items-center gap-2 rounded-2xl bg-midnight border border-white/10 px-4 py-3 focus-within:border-indigo/40 transition">
                <svg className="w-5 h-5 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none">
                  <path d="M11 4a7 7 0 1 0 0 14A7 7 0 0 0 11 4zm-9 7a9 9 0 1 1 18 0 9 9 0 0 1-18 0zm14.293 4.293a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1-1.414 1.414l-3-3a1 1 0 0 1 0-1.414z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
                </svg>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tokens"
                  className="w-full bg-transparent text-base outline-none placeholder:text-slate-600 text-slate-200"
                />
              </div>
            </div>

            {/* List */}
            <div className="px-5 pb-2 text-sm font-medium text-slate-500">Your tokens</div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {rows.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-slate-600">No tokens found</div>
              )}
              {rows.map((t) => {
                const isSelected = t.address.toLowerCase() === selected.toLowerCase();
                const bal = fmtBalance(balances[t.address.toLowerCase()]);
                return (
                  <button
                    key={t.address + t.symbol}
                    type="button"
                    onClick={() => {
                      onChange?.(t.address);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left cursor-pointer transition ${
                      isSelected ? 'bg-indigo/15' : 'hover:bg-white/5'
                    }`}
                  >
                    <TokenCoin meta={t} className="h-10 w-10" />
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                        {t.name}
                        {isSelected && (
                          <svg className="w-4 h-4 text-aurora" fill="none" viewBox="0 0 24 24">
                            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <div className="text-sm text-slate-500 truncate">
                        {t.symbol}
                        {!t.native && <span className="ml-1.5 text-slate-600">{shortAddr(t.address)}</span>}
                      </div>
                    </div>
                    <div className="ml-auto text-base font-medium text-slate-200">{bal}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Applies a slippage tolerance (percent string) to an output amount. */
function applySlippage(amountOut: bigint, slippagePct: string): bigint {
  const pct = Number(slippagePct);
  if (!Number.isFinite(pct) || pct < 0) return amountOut;
  // basis points to avoid float drift: floor(amountOut * (10000 - bps) / 10000)
  const bps = BigInt(Math.round(pct * 100));
  return (amountOut * (10_000n - bps)) / 10_000n;
}

/**
 * @param swapOnly  Hide the Buy/Sell tabs and lock the card to the Swap action.
 *                  Used on the homepage hero, where only swapping is offered.
 */
export function SwapCard({ swapOnly = false }: { swapOnly?: boolean } = {}) {
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>('swap');
  const [amount, setAmount] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [slippage, setSlippage] = useState('0.5');
  const [deadline, setDeadline] = useState('30');

  // Swap tab: free token selection. Buy/Sell: direction locked.
  const [swapTokenIn, setSwapTokenIn] = useState<Address>(TOKEN_A_ADDRESS);
  const [swapTokenOut, setSwapTokenOut] = useState<Address>(TOKEN_B_ADDRESS);

  const [tokenIn, tokenOut]: [Address, Address] =
    tab === 'buy'
      ? [TOKEN_B_ADDRESS, TOKEN_A_ADDRESS]
      : tab === 'sell'
        ? [TOKEN_A_ADDRESS, TOKEN_B_ADDRESS]
        : [swapTokenIn, swapTokenOut];

  function flipSwap() {
    setSwapTokenIn(swapTokenOut);
    setSwapTokenOut(swapTokenIn);
    resetInput();
  }

  function handleTokenInChange(addr: Address) {
    if (addr.toLowerCase() === swapTokenOut.toLowerCase()) {
      setSwapTokenIn(swapTokenOut);
      setSwapTokenOut(swapTokenIn);
    } else {
      setSwapTokenIn(addr);
    }
    resetInput();
  }

  function handleTokenOutChange(addr: Address) {
    if (addr.toLowerCase() === swapTokenIn.toLowerCase()) {
      setSwapTokenOut(swapTokenIn);
      setSwapTokenIn(swapTokenOut);
    } else {
      setSwapTokenOut(addr);
    }
    resetInput();
  }

  const nativeIn = isNative(tokenIn);
  const nativeOut = isNative(tokenOut);

  const { data: erc20BalanceIn } = useReadContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && !nativeIn, refetchInterval: 8_000 },
  });

  // Native ETH balance (used when selling ETH).
  const { data: nativeBalance } = useBalance({
    address,
    query: { enabled: !!address && nativeIn, refetchInterval: 8_000 },
  });

  const balanceIn: bigint | undefined = nativeIn
    ? nativeBalance?.value
    : (erc20BalanceIn as bigint | undefined);

  const { data: allowance } = useReadContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, ROUTER_ADDRESS] : undefined,
    query: { enabled: !!address && !nativeIn, refetchInterval: 8_000 },
  });

  const parsed = useMemo(() => {
    try {
      return amount ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const path = useMemo<Address[]>(() => [tokenIn, tokenOut], [tokenIn, tokenOut]);
  // A swap can only route through the single deployed eTKNA/eTKNB pool.
  const routeOk = hasPool(tokenIn, tokenOut);
  const quotedOut = useQuote(routeOk ? parsed : 0n, path);
  const minOut = quotedOut !== undefined ? applySlippage(quotedOut, slippage) : undefined;

  // Native ETH needs no ERC-20 approval; the router wraps it via msg.value.
  const needsApproval = !nativeIn && (allowance ?? 0n) < parsed && parsed > 0n;
  const overBalance = parsed > ((balanceIn as bigint | undefined) ?? 0n);

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isConfirming;

  const resetInput = () => {
    setAmount('');
    reset();
  };

  const setMax = () =>
    balanceIn !== undefined && setAmount(fmt(balanceIn as bigint, 18, 18));
  const setPercent = (p: number) =>
    balanceIn !== undefined &&
    setAmount(fmt(((balanceIn as bigint) * BigInt(p)) / 100n, 18, 18));
  const setPreset = (whole: number) => setAmount(String(whole));

  const onPrimary = () => {
    if (needsApproval) {
      writeContract({
        address: tokenIn,
        abi: erc20Abi,
        functionName: 'approve',
        args: [ROUTER_ADDRESS, parsed],
      });
      return;
    }
    if (minOut === undefined || !address) return;
    const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + Number(deadline || '30') * 60);

    if (nativeIn) {
      // Selling native ETH: wrap via msg.value, path starts at WETH.
      writeContract({
        address: ROUTER_ADDRESS,
        abi: routerAbi,
        functionName: 'swapExactETHForTokens',
        args: [minOut, path, address, deadlineTs],
        value: parsed,
      });
      return;
    }
    if (nativeOut) {
      // Buying native ETH: router unwraps WETH and forwards ETH.
      writeContract({
        address: ROUTER_ADDRESS,
        abi: routerAbi,
        functionName: 'swapExactTokensForETH',
        args: [parsed, minOut, path, address, deadlineTs],
      });
      return;
    }
    writeContract({
      address: ROUTER_ADDRESS,
      abi: routerAbi,
      functionName: 'swapExactTokensForTokens',
      args: [parsed, minOut, path, address, deadlineTs],
    });
  };

  const primaryLabel = !address
    ? 'Connect wallet'
    : !routeOk
      ? 'No liquidity for this pair'
      : parsed === 0n
        ? 'Enter an amount'
        : overBalance
          ? 'Insufficient balance'
          : quotedOut === undefined
            ? 'Fetching quote…'
            : needsApproval
              ? `Approve ${SYMBOL(tokenIn)}`
              : tab === 'buy'
                ? 'Buy'
                : tab === 'sell'
                  ? 'Sell'
                  : 'Swap';

  const primaryDisabled =
    !address || !routeOk || parsed === 0n || overBalance || busy || (!needsApproval && quotedOut === undefined);

  const price =
    parsed > 0n && quotedOut !== undefined && quotedOut > 0n
      ? (Number(quotedOut) / Number(parsed)).toFixed(4)
      : null;

  return (
    <div
      className={`w-full max-w-md mx-auto rounded-3xl animate-fade-in text-left ${
        swapOnly ? '' : 'card-glow p-5'
      }`}
    >
      {/* Tab row + settings gear — hidden in swap-only (Uniswap-style) mode */}
      {!swapOnly && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-1 rounded-xl bg-midnight/60 border border-white/5 p-1">
            {(['swap', 'buy', 'sell'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  resetInput();
                }}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition ${
                  tab === t
                    ? 'bg-indigo text-white shadow-lg shadow-indigo/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`p-2 rounded-xl transition ${
                showSettings
                  ? 'text-aurora bg-aurora/10'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`}
              title="Settings"
            >
              <GearIcon />
            </button>
            {showSettings && (
              <SettingsPopup
                slippage={slippage}
                setSlippage={setSlippage}
                deadline={deadline}
                setDeadline={setDeadline}
                onClose={() => setShowSettings(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* Input panel */}
      <div className={`rounded-2xl border border-indigo/10 ${swapOnly ? 'bg-midnight/70 p-4' : 'bg-midnight/60 p-4'}`}>
        <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
          <span className={swapOnly ? 'text-sm text-slate-300' : ''}>
            {swapOnly ? 'Sell' : tab === 'sell' ? 'You sell' : 'You pay'}
          </span>
          {swapOnly ? (
            address && balanceIn !== undefined && (balanceIn as bigint) > 0n ? (
              <div className="flex gap-1.5">
                {[25, 50, 75].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPercent(p)}
                    className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 transition"
                  >
                    {p}%
                  </button>
                ))}
                <button
                  onClick={setMax}
                  className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/10 transition"
                >
                  Max
                </button>
              </div>
            ) : null
          ) : (
            <span>
              Balance: {fmt(balanceIn as bigint | undefined)}{' '}
              {address && balanceIn !== undefined && (balanceIn as bigint) > 0n && (
                <button onClick={setMax} className="ml-1 text-aurora font-semibold hover:underline">
                  MAX
                </button>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <input
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ''));
              reset();
            }}
            className="w-full bg-transparent text-4xl font-bold outline-none placeholder:text-slate-600"
          />
          <TokenSelector
            selected={tokenIn}
            onChange={tab === 'swap' ? handleTokenInChange : undefined}
          />
        </div>

        {/* Swap-only: Uniswap-style USD value + balance footer */}
        {swapOnly && (
          <div className="flex justify-between items-center text-sm text-slate-500 mt-2">
            <span>$0</span>
            <span>
              {fmt(balanceIn as bigint | undefined)} {SYMBOL(tokenIn)}
            </span>
          </div>
        )}

        {/* Buy presets */}
        {!swapOnly && tab === 'buy' && (
          <div className="flex gap-2 mt-3">
            {[100, 300, 1000].map((v) => (
              <button
                key={v}
                onClick={() => setPreset(v)}
                className="flex-1 rounded-lg border border-white/10 py-1.5 text-sm text-slate-300 hover:border-aurora/40 transition"
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Sell percent shortcuts */}
        {!swapOnly && tab === 'sell' && (
          <div className="flex gap-2 mt-3">
            {[25, 50, 75].map((p) => (
              <button
                key={p}
                onClick={() => setPercent(p)}
                className="flex-1 rounded-lg border border-white/10 py-1.5 text-sm text-slate-300 hover:border-aurora/40 transition"
              >
                {p}%
              </button>
            ))}
            <button
              onClick={setMax}
              className="flex-1 rounded-lg border border-white/10 py-1.5 text-sm text-slate-300 hover:border-aurora/40 transition"
            >
              Max
            </button>
          </div>
        )}
      </div>

      {/* Direction button — swap-only mode mimics Uniswap's cut-out down arrow */}
      <div className={`flex justify-center relative z-10 ${swapOnly ? '-my-3.5' : '-my-5'}`}>
        <button
          onClick={() => tab === 'swap' && flipSwap()}
          disabled={tab !== 'swap'}
          className={
            swapOnly
              ? 'rounded-xl bg-midnight-light border-4 border-midnight p-2 text-slate-200 hover:bg-white/10 cursor-pointer transition'
              : `rounded-xl bg-midnight border border-indigo/20 p-2 transition ${
                  tab === 'swap'
                    ? 'hover:text-aurora hover:border-aurora/40 cursor-pointer text-slate-400'
                    : 'cursor-default text-slate-600'
                }`
          }
          title={tab === 'swap' ? 'Flip direction' : undefined}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
            {swapOnly ? (
              <path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            ) : (
              <path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        </button>
      </div>

      {/* Output panel (read-only, from quote) */}
      <div className={`rounded-2xl border border-white/5 px-4 pb-4 pt-7 ${swapOnly ? 'bg-midnight/70' : 'bg-midnight/40'}`}>
        <div className={`text-slate-500 mb-2 ${swapOnly ? 'text-sm text-slate-300' : 'text-xs'}`}>
          {swapOnly ? 'Buy' : 'You receive'}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span
            className={`text-4xl font-bold ${
              quotedOut && quotedOut > 0n ? 'text-slate-100' : 'text-slate-600'
            }`}
          >
            {quotedOut !== undefined ? fmt(quotedOut) : '0'}
          </span>
          <TokenSelector
            selected={tokenOut}
            onChange={tab === 'swap' ? handleTokenOutChange : undefined}
          />
        </div>
        {swapOnly && <div className="mt-2 text-sm text-slate-500">$0</div>}
        {price && (
          <div className="mt-2 text-xs text-slate-600">
            1 {SYMBOL(tokenIn)} ≈ {price} {SYMBOL(tokenOut)}
            {minOut !== undefined && <> · min received {fmt(minOut)}</>}
          </div>
        )}
      </div>

      {/* Primary action */}
      <button
        onClick={onPrimary}
        disabled={primaryDisabled}
        className={`mt-3 w-full rounded-2xl bg-gradient-to-r from-indigo to-indigo-bright py-4
                   font-semibold transition hover:brightness-110 disabled:opacity-40
                   disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                     swapOnly ? 'text-lg' : 'text-base'
                   }`}
      >
        {busy && <Spinner />}
        {primaryLabel}
      </button>

      {/* Slippage/deadline strip (hidden in swap-only mode) */}
      {!swapOnly && parsed > 0n && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-600 px-1">
          <span>
            Max slippage: <span className="text-slate-500">{slippage}%</span>
          </span>
          <span>
            Deadline: <span className="text-slate-500">{deadline} min</span>
          </span>
        </div>
      )}

      {/* Tx feedback */}
      <TxStatus
        pending={isConfirming}
        success={!isConfirming && isSuccess && !!txHash}
        successHref={txHash ? txUrl(txHash) : undefined}
        error={error ? error.message.split('\n')[0] : undefined}
      />
    </div>
  );
}
