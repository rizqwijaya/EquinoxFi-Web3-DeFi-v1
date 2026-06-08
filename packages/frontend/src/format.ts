/** Small display helpers for token amounts and Etherscan links. */
import { formatUnits } from 'viem';

/** Formats an 18-decimal base-unit bigint to a short human string. */
export function fmt(value: bigint | undefined, decimals = 18, maxFrac = 4): string {
  if (value === undefined) return '-';
  const s = formatUnits(value, decimals);
  const [whole, frac = ''] = s.split('.');
  return frac ? `${whole}.${frac.slice(0, maxFrac)}` : whole;
}

/** Sepolia Etherscan tx link. */
export function txUrl(hash: string): string {
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

/** Sepolia Etherscan address link. */
export function addressUrl(address: string): string {
  return `https://sepolia.etherscan.io/address/${address}`;
}
