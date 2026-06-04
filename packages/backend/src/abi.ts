/**
 * Minimal EquinoxVault ABI — only the fragments the indexer needs:
 * the three indexed events to backfill, plus a few view functions used to
 * derive live pool stats. Kept hand-written and small so the backend has no
 * build-time dependency on the Foundry artifacts.
 */
export const equinoxVaultAbi = [
  {
    type: 'event',
    name: 'Staked',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'RewardPaid',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'reward', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'rewardRate',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;
