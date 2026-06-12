/**
 * Faucet page: mints free Sepolia test tokens (eTKNA / eTKNB) straight to the
 * connected wallet so any visitor can try the DEX + staking without already
 * holding tokens. MockERC20.mint is permissionless on testnet, so this is pure
 * frontend UX — no faucet contract, backend, or owner key involved.
 *
 * Visual language mirrors the homepage hero / Portfolio connect wall: floating
 * blurred token art + glow blobs behind, staggered pop-in cards, ticking
 * balances, and a sheen sweep on the claim buttons.
 */
import { useEffect, useState } from 'react';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';
import { parseUnits } from 'viem';
import { erc20Abi } from '../abi';
import { STAKE_VAULTS, isDexDeployed, type StakeVault } from '../config';
import { toNum, txUrl } from '../format';
import { AnimatedNumber, Spinner, TxStatus } from '../components/ui';
import { TokenBlobs } from '../components/TokenBlobs';

/** Mint sizes offered as one-click chips (whole tokens). */
const PRESETS = ['100', '1000', '10000'] as const;

function FaucetCard({ t, delay }: { t: StakeVault; delay: number }) {
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
    // Pinning chainId makes wagmi prompt a network switch if the wallet
    // drifted off Sepolia instead of sending a doomed transaction.
    writeContract({
      address: t.token,
      abi: erc20Abi,
      functionName: 'mint',
      args: [address, parseUnits(amount, 18)],
      chainId: sepolia.id,
    });
  };

  return (
    <div
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'backwards' }}
      className="group/card relative card-glow rounded-3xl p-5 animate-pop-in transition-all duration-300
                 hover:-translate-y-1 hover:border-indigo/40 hover:shadow-xl hover:shadow-indigo/20"
    >
      {/* Soft per-card glow that brightens on hover. */}
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-10 -right-10 h-36 w-36 rounded-full bg-gradient-to-br ${t.grad}
                    opacity-[0.07] blur-2xl transition-opacity duration-500 group-hover/card:opacity-20`}
      />

      {/* Token identity */}
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${t.grad} opacity-50 blur-lg animate-pulse-slow`} />
          <span
            className={`relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${t.grad}
                        ring-1 ring-white/25 text-sm font-bold text-white shadow-lg animate-float`}
            style={{ animationDelay: `${delay * 3}ms` }}
          >
            {t.badge}
          </span>
        </div>
        <div className="min-w-0">
          <div className="text-lg font-bold text-slate-100">{t.symbol}</div>
          <div className="text-xs text-slate-500 truncate">{t.name}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-xs text-slate-500">Wallet balance</div>
          <div className="text-base font-bold tabular-nums text-slate-100">
            {address ? (
              <AnimatedNumber value={toNum(balance as bigint | undefined)} decimals={2} />
            ) : (
              '-'
            )}
          </div>
        </div>
      </div>

      {/* Amount chips */}
      <div className="mt-5 flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setAmount(p); reset(); }}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition-all active:scale-95 ${
              amount === p
                ? 'border-indigo-bright/50 bg-indigo/20 text-white shadow-lg shadow-indigo/20 scale-[1.03]'
                : 'border-white/10 bg-midnight/60 text-slate-400 hover:border-white/25 hover:text-slate-200'
            }`}
          >
            {Number(p).toLocaleString()}
          </button>
        ))}
      </div>

      {/* Claim button with hover sheen sweep */}
      <button
        onClick={onMint}
        disabled={busy || !isDexDeployed}
        className="group/btn relative mt-3 w-full overflow-hidden rounded-2xl bg-gradient-to-r from-indigo to-indigo-bright py-3.5
                   font-semibold text-base transition hover:brightness-110 active:scale-[0.99] disabled:opacity-40
                   disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo/25"
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover/btn:translate-x-full" />
        {busy && <Spinner />}
        {!address ? (
          'Connect wallet'
        ) : busy ? (
          'Claiming…'
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24">
              <path
                d="M12 3c3.5 4.06 6 7.21 6 10.2A6.1 6.1 0 0 1 12 19a6.1 6.1 0 0 1-6-5.8C6 10.2 8.5 7.06 12 3Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            {`Claim ${Number(amount).toLocaleString()} ${t.symbol}`}
          </>
        )}
      </button>

      <TxStatus
        pending={isConfirming}
        pendingLabel={`Claiming ${t.symbol}…`}
        success={!isConfirming && isSuccess && !!txHash}
        successHref={txHash ? txUrl(txHash) : undefined}
        error={error ? error.message.split('\n')[0] : undefined}
      />
    </div>
  );
}

export function FaucetPage() {
  return (
    <div className="relative pt-10 sm:pt-14 animate-fade-in">
      {/* Ambient floating crypto coins + colored glow blobs, homepage-style. */}
      <TokenBlobs />
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute left-1/4 top-10 h-72 w-72 -translate-x-1/2 rounded-full bg-indigo/25 blur-[120px] animate-pulse-slow" />
        <div
          className="absolute right-1/4 top-1/3 h-72 w-72 translate-x-1/2 rounded-full bg-aurora/15 blur-[120px] animate-pulse-slow"
          style={{ animationDelay: '1.6s' }}
        />
      </div>

      <div className="relative z-10">
        {/* Hero */}
        <div className="mx-auto max-w-2xl text-center mb-10">
          {/* Glowing, floating faucet droplet mark. */}
          <div className="relative mx-auto mb-5 h-16 w-16 animate-pop-in">
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo to-aurora opacity-60 blur-xl animate-pulse-slow" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo to-aurora text-white shadow-lg shadow-indigo/40 ring-1 ring-white/20 animate-float">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24">
                <path
                  d="M12 3c3.5 4.06 6 7.21 6 10.2A6.1 6.1 0 0 1 12 19a6.1 6.1 0 0 1-6-5.8C6 10.2 8.5 7.06 12 3Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-aurora/30 bg-aurora/10 px-3 py-1 text-xs font-semibold text-aurora">
            <span className="h-1.5 w-1.5 rounded-full bg-aurora animate-pulse" />
            Sepolia Testnet · Free tokens
          </span>

          <h1 className="mt-3 text-3xl sm:text-5xl font-bold tracking-tight text-slate-100">
            Top up. <span className="bg-gradient-to-r from-indigo-bright to-aurora bg-clip-text text-transparent">Dive in.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-slate-400">
            Claim free eTKNA / eTKNB, then swap, pool, and stake them. No real funds needed.
          </p>
        </div>

        {/* Token cards */}
        <div className="mx-auto grid max-w-3xl gap-5 sm:grid-cols-2">
          {STAKE_VAULTS.map((t, i) => (
            <FaucetCard key={t.token} t={t} delay={i * 150} />
          ))}
        </div>

        {/* Gas still costs Sepolia ETH — point users at an ETH faucet too. */}
        <p className="mx-auto mt-8 max-w-3xl text-center text-xs text-slate-600">
          Claiming is a transaction, so your wallet needs a little Sepolia ETH for gas. Grab some from the{' '}
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
    </div>
  );
}
