/**
 * Frontend configuration: wagmi chains/connectors and the contract addresses
 * read from Vite env (`VITE_*`). Addresses are filled in after the Phase 4
 * Sepolia deployment; the UI degrades gracefully (read-only / disabled
 * actions) while they are still the zero address.
 */
import { http, createConfig } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';
import type { Address } from 'viem';

const ZERO = '0x0000000000000000000000000000000000000000' as const;

function addr(value: string | undefined): Address {
  return (value && value.length === 42 ? value : ZERO) as Address;
}

export const VAULT_ADDRESS = addr(import.meta.env.VITE_VAULT_ADDRESS);
export const STAKING_TOKEN_ADDRESS = addr(import.meta.env.VITE_STAKING_TOKEN_ADDRESS);
export const REWARD_TOKEN_ADDRESS = addr(import.meta.env.VITE_REWARD_TOKEN_ADDRESS);
export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3001';

export const isDeployed = VAULT_ADDRESS !== ZERO;

// ── DEX (AMM) ──
export const FACTORY_ADDRESS = addr(import.meta.env.VITE_FACTORY_ADDRESS);
export const ROUTER_ADDRESS = addr(import.meta.env.VITE_ROUTER_ADDRESS);
export const PAIR_ADDRESS = addr(import.meta.env.VITE_PAIR_ADDRESS);
export const TOKEN_A_ADDRESS = addr(import.meta.env.VITE_TOKEN_A_ADDRESS);
export const TOKEN_B_ADDRESS = addr(import.meta.env.VITE_TOKEN_B_ADDRESS);
/** Wrapped ETH: native-ETH swaps route through this WETH/token pool. */
export const WETH_ADDRESS = addr(import.meta.env.VITE_WETH_ADDRESS);
/** Native-ETH pool pairs, for labelling swap activity per pool. */
export const PAIR_WETH_A_ADDRESS = addr(import.meta.env.VITE_PAIR_WETH_A_ADDRESS);
export const PAIR_WETH_B_ADDRESS = addr(import.meta.env.VITE_PAIR_WETH_B_ADDRESS);

export const isDexDeployed = ROUTER_ADDRESS !== ZERO && PAIR_ADDRESS !== ZERO;

/** DEX token metadata, keyed by address (lowercased), for symbol display. */
export const TOKENS: Record<string, { symbol: string }> = {
  [TOKEN_A_ADDRESS.toLowerCase()]: { symbol: 'eTKNA' },
  [TOKEN_B_ADDRESS.toLowerCase()]: { symbol: 'eTKNB' },
};

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(),
  },
});
