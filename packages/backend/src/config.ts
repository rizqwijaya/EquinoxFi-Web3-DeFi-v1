/**
 * Environment configuration for the indexer/API.
 *
 * Loaded from the repo-root `.env` (see `.env.example`). The vault addresses
 * and deploy block are filled in after deployment; until then the indexer
 * starts but logs that it is idle (no VAULT_A_ADDRESS / VAULT_B_ADDRESS).
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
  /** Stake vaults indexed for events/stats (eTKNA + eTKNB vaults). */
  vaultAddresses: Address[];
  deployBlock: bigint;
  databasePath: string;
  port: number;
  pollIntervalMs: number;
  /** True only when at least one real vault address is configured. */
  isConfigured: boolean;
  // ── DEX (AMM) ──
  /** Primary pair (eTKNA/eTKNB) — used for live reserves/price in /dex/stats. */
  pairAddress: Address | undefined;
  /** All pairs whose Swap events feed the swaps table (primary + ETH pools). */
  dexPairAddresses: Address[];
  dexDeployBlock: bigint;
  /** True only when a real pair address is configured. */
  isDexConfigured: boolean;
}

const rawPair = process.env.PAIR_ADDRESS;
const rpcUrl = process.env.RPC_URL ?? process.env.SEPOLIA_RPC_URL ?? '';

// Stake vaults: eTKNA vault (A) + eTKNB vault (B). Both reward eRWD and are
// indexed into the same events table (each event tagged with its vault).
const vaultAddresses = [process.env.VAULT_A_ADDRESS, process.env.VAULT_B_ADDRESS].filter(bool) as Address[];

// Native-ETH pools (WETH/token) — indexed alongside the primary pair so ETH
// swaps show up in swap count and activity.
const ethPairs = [process.env.PAIR_WETH_A, process.env.PAIR_WETH_B].filter(bool) as Address[];

export const appConfig: AppConfig = {
  rpcUrl,
  vaultAddresses,
  // Backfill start for the stake vaults; falls back to the legacy DEPLOY_BLOCK.
  deployBlock: BigInt(process.env.STAKE_DEPLOY_BLOCK ?? process.env.DEPLOY_BLOCK ?? '0'),
  databasePath: process.env.DATABASE_PATH ?? './data/equinoxfi.db',
  port: Number(process.env.PORT ?? 3001),
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS ?? 12_000),
  isConfigured: vaultAddresses.length > 0 && !!rpcUrl,
  pairAddress: bool(rawPair) ? (rawPair as Address) : undefined,
  dexPairAddresses: bool(rawPair) ? [rawPair as Address, ...ethPairs] : [],
  // Falls back to DEPLOY_BLOCK when a dedicated DEX deploy block isn't set.
  dexDeployBlock: BigInt(process.env.DEX_DEPLOY_BLOCK ?? process.env.DEPLOY_BLOCK ?? '0'),
  isDexConfigured: bool(rawPair) && !!rpcUrl,
};
