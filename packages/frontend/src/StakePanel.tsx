/**
 * Core staking UI: shows the user's staked balance and live claimable rewards,
 * and drives the Approve → Stake → Withdraw → Claim flow.
 *
 * The ERC-20 approval step is handled explicitly (a common dApp gotcha): if the
 * vault's allowance is below the amount being staked, the user must Approve
 * first, then Stake. Each action surfaces pending / success / error state and a
 * tx-hash link to Sepolia Etherscan.
 */
import { useMemo, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits } from 'viem';
import { vaultAbi, erc20Abi } from './abi';
import { VAULT_ADDRESS, STAKING_TOKEN_ADDRESS } from './config';
import { fmt, txUrl } from './format';

export function StakePanel() {
  const { address } = useAccount();
  const [amount, setAmount] = useState('');

  // ── live on-chain reads ──
  const { data: staked } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const { data: earned } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'earned',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const { data: allowance } = useReadContract({
    address: STAKING_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, VAULT_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const parsedAmount = useMemo(() => {
    try {
      return amount ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  }, [amount]);

  const needsApproval = (allowance ?? 0n) < parsedAmount && parsedAmount > 0n;

  // ── writes ──
  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const busy = isPending || isConfirming;

  const onApprove = () =>
    writeContract({
      address: STAKING_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: 'approve',
      args: [VAULT_ADDRESS, parsedAmount],
    });

  const onStake = () =>
    writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'stake', args: [parsedAmount] });

  const onWithdraw = () =>
    writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'withdraw', args: [parsedAmount] });

  const onClaim = () =>
    writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'claimReward', args: [] });

  if (!address) {
    return <p className="text-slate-400">Connect your wallet to stake.</p>;
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Stat label="Your stake" value={`${fmt(staked)} eSTAKE`} />
        <Stat label="Claimable" value={`${fmt(earned)} eRWD`} accent />
      </div>

      <div className="space-y-3">
        <input
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            reset();
          }}
          className="w-full rounded-lg bg-slate-900/70 border border-slate-700 px-4 py-3
                     text-lg outline-none focus:border-aurora"
        />

        <div className="grid grid-cols-2 gap-3">
          {needsApproval ? (
            <Action label="Approve" onClick={onApprove} disabled={busy || parsedAmount === 0n} busy={busy} />
          ) : (
            <Action label="Stake" onClick={onStake} disabled={busy || parsedAmount === 0n} busy={busy} primary />
          )}
          <Action label="Withdraw" onClick={onWithdraw} disabled={busy || parsedAmount === 0n} busy={busy} />
        </div>

        <Action
          label={`Claim ${fmt(earned)} eRWD`}
          onClick={onClaim}
          disabled={busy || (earned ?? 0n) === 0n}
          busy={busy}
          accent
          full
        />
      </div>

      {/* tx feedback */}
      <div className="min-h-[1.5rem] text-sm">
        {isConfirming && <span className="text-aurora">Confirming…</span>}
        {isSuccess && txHash && (
          <span className="text-emerald-400">
            Success ·{' '}
            <a className="underline" href={txUrl(txHash)} target="_blank" rel="noreferrer">
              view tx
            </a>
          </span>
        )}
        {error && <span className="text-rose-400">{error.message.split('\n')[0]}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-900/50 border border-slate-800 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent ? 'text-aurora' : 'text-slate-100'}`}>
        {value}
      </div>
    </div>
  );
}

function Action({
  label,
  onClick,
  disabled,
  busy,
  primary,
  accent,
  full,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  primary?: boolean;
  accent?: boolean;
  full?: boolean;
}) {
  const base = 'rounded-lg px-4 py-3 font-medium transition disabled:opacity-40 disabled:cursor-not-allowed';
  const tone = accent
    ? 'bg-aurora text-midnight hover:brightness-110'
    : primary
      ? 'bg-indigo text-white hover:brightness-110'
      : 'bg-slate-800 text-slate-100 hover:bg-slate-700';
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${tone} ${full ? 'w-full' : ''}`}>
      {busy ? '…' : label}
    </button>
  );
}
