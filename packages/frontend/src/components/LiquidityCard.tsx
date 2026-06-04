/**
 * Add / remove liquidity card for the eTKNA/eTKNB pool via the AMM router.
 *
 * Add mode: the user enters an eTKNA amount; the matching eTKNB amount is
 * derived from the live pool ratio so the deposit doesn't move the price. Both
 * tokens are approved to the router as needed before `addLiquidity`.
 *
 * Remove mode: the user picks a percentage of their LP balance to burn; the LP
 * token is approved to the router before `removeLiquidity`.
 */
import { useMemo, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits } from 'viem';
import { erc20Abi, routerAbi, pairAbi } from '../abi';
import {
  ROUTER_ADDRESS,
  PAIR_ADDRESS,
  TOKEN_A_ADDRESS,
  TOKEN_B_ADDRESS,
} from '../config';
import { fmt, txUrl } from '../format';
import { useReserves } from '../hooks';
import { Spinner } from './ui';

type Mode = 'add' | 'remove';

export function LiquidityCard() {
  const { address } = useAccount();
  const [mode, setMode] = useState<Mode>('add');
  const [amountA, setAmountA] = useState('');
  const [removePct, setRemovePct] = useState(50);

  const { reserve0, reserve1, token0 } = useReserves();

  // Map reserves (token0/token1 ordering) onto A/B by address.
  const aIsToken0 = token0?.toLowerCase() === TOKEN_A_ADDRESS.toLowerCase();
  const reserveA = aIsToken0 ? reserve0 : reserve1;
  const reserveB = aIsToken0 ? reserve1 : reserve0;

  const { data: balA } = useReadContract({
    address: TOKEN_A_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });
  const { data: balB } = useReadContract({
    address: TOKEN_B_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });
  const { data: lpBalance } = useReadContract({
    address: PAIR_ADDRESS,
    abi: pairAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const { data: allowanceA } = useReadContract({
    address: TOKEN_A_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, ROUTER_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });
  const { data: allowanceB } = useReadContract({
    address: TOKEN_B_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, ROUTER_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });
  const { data: allowanceLp } = useReadContract({
    address: PAIR_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, ROUTER_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const parsedA = useMemo(() => {
    try {
      return amountA ? parseUnits(amountA, 18) : 0n;
    } catch {
      return 0n;
    }
  }, [amountA]);

  // Matching eTKNB amount that preserves the pool ratio.
  const parsedB = useMemo(() => {
    if (parsedA === 0n || !reserveA || !reserveB || reserveA === 0n) return 0n;
    return (parsedA * reserveB) / reserveA;
  }, [parsedA, reserveA, reserveB]);

  const lpToRemove = useMemo(() => {
    if (!lpBalance) return 0n;
    return ((lpBalance as bigint) * BigInt(removePct)) / 100n;
  }, [lpBalance, removePct]);

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isConfirming;

  const deadlineTs = () => BigInt(Math.floor(Date.now() / 1000) + 30 * 60);

  // ── Add liquidity flow ──
  const needsApproveA = mode === 'add' && (allowanceA ?? 0n) < parsedA && parsedA > 0n;
  const needsApproveB = mode === 'add' && (allowanceB ?? 0n) < parsedB && parsedB > 0n;
  const needsApproveLp = mode === 'remove' && (allowanceLp ?? 0n) < lpToRemove && lpToRemove > 0n;

  const onAdd = () => {
    if (needsApproveA) {
      writeContract({ address: TOKEN_A_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS, parsedA] });
      return;
    }
    if (needsApproveB) {
      writeContract({ address: TOKEN_B_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS, parsedB] });
      return;
    }
    if (!address || parsedA === 0n || parsedB === 0n) return;
    // 0.5% slippage floor on both sides.
    const minA = (parsedA * 9950n) / 10_000n;
    const minB = (parsedB * 9950n) / 10_000n;
    writeContract({
      address: ROUTER_ADDRESS,
      abi: routerAbi,
      functionName: 'addLiquidity',
      args: [TOKEN_A_ADDRESS, TOKEN_B_ADDRESS, parsedA, parsedB, minA, minB, address, deadlineTs()],
    });
  };

  const onRemove = () => {
    if (needsApproveLp) {
      writeContract({ address: PAIR_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [ROUTER_ADDRESS, lpToRemove] });
      return;
    }
    if (!address || lpToRemove === 0n) return;
    writeContract({
      address: ROUTER_ADDRESS,
      abi: routerAbi,
      functionName: 'removeLiquidity',
      args: [TOKEN_A_ADDRESS, TOKEN_B_ADDRESS, lpToRemove, 0n, 0n, address, deadlineTs()],
    });
  };

  const addLabel = !address
    ? 'Connect wallet'
    : parsedA === 0n
      ? 'Enter an amount'
      : parsedA > ((balA as bigint | undefined) ?? 0n)
        ? 'Insufficient eTKNA'
        : parsedB > ((balB as bigint | undefined) ?? 0n)
          ? 'Insufficient eTKNB'
          : needsApproveA
            ? 'Approve eTKNA'
            : needsApproveB
              ? 'Approve eTKNB'
              : 'Add liquidity';

  const removeLabel = !address
    ? 'Connect wallet'
    : lpToRemove === 0n
      ? 'No liquidity'
      : needsApproveLp
        ? 'Approve LP'
        : 'Remove liquidity';

  const addDisabled =
    !address ||
    busy ||
    parsedA === 0n ||
    parsedB === 0n ||
    parsedA > ((balA as bigint | undefined) ?? 0n) ||
    parsedB > ((balB as bigint | undefined) ?? 0n);
  const removeDisabled = !address || busy || lpToRemove === 0n;

  return (
    <div className="w-full max-w-md mx-auto card-glow rounded-3xl p-5 animate-fade-in">
      {/* Mode toggle */}
      <div className="flex gap-1 rounded-xl bg-midnight/60 border border-white/5 p-1 mb-4">
        {(['add', 'remove'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setAmountA('');
              reset();
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition ${
              mode === m ? 'bg-indigo text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {m} liquidity
          </button>
        ))}
      </div>

      {mode === 'add' ? (
        <>
          <div className="rounded-2xl bg-midnight/60 border border-indigo/10 p-4 mb-1">
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>eTKNA</span>
              <span>Balance: {fmt(balA as bigint | undefined)}</span>
            </div>
            <input
              inputMode="decimal"
              placeholder="0"
              value={amountA}
              onChange={(e) => {
                setAmountA(e.target.value.replace(/[^0-9.]/g, ''));
                reset();
              }}
              className="w-full bg-transparent text-3xl font-bold outline-none placeholder:text-slate-600"
            />
          </div>
          <div className="flex justify-center -my-0.5 text-slate-500">+</div>
          <div className="rounded-2xl bg-midnight/40 border border-white/5 p-4 mb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>eTKNB (auto)</span>
              <span>Balance: {fmt(balB as bigint | undefined)}</span>
            </div>
            <div className="text-3xl font-bold text-slate-100">{fmt(parsedB)}</div>
          </div>

          <button
            onClick={onAdd}
            disabled={addDisabled}
            className="w-full rounded-2xl bg-gradient-to-r from-indigo to-indigo-bright py-4
                       font-semibold transition hover:brightness-110 disabled:opacity-40
                       disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy && <Spinner />}
            {addLabel}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-2xl bg-midnight/60 border border-indigo/10 p-4 mb-3">
            <div className="flex justify-between text-xs text-slate-500 mb-3">
              <span>Your LP balance</span>
              <span>{fmt(lpBalance as bigint | undefined)} eLP</span>
            </div>
            <div className="text-center text-4xl font-bold text-aurora mb-3">{removePct}%</div>
            <input
              type="range"
              min={0}
              max={100}
              value={removePct}
              onChange={(e) => setRemovePct(Number(e.target.value))}
              className="w-full accent-aurora"
            />
            <div className="flex gap-2 mt-3">
              {[25, 50, 75, 100].map((p) => (
                <button
                  key={p}
                  onClick={() => setRemovePct(p)}
                  className="flex-1 rounded-lg border border-white/10 py-1.5 text-sm text-slate-300 hover:border-aurora/40 transition"
                >
                  {p}%
                </button>
              ))}
            </div>
            <div className="mt-3 text-xs text-slate-600">
              Burning {fmt(lpToRemove)} eLP
            </div>
          </div>

          <button
            onClick={onRemove}
            disabled={removeDisabled}
            className="w-full rounded-2xl bg-gradient-to-r from-indigo to-indigo-bright py-4
                       font-semibold transition hover:brightness-110 disabled:opacity-40
                       disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {busy && <Spinner />}
            {removeLabel}
          </button>
        </>
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
