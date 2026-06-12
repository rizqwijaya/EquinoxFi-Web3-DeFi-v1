/**
 * Faucet page: mints free Sepolia test tokens (eTKNA / eTKNB) straight to the
 * connected wallet so any visitor can try the DEX + staking without already
 * holding tokens. MockERC20.mint is permissionless on testnet, so this is pure
 * frontend UX — no faucet contract, backend, or owner key involved.
 */
import { useEffect, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { parseUnits } from 'viem';
import { erc20Abi } from '../abi';
import { STAKE_VAULTS, isDexDeployed, type StakeVault } from '../config';
import { fmt, txUrl } from '../format';
import { Spinner, TxStatus } from '../components/ui';

/** Mint sizes offered as one-click chips (whole tokens). */
const PRESETS = ['100', '1000', '10000'] as const;

function FaucetCard({ t }: { t: StakeVault }) {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [amount, setAmount] = useState<string>('1000');

  const { data: balance, refetch } = useReadContract({
    address: t.token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8_000 },
  });

  const { writeContract, data: txHash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const busy = isPending || isConfirming;

  // Show the topped-up balance as soon as the mint confirms.
  useEffect(() => {
    if (isSuccess) refetch();
  }, [isSuccess, refetch]);

  const onMint = () => {
    if (!address) {
      openConnectModal?.();
      return;
    }
    reset();
    writeContract({
      address: t.token,
      abi: erc20Abi,
      functionName: 'mint',
      args: [address, parseUnits(amount, 18)],
    });
  };

  return (
    <div className="card-glow rounded-3xl p-5 animate-fade-in">
      {/* Token identity */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${t.grad} ring-1 ring-white/20 text-sm font-bold text-white shrink-0`}
        >
          {t.badge}
        </span>
        <div className="min-w-0">
          <div className="text-lg font-bold text-slate-100">{t.symbol}</div>
          <div className="text-xs text-slate-500 truncate">{t.name}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-500">Wallet balance</div>
          <div className="text-sm font-semibold text-slate-200">
            {address ? fmt(balance as bigint | undefined) : '-'}
          </div>
        </div>
      </div>

      {/* Amount chips */}
      <div className="mt-4 flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setAmount(p); reset(); }}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
              amount === p
                ? 'border-indigo-bright/50 bg-indigo/20 text-white shadow-lg shadow-indigo/20'
                : 'border-white/10 bg-midnight/60 text-slate-400 hover:border-white/20 hover:text-slate-200'
            }`}
          >
            {Number(p).toLocaleString()}
          </button>
        ))}
      </div>

      {/* Mint button */}
      <button
        onClick={onMint}
        disabled={busy || !isDexDeployed}
        className="mt-3 w-full rounded-2xl bg-gradient-to-r from-indigo to-indigo-bright py-3.5
                   font-semibold text-base transition hover:brightness-110 disabled:opacity-40
                   disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {busy && <Spinner />}
        {!address
          ? 'Connect wallet'
          : busy
          ? 'Minting…'
          : `Mint ${Number(amount).toLocaleString()} ${t.symbol}`}
      </button>

      <TxStatus
        pending={isConfirming}
        pendingLabel={`Minting ${t.symbol}…`}
        success={!isConfirming && isSuccess && !!txHash}
        successHref={txHash ? txUrl(txHash) : undefined}
        error={error ? error.message.split('\n')[0] : undefined}
      />
    </div>
  );
}

export function FaucetPage() {
  return (
    <div className="pt-10 sm:pt-14 animate-fade-in">
      <div className="mx-auto max-w-2xl text-center mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-100">
          Testnet <span className="text-aurora">faucet</span>
        </h1>
        <p className="mt-2 text-slate-400">
          Mint free eTKNA / eTKNB on Sepolia, then swap, pool, and stake them. No real funds needed.
        </p>
      </div>

      <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
        {STAKE_VAULTS.map((t) => (
          <FaucetCard key={t.token} t={t} />
        ))}
      </div>

      {/* Gas still costs Sepolia ETH — point users at an ETH faucet too. */}
      <p className="mx-auto mt-6 max-w-3xl text-center text-xs text-slate-600">
        Minting is a transaction, so your wallet needs a little Sepolia ETH for gas. Grab some from the{' '}
        <a
          href="https://cloud.google.com/application/web3/faucet/ethereum/sepolia"
          target="_blank"
          rel="noreferrer"
          className="text-aurora hover:underline"
        >
          Google Cloud Sepolia faucet
        </a>
        .
      </p>
    </div>
  );
}
