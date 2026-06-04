/**
 * Environment configuration for the indexer/API.
 *
 * Loaded from the repo-root `.env` (see `.env.example`). The contract address
 * and deploy block are filled in after the Phase 4 Sepolia deployment; until
 * then the indexer starts but logs that it is idle (no VAULT_ADDRESS).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import type { Address } from 'viem';

// Load the repo-root .env regardless of cwd.
loadEnv({ path: resolve(process.cwd(), '../../.env') });
// Also try a local .env (e.g. packages/backend/.env) as a fallback.
loadEnv();

const ZERO = '0x0000000000000000000000000000000000000000';

function bool(addr: string | undefined): addr is string {
  return !!addr && addr.toLowerCase() !== ZERO;
}

export interface AppConfig {
  rpcUrl: string;
  vaultAddress: Address | undefined;
  deployBlock: bigint;
  databasePath: string;
  port: number;
  pollIntervalMs: number;
  /** True only when a real vault address is configured. */
  isConfigured: boolean;
  // ── DEX (AMM) ──
  pairAddress: Address | undefined;
  dexDeployBlock: bigint;
  /** True only when a real pair address is configured. */
  isDexConfigured: boolean;
}

const rawVault = process.env.VAULT_ADDRESS;
const rawPair = process.env.PAIR_ADDRESS;
const rpcUrl = process.env.RPC_URL ?? process.env.SEPOLIA_RPC_URL ?? '';

export const appConfig: AppConfig = {
  rpcUrl,
  vaultAddress: bool(rawVault) ? (rawVault as Address) : undefined,
  deployBlock: BigInt(process.env.DEPLOY_BLOCK ?? '0'),
  databasePath: process.env.DATABASE_PATH ?? './data/equinoxfi.db',
  port: Number(process.env.PORT ?? 3001),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 12_000),
  isConfigured: bool(rawVault) && !!rpcUrl,
  pairAddress: bool(rawPair) ? (rawPair as Address) : undefined,
  // Falls back to DEPLOY_BLOCK when a dedicated DEX deploy block isn't set.
  dexDeployBlock: BigInt(process.env.DEX_DEPLOY_BLOCK ?? process.env.DEPLOY_BLOCK ?? '0'),
  isDexConfigured: bool(rawPair) && !!rpcUrl,
};
