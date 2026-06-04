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

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(),
  },
});
