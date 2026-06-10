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
import { createPortal } from 'react-dom';
import {
  useAccount,
  useBalance,
  useChainId,
  useSwitchChain,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { parseUnits, formatUnits, maxUint256 } from 'viem';
import type { Address } from 'viem';
import { erc20Abi, routerAbi } from '../abi';
import {
  ROUTER_ADDRESS,
  TOKEN_A_ADDRESS,
  TOKEN_B_ADDRESS,
  REWARD_TOKEN_ADDRESS,
  WETH_ADDRESS,
  TOKENS,
} from '../config';
import { fmt, txUrl } from '../format';
import { useQuote } from '../hooks';
import { Spinner, TxStatus } from './ui';
import { SettingsPopup, GearIcon } from './SettingsPopup';
// ETH logo, bundled from the cryptocurrency-icons package (served from our own
// origin by Vite — no third-party CDN), matching the homepage token art.
import ETH_ICON from 'cryptocurrency-icons/svg/color/eth.svg';

const SYMBOL = (addr: Address) =>
  TOKENS[addr.toLowerCase()]?.symbol ?? metaOf(addr)?.symbol ?? '???';

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
  /** No pool yet: shown disabled with a "Coming soon" tag. */
  comingSoon?: boolean;
};

// Full wallet catalogue shown in the picker, Uniswap-style: native ETH first,
// then every Equinox token. ETH is represented by the WETH address (the router
// wraps/unwraps it); the deployed pools are eTKNA⇄eTKNB, WETH⇄eTKNA, WETH⇄eTKNB.
const TOKEN_CATALOG: TokenMeta[] = [
  { address: WETH_ADDRESS, symbol: 'ETH', name: 'Ethereum', native: true, img: ETH_ICON },
  { address: REWARD_TOKEN_ADDRESS, symbol: 'eRWD', name: 'Equinox Reward', badge: 'eR', grad: 'from-indigo-bright to-indigo', comingSoon: true },
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

      {open && createPortal(
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/30 backdrop-blur-sm p-4 pt-24 sm:items-center sm:pt-4 animate-fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[420px] max-h-[88vh] flex-col rounded-3xl border border-white/10 bg-midnight-light shadow-2xl shadow-black/60 animate-pop-in"
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
                    disabled={t.comingSoon}
                    onClick={() => {
                      if (t.comingSoon) return;
                      onChange?.(t.address);
                      setOpen(false);
                    }}
                    title={t.comingSoon ? 'Coming soon' : undefined}
                    className={`w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition ${
                      t.comingSoon
                        ? 'opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'bg-indigo/15 cursor-pointer'
                          : 'hover:bg-white/5 cursor-pointer'
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
                    {t.comingSoon ? (
                      <span className="ml-auto rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-slate-400">
                        Coming soon
                      </span>
                    ) : (
                      <div className="ml-auto text-base font-medium text-slate-200">{bal}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
        document.body,
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
 * @param swapOnly  Strips the card chrome (no outer panel / gear) for the
 *                  homepage hero. Either way the card only swaps, no Buy/Sell.
 */
export function SwapCard({ swapOnly = false }: { swapOnly?: boolean } = {}) {
  const { address } = useAccount();
  // The wallet's *active* chain. If it isn't Sepolia, any tx would be built and
  // paid for on that chain (e.g. real ETH on mainnet) — so we block the swap and
  // offer a one-tap switch instead.
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const wrongNetwork = !!address && chainId !== sepolia.id;
  const [amount, setAmount] = useState('');
  // True between an approval tx and its auto-fired swap (one-click approve+swap).
  const [pendingSwap, setPendingSwap] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [slippage, setSlippage] = useState('0.5');

  // Free token selection on both sides; the flip arrow reverses direction.
  const [swapTokenIn, setSwapTokenIn] = useState<Address>(TOKEN_A_ADDRESS);
  const [swapTokenOut, setSwapTokenOut] = useState<Address>(TOKEN_B_ADDRESS);

  const tokenIn = swapTokenIn;
  const tokenOut = swapTokenOut;

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
    setPendingSwap(false);
    reset();
  };

  const setMax = () =>
    balanceIn !== undefined && setAmount(fmt(balanceIn as bigint, 18, 18));

  /** Fires the actual swap tx (native-in / native-out / token-token). */
  const executeSwap = () => {
    if (minOut === undefined || !address) return;
    // Fixed 30-minute transaction deadline (no longer user-configurable).
    const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

    if (nativeIn) {
      // Selling native ETH: wrap via msg.value, path starts at WETH.
      writeContract({
        chainId: sepolia.id,
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
        chainId: sepolia.id,
        address: ROUTER_ADDRESS,
        abi: routerAbi,
        functionName: 'swapExactTokensForETH',
        args: [parsed, minOut, path, address, deadlineTs],
      });
      return;
    }
    writeContract({
      chainId: sepolia.id,
      address: ROUTER_ADDRESS,
      abi: routerAbi,
      functionName: 'swapExactTokensForTokens',
      args: [parsed, minOut, path, address, deadlineTs],
    });
  };

  const onPrimary = () => {
    if (wrongNetwork) {
      switchChain({ chainId: sepolia.id });
      return;
    }
    if (needsApproval) {
      // Clear any prior tx's success first, otherwise the auto-swap effect would
      // fire immediately off the stale `isSuccess` instead of waiting for this
      // approval. Then approve, and the effect fires the swap on confirm (1 click).
      reset();
      setPendingSwap(true);
      // Approve max once so this token never needs approving again, subsequent
      // swaps are a single confirmation (standard Uniswap allowance pattern).
      writeContract({
        chainId: sepolia.id,
        address: tokenIn,
        abi: erc20Abi,
        functionName: 'approve',
        args: [ROUTER_ADDRESS, maxUint256],
      });
      return;
    }
    executeSwap();
  };

  // When the approval tx confirms, automatically submit the queued swap so the
  // user doesn't have to click a second time (and think the swap already ran).
  useEffect(() => {
    if (isSuccess && pendingSwap) {
      setPendingSwap(false);
      executeSwap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, pendingSwap]);

  const primaryLabel = !address
    ? 'Connect wallet'
    : wrongNetwork
      ? isSwitching ? 'Switching…' : 'Switch to Sepolia'
      : !routeOk
        ? 'No liquidity for this pair'
        : parsed === 0n
          ? 'Enter an amount'
          : overBalance
            ? 'Insufficient balance'
            : quotedOut === undefined
              ? 'Fetching quote…'
              : pendingSwap
                ? 'Approving…'
                : busy
                  ? 'Confirming…'
                  : 'Swap';

  const primaryDisabled = !address
    ? true
    : wrongNetwork
      ? isSwitching
      : !routeOk || parsed === 0n || overBalance || busy || (!needsApproval && quotedOut === undefined);

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
      {/* Title + settings gear (hidden in the chrome-less homepage mode) */}
      {!swapOnly && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-lg font-bold text-slate-100">Swap</span>

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
                onClose={() => setShowSettings(false)}
              />
            )}
          </div>
        </div>
      )}

      {/* Sell panel (Uniswap layout) */}
      <div className="rounded-2xl bg-midnight/60 border border-indigo/10 p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-slate-300">Sell</span>
          {address && balanceIn !== undefined && (balanceIn as bigint) > 0n && (
            <button
              onClick={setMax}
              className="text-xs font-semibold text-slate-500 hover:text-aurora transition"
            >
              Max
            </button>
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
          <TokenSelector selected={tokenIn} onChange={handleTokenInChange} />
        </div>
        <div className="flex justify-between items-center text-sm text-slate-500 mt-2">
          <span>$0</span>
          <span>
            {fmt(balanceIn as bigint | undefined)} {SYMBOL(tokenIn)}
          </span>
        </div>
      </div>

      {/* Cut-out down arrow straddling the two panels (Uniswap style) */}
      <div className="flex justify-center relative z-10 -my-3.5">
        <button
          onClick={flipSwap}
          className="rounded-xl bg-midnight-light border-4 border-midnight p-2 text-slate-200 hover:bg-white/10 cursor-pointer transition"
          title="Flip direction"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24">
            <path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Buy panel (read-only, from quote) */}
      <div className="rounded-2xl bg-midnight/40 border border-white/5 px-4 pb-4 pt-7">
        <div className="text-sm text-slate-300 mb-2">Buy</div>
        <div className="flex items-center justify-between gap-3">
          <span
            className={`text-4xl font-bold ${
              quotedOut && quotedOut > 0n ? 'text-slate-100' : 'text-slate-600'
            }`}
          >
            {quotedOut !== undefined ? fmt(quotedOut) : '0'}
          </span>
          <TokenSelector selected={tokenOut} onChange={handleTokenOutChange} />
        </div>
        <div className="mt-2 text-sm text-slate-500">$0</div>
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

      {/* Slippage strip (hidden in swap-only mode) */}
      {!swapOnly && parsed > 0n && (
        <div className="mt-2 flex items-center text-xs text-slate-600 px-1">
          <span>
            Max slippage: <span className="text-slate-500">{slippage}%</span>
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
