/** Shared data hooks: stats, per-user vault reads, and tx history from the API. */
import { useQuery } from '@tanstack/react-query';
import { useAccount, useReadContract } from 'wagmi';
import { BACKEND_URL, VAULT_ADDRESS, PAIR_ADDRESS, ROUTER_ADDRESS } from './config';
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
    refetchInterval: 15_000,
    retry: false,
  });
}

/** Live per-user vault reads: staked balance and claimable rewards. */
export function useVaultPosition() {
  const { address } = useAccount();
  const enabled = !!address;

  const { data: staked } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 8_000 },
  });

  const { data: earned } = useReadContract({
    address: VAULT_ADDRESS,
    abi: vaultAbi,
    functionName: 'earned',
    args: address ? [address] : undefined,
    query: { enabled, refetchInterval: 5_000 },
  });

  return { staked: staked as bigint | undefined, earned: earned as bigint | undefined };
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
    refetchInterval: 15_000,
    retry: false,
  });
}
