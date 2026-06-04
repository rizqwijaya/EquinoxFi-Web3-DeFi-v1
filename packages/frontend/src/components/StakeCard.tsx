import { useMemo, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { parseUnits } from 'viem';
import { vaultAbi, erc20Abi } from '../abi';
import { VAULT_ADDRESS, STAKING_TOKEN_ADDRESS } from '../config';
import { fmt, txUrl } from '../format';
import { useVaultPosition } from '../hooks';
import { Spinner } from './ui';
import { SettingsPopup, GearIcon } from './SettingsPopup';

type Mode = 'stake' | 'unstake' | 'claim';

// ── Token badge ───────────────────────────────────────────────────────────────
function TokenBadge({ symbol }: { symbol: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-midnight-light border border-white/8 px-3 py-1.5 shrink-0">
      <span className="text-aurora text-sm">◇</span>
      <span className="font-semibold text-sm">{symbol}</span>
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
  const [deadline, setDeadline] = useState('30');

  const { staked, earned } = useVaultPosition();

  const { data: walletBalance } = useReadContract({
    address: STAKING_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const { data: allowance } = useReadContract({
    address: STAKING_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
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

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isConfirming;

  const setMax = () => available !== undefined && setAmount(fmt(available, 18, 18));

  const onPrimary = () => {
    if (mode === 'claim') {
      writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'claimReward', args: [] });
      return;
    }
    if (mode === 'stake') {
      if (needsApproval) {
        writeContract({ address: STAKING_TOKEN_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [VAULT_ADDRESS, parsed] });
      } else {
        writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'stake', args: [parsed] });
      }
    } else {
      writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'withdraw', args: [parsed] });
    }
  };

  const primaryLabel = !address
    ? 'Connect wallet'
    : mode === 'claim'
    ? (earned ?? 0n) === 0n
      ? 'No rewards yet'
      : `Claim ${fmt(earned)} eRWD`
    : parsed === 0n
    ? 'Enter an amount'
    : overBalance
    ? 'Insufficient balance'
    : mode === 'stake'
    ? needsApproval
      ? 'Approve eSTAKE'
      : 'Stake'
    : 'Unstake';

  const primaryDisabled =
    !address ||
    busy ||
    (mode === 'claim' ? (earned ?? 0n) === 0n : parsed === 0n || overBalance);

  // What the "receive" panel shows
  const receiveLabel = mode === 'stake' ? 'You receive (staked)' : mode === 'unstake' ? 'You receive (wallet)' : 'You receive';
  const receiveValue = mode === 'stake' ? (parsed > 0n ? fmt(parsed) : '0') : mode === 'unstake' ? (parsed > 0n ? fmt(parsed) : '0') : fmt(earned);
  const receiveSymbol = mode === 'claim' ? 'eRWD' : mode === 'stake' ? 'eSTAKE' : 'eSTAKE';

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
              deadline={deadline}
              setDeadline={setDeadline}
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
            <span className="text-4xl font-bold text-aurora">{fmt(earned)}</span>
            <TokenBadge symbol="eRWD" />
          </div>
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
              <TokenBadge symbol="eSTAKE" />
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
            <div className="flex items-center gap-3">
              <span className={`text-4xl font-bold ${receiveValue === '0' ? 'text-slate-600' : 'text-slate-100'}`}>
                {receiveValue}
              </span>
              <TokenBadge symbol={receiveSymbol} />
            </div>
            {mode === 'stake' && (
              <div className="mt-2 text-xs text-slate-600">
                Staked balance: {fmt(staked)} · Rewards: {fmt(earned)} eRWD
              </div>
            )}
            {mode === 'unstake' && (
              <div className="mt-2 text-xs text-slate-600">
                Wallet balance after: {fmt((walletBalance as bigint | undefined))} + {fmt(parsed)} eSTAKE
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

      {/* ── Slippage/deadline info strip ── */}
      {mode !== 'claim' && parsed > 0n && (
        <div className="mt-2 flex items-center justify-between text-xs text-slate-600 px-1">
          <span>Max slippage: <span className="text-slate-500">{slippage}%</span></span>
          <span>Deadline: <span className="text-slate-500">{deadline} min</span></span>
        </div>
      )}

      {/* ── Tx feedback ── */}
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
