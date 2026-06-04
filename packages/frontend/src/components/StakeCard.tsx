/**
 * Swap-style staking card (Uniswap-inspired layout, original styling).
 *
 * A single token-amount input with a MAX shortcut and a Stake/Unstake toggle.
 * The ERC-20 approval step is handled explicitly: when the vault allowance is
 * below the amount being staked, the primary button becomes "Approve" first.
 * Each action surfaces pending / confirming / success / error state with a
 * Sepolia Etherscan tx link.
 */
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

type Mode = 'stake' | 'unstake';

export function StakeCard() {
  const { address } = useAccount();
  const [mode, setMode] = useState<Mode>('stake');
  const [amount, setAmount] = useState('');

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

  // Balance shown above the input depends on direction.
  const available = mode === 'stake' ? (walletBalance as bigint | undefined) : staked;
  const needsApproval = mode === 'stake' && (allowance ?? 0n) < parsed && parsed > 0n;
  const overBalance = parsed > (available ?? 0n);

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isConfirming;

  const setMax = () => available !== undefined && setAmount(fmt(available, 18, 18));

  const onPrimary = () => {
    if (mode === 'stake') {
      if (needsApproval) {
        writeContract({
          address: STAKING_TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: 'approve',
          args: [VAULT_ADDRESS, parsed],
        });
      } else {
        writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'stake', args: [parsed] });
      }
    } else {
      writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'withdraw', args: [parsed] });
    }
  };

  const onClaim = () =>
    writeContract({ address: VAULT_ADDRESS, abi: vaultAbi, functionName: 'claimReward', args: [] });

  const primaryLabel = !address
    ? 'Connect wallet'
    : parsed === 0n
      ? 'Enter an amount'
      : overBalance
        ? 'Insufficient balance'
        : mode === 'stake'
          ? needsApproval
            ? 'Approve eSTAKE'
            : 'Stake'
          : 'Unstake';

  const primaryDisabled = !address || parsed === 0n || overBalance || busy;

  return (
    <div className="w-full max-w-md mx-auto card-glow rounded-3xl p-5 animate-fade-in">
      {/* mode toggle */}
      <div className="flex gap-1 rounded-xl bg-midnight/60 p-1 mb-4">
        {(['stake', 'unstake'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setAmount('');
              reset();
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition ${
              mode === m ? 'bg-indigo text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* amount input */}
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
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ''));
              reset();
            }}
            className="w-full bg-transparent text-3xl font-semibold outline-none placeholder:text-slate-600"
          />
          <div className="flex items-center gap-2 rounded-full bg-midnight-light px-3 py-1.5 shrink-0">
            <span className="text-aurora">◇</span>
            <span className="font-semibold text-sm">eSTAKE</span>
          </div>
        </div>
      </div>

      {/* primary action */}
      <button
        onClick={onPrimary}
        disabled={primaryDisabled}
        className="mt-3 w-full rounded-2xl bg-gradient-to-r from-indigo to-indigo-bright py-3.5
                   font-semibold transition hover:brightness-110 disabled:opacity-40
                   disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {busy && <Spinner />}
        {primaryLabel}
      </button>

      {/* claim row */}
      <div className="mt-4 flex items-center justify-between rounded-2xl bg-midnight/40 px-4 py-3">
        <div>
          <div className="text-xs text-slate-500">Claimable rewards</div>
          <div className="text-lg font-bold text-aurora">{fmt(earned)} eRWD</div>
        </div>
        <button
          onClick={onClaim}
          disabled={busy || (earned ?? 0n) === 0n}
          className="rounded-xl bg-aurora text-midnight px-4 py-2 text-sm font-semibold
                     hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Claim
        </button>
      </div>

      {/* tx feedback */}
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
