/**
 * Portfolio page: a connected user's at-a-glance position across EquinoxFi.
 *
 *   - Header: address + native Sepolia ETH balance;
 *   - Token balances: eSTAKE / eRWD / eTKNA / eTKNB wallet holdings;
 *   - Staking position: staked principal + live claimable rewards;
 *   - Activity: the user's stake/withdraw/claim events merged with swaps,
 *     newest first, from the backend.
 *
 * Replaces the old protocol-wide Analytics page (whose KPIs now live on the
 * landing page's stats panel).
 */
import { useMemo, useState } from 'react';
import { useAccount, useConnect, useReadContract, useBalance } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { sepolia } from 'wagmi/chains';
import type { Address } from 'viem';
import { erc20Abi } from '../abi';
import {
  STAKING_TOKEN_ADDRESS,
  REWARD_TOKEN_ADDRESS,
  TOKEN_A_ADDRESS,
  TOKEN_B_ADDRESS,
} from '../config';
import { fmt, txUrl } from '../format';
import { useVaultPosition, useHistory, useSwapHistory } from '../hooks';
import { Badge } from '../components/ui';

/** Live ERC-20 balance for the connected account. */
function useTokenBalance(token: Address, address?: Address) {
  const { data } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && token !== ('0x0000000000000000000000000000000000000000' as Address), refetchInterval: 10_000 },
  });
  return data as bigint | undefined;
}

/** One token-balance tile. */
function BalanceTile({ symbol, name, value, accent }: { symbol: string; name: string; value: bigint | undefined; accent?: boolean }) {
  return (
    <div className="card-glow rounded-2xl px-5 py-4">
      <div className="flex items-center gap-2">
        <span className="text-aurora">◇</span>
        <div>
          <div className="font-semibold text-slate-100 text-sm">{symbol}</div>
          <div className="text-xs text-slate-500">{name}</div>
        </div>
      </div>
      <div className={`mt-3 text-2xl font-bold ${accent ? 'text-aurora' : 'text-slate-100'}`}>
        {fmt(value)}
      </div>
    </div>
  );
}

/** Merged activity row shape (stake events + swaps) for the feed. */
type FeedRow =
  | { type: 'stake'; kind: 'Staked' | 'Withdrawn' | 'RewardPaid'; amount: string; blockNumber: number; txHash: string }
  | { type: 'swap'; blockNumber: number; txHash: string };

/** Short address with a copy-to-clipboard button + "Copied!" feedback. */
function CopyAddress({ address, short }: { address: string; short: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      title="Copy address"
      className={`group flex items-center gap-1.5 text-sm transition rounded-lg -ml-1 px-1.5 py-0.5 ${
        copied ? 'text-aurora' : 'text-slate-500 hover:text-aurora hover:bg-white/5'
      }`}
    >
      {short}
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" fill="none" viewBox="0 0 24 24">
          <rect x="9" y="9" width="11" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}

export function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();

  const { data: eth } = useBalance({ address, chainId: sepolia.id, query: { enabled: !!address } });
  const { staked, earned } = useVaultPosition();

  const eStake = useTokenBalance(STAKING_TOKEN_ADDRESS, address);
  const eRwd = useTokenBalance(REWARD_TOKEN_ADDRESS, address);
  const eTknA = useTokenBalance(TOKEN_A_ADDRESS, address);
  const eTknB = useTokenBalance(TOKEN_B_ADDRESS, address);

  const { data: stakeHist } = useHistory();
  const { data: swapHist } = useSwapHistory();

  const feed = useMemo<FeedRow[]>(() => {
    const rows: FeedRow[] = [];
    for (const e of stakeHist?.events ?? []) {
      rows.push({ type: 'stake', kind: e.kind, amount: e.amount, blockNumber: e.blockNumber, txHash: e.txHash });
    }
    for (const s of swapHist?.swaps ?? []) {
      rows.push({ type: 'swap', blockNumber: s.blockNumber, txHash: s.txHash });
    }
    return rows.sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 25);
  }, [stakeHist, swapHist]);

  if (!isConnected || !address) {
    return (
      <div className="animate-fade-in max-w-md mx-auto card-glow rounded-2xl px-6 py-12 mt-16 text-center">
        <div className="text-aurora text-3xl mb-3">◇</div>
        <p className="text-slate-300 font-semibold">Connect your wallet</p>
        <p className="mt-1 text-sm text-slate-500">View your balances, staking position, and activity.</p>
        <button
          onClick={() => connect({ connector: injected() })}
          className="mt-5 rounded-full bg-gradient-to-r from-indigo to-indigo-bright px-6 py-2.5 text-sm font-semibold transition hover:brightness-110 shadow-lg shadow-indigo/30"
        >
          Connect
        </button>
      </div>
    );
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const ethStr = eth ? `${parseFloat(eth.formatted).toFixed(4)} ${eth.symbol}` : '…';

  return (
    <div className="animate-fade-in max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mt-8 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-gradient-to-br from-indigo to-aurora flex items-center justify-center text-lg">◇</div>
          <div>
            <h2 className="text-2xl font-bold leading-tight">Portfolio</h2>
            <CopyAddress address={address} short={short} />
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-500">Wallet ETH</div>
          <div className="text-lg font-bold text-slate-100">{ethStr}</div>
        </div>
      </div>

      {/* Staking position */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="card-glow rounded-2xl px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Staked</div>
          <div className="mt-1.5 text-2xl font-bold text-slate-100">{fmt(staked)}</div>
          <div className="mt-1 text-xs text-slate-500">eSTAKE</div>
        </div>
        <div className="card-glow rounded-2xl px-5 py-4">
          <div className="text-xs uppercase tracking-wider text-slate-500">Claimable rewards</div>
          <div className="mt-1.5 text-2xl font-bold text-aurora">{fmt(earned)}</div>
          <div className="mt-1 text-xs text-slate-500">eRWD</div>
        </div>
      </div>

      {/* Token balances */}
      <h3 className="text-sm font-semibold text-slate-300 mt-8 mb-3">Token balances</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BalanceTile symbol="eSTAKE" name="Staking token" value={eStake} accent />
        <BalanceTile symbol="eRWD" name="Reward token" value={eRwd} />
        <BalanceTile symbol="eTKNA" name="Equinox Token A" value={eTknA} />
        <BalanceTile symbol="eTKNB" name="Equinox Token B" value={eTknB} />
      </div>

      {/* Activity */}
      <h3 className="text-sm font-semibold text-slate-300 mt-8 mb-3">Recent activity</h3>
      <div className="card-glow rounded-2xl overflow-hidden">
        {feed.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-600 text-sm">
            No activity yet. Swap or stake to get started.
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {feed.map((row, i) => (
              <a
                key={`${row.txHash}-${i}`}
                href={txUrl(row.txHash)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-5 py-3.5 text-sm hover:bg-white/[0.02] transition"
              >
                {row.type === 'stake' ? (
                  <Badge kind={row.kind} />
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-indigo/20 text-indigo-bright">Swap</span>
                )}
                <span className="text-slate-300">
                  {row.type === 'stake' ? `${fmt(BigInt(row.amount))} eSTAKE` : 'Token swap'}
                </span>
                <span className="ml-auto text-xs text-slate-600">Block {row.blockNumber}</span>
                <svg className="w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24">
                  <path d="M7 17L17 7m0 0H8m9 0v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
