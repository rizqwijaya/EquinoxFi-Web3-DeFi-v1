/** Shared data hooks: stats, per-user vault reads, and tx history from the API. */
import { useQuery } from '@tanstack/react-query';
import { useAccount, useReadContract } from 'wagmi';
import { BACKEND_URL, VAULT_ADDRESS } from './config';
import { vaultAbi } from './abi';

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
