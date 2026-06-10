/** Shared data hooks: stats, per-user vault reads, and tx history from the API. */
import { useQuery } from '@tanstack/react-query';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { BACKEND_URL, STAKE_VAULTS, PAIR_ADDRESS, ROUTER_ADDRESS } from './config';
import { vaultAbi, pairAbi, routerAbi } from './abi';
import type { Address } from 'viem';

export interface PoolStats {
  totalStaked: string;
  totalStakers: number;
  rewardRate: string;
  totalRewardsPaid: string;
}

export interface HistoryEvent {
  kind: 'Staked' | 'Withdrawn' | 'RewardPaid';
  amount: string;
  blockNumber: number;
  txHash: string;
}

/** Pool-level stats from the backend /stats endpoint. */
export function useStats() {
  return useQuery<PoolStats>({
    queryKey: ['stats'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/stats`);
      if (!res.ok) throw new Error(`stats ${res.status}`);
      return res.json() as Promise<PoolStats>;
    },
    refetchInterval: 15_000,
    retry: false,
  });
}

/** Recent protocol-wide activity for the analytics feed. */
export function useActivity() {
  return useQuery<{ events: HistoryEvent[] }>({
    queryKey: ['activity'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/activity`);
      if (!res.ok) throw new Error(`activity ${res.status}`);
      return res.json() as Promise<{ events: HistoryEvent[] }>;
    },
    refetchInterval: 20_000,
    retry: false,
  });
}

/** Connected user's transaction history from the backend. */
export function useHistory() {
  const { address } = useAccount();
  return useQuery<{ events: HistoryEvent[] }>({
    queryKey: ['history', address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/stakers/${address}/history`);
      if (!res.ok) throw new Error(`history ${res.status}`);
      return res.json() as Promise<{ events: HistoryEvent[] }>;
    },
    // Snappy poll so a fresh stake/withdraw/claim shows in the activity feed
    // within seconds (backend SQLite read — cheap), no manual refresh needed.
    refetchInterval: 4_000,
    retry: false,
  });
}

/** Live per-user reads for one vault: staked balance and claimable rewards. */
export function useVaultPosition(vault: Address) {
  const { address } = useAccount();
  const enabled = !!address;

  const { data: staked } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 8_000 },
  });

  const { data: earned } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: 'earned',
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 5_000 },
  });

  return { staked: staked as bigint | undefined, earned: earned as bigint | undefined };
}

/**
 * Per-vault claimable eRWD rewards plus their total. The reward token is eRWD
 * for every vault, so the Claim tab shows one combined figure and claims from
 * each vault that has a positive balance.
 */
export function useClaimableRewards() {
  const { address } = useAccount();
  const { data } = useReadContracts({
    contracts: STAKE_VAULTS.map((v) => ({
      address: v.vault,
      abi: vaultAbi,
      functionName: 'earned' as const,
      args: address ? [address] : undefined,
    })),
    query: { enabled: !!address, refetchInterval: 5_000 },
  });

  const perVault = STAKE_VAULTS.map((v, i) => ({
    vault: v.vault,
    symbol: v.symbol,
    earned: data?.[i]?.status === 'success' ? (data[i].result as bigint) : 0n,
  }));
  const total = perVault.reduce((acc, p) => acc + p.earned, 0n);
  return { perVault, total };
}

/**
 * Aggregated position across every stake vault: summed staked principal and
 * summed claimable eRWD rewards. Used by the Portfolio overview, which shows a
 * single staked/rewards figure rather than a per-vault breakdown.
 */
export function useTotalStakePosition() {
  const { address } = useAccount();
  const enabled = !!address;

  const { data } = useReadContracts({
    contracts: STAKE_VAULTS.flatMap((v) => [
      { address: v.vault, abi: vaultAbi, functionName: 'balanceOf' as const, args: address ? [address] : undefined },
      { address: v.vault, abi: vaultAbi, functionName: 'earned' as const, args: address ? [address] : undefined },
    ]),
    query: { enabled, refetchInterval: 8_000 },
  });

  // Pairs of [balanceOf, earned] per vault; sum each across vaults.
  const sumAt = (offset: number): bigint | undefined => {
    if (!data) return undefined;
    let total = 0n;
    for (let i = offset; i < data.length; i += 2) {
      if (data[i]?.status === 'success') total += data[i].result as bigint;
    }
    return total;
  };

  return { staked: sumAt(0), earned: sumAt(1) };
}

// ── DEX (AMM) hooks ──────────────────────────────────────────────────────────

export interface DexStats {
  token0: string;
  token1: string;
  reserve0: string;
  reserve1: string;
  price0In1: string;
  swapCount: number;
  volume0In: string;
  volume1In: string;
}

export interface SwapEvent {
  pair: string;
  sender: string;
  recipient: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
  blockNumber: number;
  txHash: string;
}

/** Live pair reserves and token ordering, read straight from the pair. */
export function useReserves() {
  const { data: reserves } = useReadContract({
    address: PAIR_ADDRESS,
    abi: pairAbi,
    functionName: 'getReserves',
    query: { refetchInterval: 8_000 },
  });
  const { data: token0 } = useReadContract({
    address: PAIR_ADDRESS,
    abi: pairAbi,
    functionName: 'token0',
  });
  const r = reserves as readonly [bigint, bigint] | undefined;
  return {
    reserve0: r ? r[0] : undefined,
    reserve1: r ? r[1] : undefined,
    token0: token0 as Address | undefined,
  };
}

/**
 * Live output quote for an exact-input swap along `path`, via the router's
 * `getAmountsOut`. Disabled (no read) when the amount is zero.
 */
export function useQuote(amountIn: bigint, path: readonly Address[]) {
  const { data } = useReadContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: 'getAmountsOut',
    args: [amountIn, path as Address[]],
    query: { enabled: amountIn > 0n && path.length >= 2, refetchInterval: 10_000 },
  });
  const amounts = data as readonly bigint[] | undefined;
  return amounts ? amounts[amounts.length - 1] : undefined;
}

/** Pool-level DEX stats (reserves, price, volume) from the backend. */
export function useDexStats() {
  return useQuery<DexStats>({
    queryKey: ['dex-stats'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/dex/stats`);
      if (!res.ok) throw new Error(`dex stats ${res.status}`);
      return res.json() as Promise<DexStats>;
    },
    refetchInterval: 15_000,
    retry: false,
  });
}

/** Recent protocol-wide swaps for the DEX activity feed. */
export function useDexActivity() {
  return useQuery<{ swaps: SwapEvent[] }>({
    queryKey: ['dex-activity'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/dex/activity`);
      if (!res.ok) throw new Error(`dex activity ${res.status}`);
      return res.json() as Promise<{ swaps: SwapEvent[] }>;
    },
    refetchInterval: 20_000,
    retry: false,
  });
}

/** Connected user's swap history from the backend. */
export function useSwapHistory() {
  const { address } = useAccount();
  return useQuery<{ swaps: SwapEvent[] }>({
    queryKey: ['swap-history', address],
    enabled: !!address,
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/dex/${address}/history`);
      if (!res.ok) throw new Error(`swap history ${res.status}`);
      return res.json() as Promise<{ swaps: SwapEvent[] }>;
    },
    // Snappy poll so a fresh swap surfaces in the activity feed without a refresh.
    refetchInterval: 4_000,
    retry: false,
  });
}
