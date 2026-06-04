/** Fetches pool TVL/stats from the backend /stats endpoint via react-query. */
import { useQuery } from '@tanstack/react-query';
import { BACKEND_URL } from './config';

export interface PoolStats {
  totalStaked: string;
  totalStakers: number;
  rewardRate: string;
  totalRewardsPaid: string;
}

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
