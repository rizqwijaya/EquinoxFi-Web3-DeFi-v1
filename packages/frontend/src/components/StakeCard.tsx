import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits } from 'viem';
import { vaultAbi, erc20Abi } from '../abi';
import { STAKE_VAULTS, REWARD_SYMBOL, type StakeVault } from '../config';
import { fmt, txUrl } from '../format';
import { useVaultPosition, useClaimableRewards } from '../hooks';
import type { Address } from 'viem';
import { Spinner, TxStatus } from './ui';
import { SettingsPopup, GearIcon } from './SettingsPopup';

type Mode = 'stake' | 'unstake' | 'claim';

// ── Token coins ───────────────────────────────────────────────────────────────
// Lettered gradient coins, matching the Swap card's token catalogue so the Stake
// page pills read identically. Keyed by symbol; stake tokens come from the
// STAKE_VAULTS catalogue, plus the eRWD reward coin.
const COIN: Record<string, { badge: string; grad: string }> = {
  eRWD: { badge: 'eR', grad: 'from-indigo-bright to-indigo' },
  ...Object.fromEntries(STAKE_VAULTS.map((v) => [v.symbol, { badge: v.badge, grad: v.grad }])),
};

function Coin({ symbol }: { symbol: string }) {
  const coin = COIN[symbol] ?? { badge: '◇', grad: 'from-indigo-bright to-aurora' };
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br ${coin.grad} ring-1 ring-white/20 text-[0.6rem] font-bold text-white shrink-0`}
    >
      {coin.badge}
    </span>
  );
}

/** Static token badge (the read-only "receive" / claim side). */
function TokenBadge({ symbol }: { symbol: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 pl-1.5 pr-2.5 py-1.5 shadow-sm shrink-0">
      <Coin symbol={symbol} />
      <span className="font-semibold text-sm tracking-tight">{symbol}</span>
    </div>
  );
}

/** Dropdown to pick which token to stake (eTKNA / eTKNB), Swap-pill styled. */
function StakeTokenSelector({
  selected,
  onChange,
}: {
  selected: StakeVault;
  onChange: (v: StakeVault) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-white/[0.06] border border-white/10 pl-1.5 pr-2 py-1.5 shadow-sm transition hover:bg-white/[0.1] hover:border-white/20 cursor-pointer active:scale-[0.98]"
      >
        <Coin symbol={selected.symbol} />
        <span className="font-semibold text-sm tracking-tight">{selected.symbol}</span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-30 w-48 rounded-2xl border border-white/10 bg-midnight-light shadow-2xl shadow-black/60 p-1.5 animate-fade-in">
          {STAKE_VAULTS.map((v) => {
            const isSel = v.vault.toLowerCase() === selected.vault.toLowerCase();
            return (
              <button
                key={v.vault}
                type="button"
                onClick={() => { onChange(v); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                  isSel ? 'bg-indigo/15' : 'hover:bg-white/5'
                }`}
              >
                <Coin symbol={v.symbol} />
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-100">{v.symbol}</div>
                  <div className="text-xs text-slate-500 truncate">{v.name}</div>
                </div>
                {isSel && (
                  <svg className="ml-auto w-4 h-4 text-aurora" fill="none" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main card ─────────────────────────────────────────────────────────────────
export function StakeCard() {
  const { address } = useAccount();
  const [mode, setMode] = useState<Mode>('stake');
  const [amount, setAmount] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [slippage, setSlippage] = useState('0.5');

  // Which token/vault is being staked (eTKNA or eTKNB). Each has its own vault.
  const [selected, setSelected] = useState<StakeVault>(STAKE_VAULTS[0]);
  const vault = selected.vault;
  const stakingToken = selected.token;
  const stakeSymbol = selected.symbol;

  const { staked, earned } = useVaultPosition(vault);

  // Claim aggregates eRWD across all vaults — the reward token is the same, so
  // there's no token to pick in the Claim tab.
  const { perVault: claimables, total: totalClaimable } = useClaimableRewards();

  const { data: walletBalance } = useReadContract({
    address: stakingToken,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const { data: allowance } = useReadContract({
    address: stakingToken,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, vault] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const parsed = useMemo(() => {
    try {
      return amount ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const available = mode === 'stake' ? (walletBalance as bigint | undefined) : staked;
  const needsApproval = mode === 'stake' && (allowance ?? 0n) < parsed && parsed > 0n;
  const overBalance = parsed > (available ?? 0n);

  const queryClient = useQueryClient();
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isConfirming;

  // Tracks which action the current tx represents so we can chain approve → stake
  // and walk the claim queue across vaults.
  const pendingAction = useRef<'approve' | 'stake' | 'claim' | null>(null);
  // Remaining vaults to claim after the current claim tx confirms.
  const claimQueue = useRef<Address[]>([]);

  const setMax = () => available !== undefined && setAmount(fmt(available, 18, 18));

  // Switching the staked token clears the amount and any in-flight tx state.
  const onSelectToken = (v: StakeVault) => {
    setSelected(v);
    setAmount('');
    pendingAction.current = null;
    reset();
  };

  const onPrimary = () => {
    if (mode === 'claim') {
      // Claim from every vault holding rewards; queue the rest to fire on confirm.
      const pending = claimables.filter((c) => c.earned > 0n).map((c) => c.vault);
      if (pending.length === 0) return;
      claimQueue.current = pending.slice(1);
      pendingAction.current = 'claim';
      writeContract({ address: pending[0], abi: vaultAbi, functionName: 'claimReward', args: [] });
      return;
    }
    if (mode === 'stake') {
      if (needsApproval) {
        pendingAction.current = 'approve';
        writeContract({ address: stakingToken, abi: erc20Abi, functionName: 'approve', args: [vault, parsed] });
      } else {
        pendingAction.current = 'stake';
        writeContract({ address: vault, abi: vaultAbi, functionName: 'stake', args: [parsed] });
      }
    } else {
      pendingAction.current = null;
      writeContract({ address: vault, abi: vaultAbi, functionName: 'withdraw', args: [parsed] });
    }
  };

  // After an approval confirms, auto-fire the stake so the user only signs once
  // conceptually (two wallet prompts, but no "forgotten second click").
  useEffect(() => {
    if (!isSuccess) return;
    // A tx just confirmed — refresh the backend-driven activity feed + protocol
    // stats so the Portfolio/landing update on their own (the 4s feed poll
    // bridges any indexer lag), no manual page refresh needed.
    queryClient.invalidateQueries({ queryKey: ['history'] });
    queryClient.invalidateQueries({ queryKey: ['activity'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    if (pendingAction.current === 'approve' && parsed > 0n) {
      pendingAction.current = 'stake';
      reset();
      writeContract({ address: vault, abi: vaultAbi, functionName: 'stake', args: [parsed] });
    } else if (pendingAction.current === 'claim' && claimQueue.current.length > 0) {
      // One vault claimed; fire the next queued claim.
      const next = claimQueue.current[0];
      claimQueue.current = claimQueue.current.slice(1);
      reset();
      writeContract({ address: next, abi: vaultAbi, functionName: 'claimReward', args: [] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const primaryLabel = !address
    ? 'Connect wallet'
    : mode === 'claim'
    ? totalClaimable === 0n
      ? 'No rewards yet'
      : `Claim ${fmt(totalClaimable)} ${REWARD_SYMBOL}`
    : parsed === 0n
    ? 'Enter an amount'
    : overBalance
    ? 'Insufficient balance'
    : mode === 'stake'
    ? needsApproval
      ? `Approve ${stakeSymbol}`
      : 'Stake'
    : 'Unstake';

  const primaryDisabled =
    !address ||
    busy ||
    (mode === 'claim' ? totalClaimable === 0n : parsed === 0n || overBalance);

  // What the "receive" panel shows
  const receiveLabel = mode === 'stake' ? 'You receive (staked)' : mode === 'unstake' ? 'You receive (wallet)' : 'You receive';
  const receiveValue = mode === 'stake' ? (parsed > 0n ? fmt(parsed) : '0') : mode === 'unstake' ? (parsed > 0n ? fmt(parsed) : '0') : fmt(earned);
  const receiveSymbol = mode === 'claim' ? REWARD_SYMBOL : stakeSymbol;

  const switchArrowLabel = mode === 'stake' ? '↓' : '↑';

  return (
    <div className="w-full max-w-md mx-auto card-glow rounded-3xl p-5 animate-fade-in">

      {/* ── Tab row + Settings gear ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 rounded-xl bg-midnight/60 border border-white/5 p-1">
          {(['stake', 'unstake', 'claim'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => { setMode(m); setAmount(''); reset(); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition ${
                mode === m
                  ? 'bg-indigo text-white shadow-lg shadow-indigo/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={`p-2 rounded-xl transition ${
              showSettings ? 'text-aurora bg-aurora/10' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
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

      {mode === 'claim' ? (
        /* ── Claim mode: single reward panel ── */
        <div className="rounded-2xl bg-midnight/60 border border-indigo/10 p-4 mb-3">
          <div className="text-xs text-slate-500 mb-2">Claimable rewards</div>
          <div className="flex items-center justify-between">
            <span className="text-4xl font-bold text-aurora">{fmt(totalClaimable)}</span>
            <TokenBadge symbol={REWARD_SYMBOL} />
          </div>
          {/* Per-vault breakdown so the combined total is explainable. */}
          {claimables.some((c) => c.earned > 0n) && (
            <div className="mt-2 space-y-0.5 text-xs text-slate-600">
              {claimables
                .filter((c) => c.earned > 0n)
                .map((c) => (
                  <div key={c.vault}>
                    {fmt(c.earned)} {REWARD_SYMBOL} from staked {c.symbol}
                  </div>
                ))}
            </div>
          )}
        </div>
      ) : (
        /* ── Stake / Unstake: dual panel ── */
        <div className="flex flex-col gap-1 mb-3">
          {/* Top panel: input */}
          <div className="rounded-2xl bg-midnight/60 border border-indigo/10 p-4">
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span>{mode === 'stake' ? 'You stake' : 'You unstake'}</span>
              <span>
                Balance: {fmt(available)}{' '}
                {address && available !== undefined && available > 0n && (
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
                onChange={(e) => { setAmount(e.target.value.replace(/[^0-9.]/g, '')); reset(); }}
                className="w-full bg-transparent text-4xl font-bold outline-none placeholder:text-slate-600"
              />
              <StakeTokenSelector selected={selected} onChange={onSelectToken} />
            </div>
          </div>

          {/* Switch arrow */}
          <div className="flex justify-center -my-0.5 z-10">
            <div className="rounded-xl bg-midnight border border-indigo/20 p-2 text-slate-400 text-sm select-none">
              {switchArrowLabel}
            </div>
          </div>

          {/* Bottom panel: receive (read-only) */}
          <div className="rounded-2xl bg-midnight/40 border border-white/5 p-4">
            <div className="text-xs text-slate-500 mb-2">{receiveLabel}</div>
            <div className="flex items-center justify-between gap-3">
              <span className={`text-4xl font-bold ${receiveValue === '0' ? 'text-slate-600' : 'text-slate-100'}`}>
                {receiveValue}
              </span>
              <TokenBadge symbol={receiveSymbol} />
            </div>
            {mode === 'stake' && (
              <div className="mt-2 text-xs text-slate-600">
                Staked balance: {fmt(staked)} {stakeSymbol} · Rewards: {fmt(earned)} {REWARD_SYMBOL}
              </div>
            )}
            {mode === 'unstake' && (
              <div className="mt-2 text-xs text-slate-600">
                Wallet balance after: {fmt((walletBalance as bigint | undefined))} + {fmt(parsed)} {stakeSymbol}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Primary button ── */}
      <button
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="w-full rounded-2xl bg-gradient-to-r from-indigo to-indigo-bright py-4
                   font-semibold text-base transition hover:brightness-110 disabled:opacity-40
                   disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {busy && <Spinner />}
        {primaryLabel}
      </button>

      {/* ── Slippage info strip ── */}
      {mode !== 'claim' && parsed > 0n && (
        <div className="mt-2 flex items-center text-xs text-slate-600 px-1">
          <span>Max slippage: <span className="text-slate-500">{slippage}%</span></span>
        </div>
      )}

      {/* ── Tx feedback ── */}
      <TxStatus
        pending={isConfirming}
        pendingLabel={
          pendingAction.current === 'approve'
            ? 'Approving… staking follows automatically'
            : 'Confirming transaction…'
        }
        success={!isConfirming && isSuccess && !!txHash}
        successHref={txHash ? txUrl(txHash) : undefined}
        error={error ? error.message.split('\n')[0] : undefined}
      />
    </div>
  );
}
