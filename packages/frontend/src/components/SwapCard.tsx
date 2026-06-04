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
import { useMemo, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits } from 'viem';
import type { Address } from 'viem';
import { erc20Abi, routerAbi } from '../abi';
import { ROUTER_ADDRESS, TOKEN_A_ADDRESS, TOKEN_B_ADDRESS, TOKENS } from '../config';
import { fmt, txUrl } from '../format';
import { useQuote } from '../hooks';
import { Spinner } from './ui';
import { SettingsPopup, GearIcon } from './SettingsPopup';

type Tab = 'swap' | 'buy' | 'sell';

const SYMBOL = (addr: Address) => TOKENS[addr.toLowerCase()]?.symbol ?? '???';

function TokenBadge({ token }: { token: Address }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-midnight-light border border-white/8 px-3 py-1.5 shrink-0">
      <span className="text-aurora text-sm">◇</span>
      <span className="font-semibold text-sm">{SYMBOL(token)}</span>
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

export function SwapCard() {
  const { address } = useAccount();
  const [tab, setTab] = useState<Tab>('swap');
  const [amount, setAmount] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [slippage, setSlippage] = useState('0.5');
  const [deadline, setDeadline] = useState('30');

  // Direction is derived from the active tab; Swap can flip freely.
  const [swapFlipped, setSwapFlipped] = useState(false);
  const [tokenIn, tokenOut]: [Address, Address] =
    tab === 'buy'
      ? [TOKEN_B_ADDRESS, TOKEN_A_ADDRESS] // buy eTKNA with eTKNB
      : tab === 'sell'
        ? [TOKEN_A_ADDRESS, TOKEN_B_ADDRESS] // sell eTKNA for eTKNB
        : swapFlipped
          ? [TOKEN_B_ADDRESS, TOKEN_A_ADDRESS]
          : [TOKEN_A_ADDRESS, TOKEN_B_ADDRESS];

  const { data: balanceIn } = useReadContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const { data: allowance } = useReadContract({
    address: tokenIn,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, ROUTER_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const parsed = useMemo(() => {
    try {
      return amount ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const path = useMemo<Address[]>(() => [tokenIn, tokenOut], [tokenIn, tokenOut]);
  const quotedOut = useQuote(parsed, path);
  const minOut = quotedOut !== undefined ? applySlippage(quotedOut, slippage) : undefined;

  const needsApproval = (allowance ?? 0n) < parsed && parsed > 0n;
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
    writeContract({
      address: ROUTER_ADDRESS,
      abi: routerAbi,
      functionName: 'swapExactTokensForTokens',
      args: [parsed, minOut, path, address, deadlineTs],
    });
  };

  const primaryLabel = !address
    ? 'Connect wallet'
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
    !address || parsed === 0n || overBalance || busy || (!needsApproval && quotedOut === undefined);

  const price =
    parsed > 0n && quotedOut !== undefined && quotedOut > 0n
      ? (Number(quotedOut) / Number(parsed)).toFixed(4)
      : null;

  return (
    <div className="w-full max-w-md mx-auto card-glow rounded-3xl p-5 animate-fade-in">
      {/* Tab row + settings gear */}
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

      {/* Input panel */}
      <div className="rounded-2xl bg-midnight/60 border border-indigo/10 p-4">
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span>{tab === 'buy' ? 'You pay' : tab === 'sell' ? 'You sell' : 'You pay'}</span>
          <span>
            Balance: {fmt(balanceIn as bigint | undefined)}{' '}
            {address && balanceIn !== undefined && (balanceIn as bigint) > 0n && (
              <button onClick={setMax} className="ml-1 text-aurora font-semibold hover:underline">
                MAX
              </button>
            )}
          </span>
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
          <TokenBadge token={tokenIn} />
        </div>

        {/* Buy presets */}
        {tab === 'buy' && (
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
        {tab === 'sell' && (
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

      {/* Flip arrow (Swap tab only) */}
      <div className="flex justify-center -my-0.5 z-10">
        <button
          onClick={() => tab === 'swap' && setSwapFlipped((v) => !v)}
          disabled={tab !== 'swap'}
          className={`rounded-xl bg-midnight border border-indigo/20 p-2 text-slate-400 text-sm transition ${
            tab === 'swap' ? 'hover:text-aurora hover:border-aurora/40 cursor-pointer' : 'cursor-default'
          }`}
          title={tab === 'swap' ? 'Flip direction' : undefined}
        >
          ↓
        </button>
      </div>

      {/* Output panel (read-only, from quote) */}
      <div className="rounded-2xl bg-midnight/40 border border-white/5 p-4">
        <div className="text-xs text-slate-500 mb-2">You receive</div>
        <div className="flex items-center gap-3">
          <span
            className={`text-4xl font-bold ${
              quotedOut && quotedOut > 0n ? 'text-slate-100' : 'text-slate-600'
            }`}
          >
            {quotedOut !== undefined ? fmt(quotedOut) : '0'}
          </span>
          <TokenBadge token={tokenOut} />
        </div>
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
        className="mt-3 w-full rounded-2xl bg-gradient-to-r from-indigo to-indigo-bright py-4
                   font-semibold text-base transition hover:brightness-110 disabled:opacity-40
                   disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {busy && <Spinner />}
        {primaryLabel}
      </button>

      {/* Slippage/deadline strip */}
      {parsed > 0n && (
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
      <div className="mt-3 min-h-[1.25rem] text-sm text-center">
        {isConfirming && <span className="text-aurora">Confirming transaction…</span>}
        {isSuccess && txHash && (
          <span className="text-emerald-400">
            Success ·{' '}
            <a className="underline" href={txUrl(txHash)} target="_blank" rel="noreferrer">
              view on Etherscan
            </a>
          </span>
        )}
        {error && <span className="text-rose-400">{error.message.split('\n')[0]}</span>}
      </div>
    </div>
  );
}
