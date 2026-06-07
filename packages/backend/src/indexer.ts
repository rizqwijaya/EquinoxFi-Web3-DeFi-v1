/**
 * Event indexer: backfill on startup, then poll for new blocks.
 *
 * Uses viem `getLogs` to read Staked / Withdrawn / RewardPaid from the vault,
 * writes them into SQLite, and tracks the last indexed block so restarts
 * resume instead of re-scanning from genesis. Reads are chunked to respect
 * RPC provider block-range limits.
 */
import { createPublicClient, http, parseAbiItem, type Address, type PublicClient } from 'viem';
import { sepolia } from 'viem/chains';
import type { AppConfig } from './config.js';
import type { Db, EventKind } from './db.js';

const EVENTS = {
  Staked: parseAbiItem('event Staked(address indexed user, uint256 amount)'),
  Withdrawn: parseAbiItem('event Withdrawn(address indexed user, uint256 amount)'),
  RewardPaid: parseAbiItem('event RewardPaid(address indexed user, uint256 reward)'),
} as const;

const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
);

// Number of blocks to advance per getLogs call. The scanned range is
// INCLUSIVE on both ends, so a value of N scans N+1 blocks per call. Alchemy's
// free tier caps eth_getLogs at 10 blocks inclusive, hence the default of 9.
// Set LOG_CHUNK to a larger value (e.g. 8999) on a paid/unthrottled RPC to
// backfill far faster.
const CHUNK = BigInt(process.env.LOG_CHUNK ?? '9');

// Delay (ms) between getLogs calls during backfill. A small default keeps the
// many small chunks needed on a 10-block-capped free RPC under its rate limit
// (HTTP 429). Set LOG_DELAY_MS=0 on a paid/unthrottled RPC.
const DELAY_MS = Number(process.env.LOG_DELAY_MS ?? '250');

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class Indexer {
  readonly client: PublicClient;
  private readonly vault: Address;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cfg: AppConfig,
    private readonly db: Db,
  ) {
    this.vault = cfg.vaultAddress as Address;
    this.client = createPublicClient({
      chain: sepolia,
      transport: http(cfg.rpcUrl),
    });
  }

  /** Backfill from the resume point (or deploy block) to chain head. */
  async backfill(): Promise<void> {
    const head = await this.client.getBlockNumber();
    const last = this.db.getLastIndexedBlock();
    let from = last !== null ? last + 1n : this.cfg.deployBlock;

    while (from <= head) {
      const to = from + CHUNK > head ? head : from + CHUNK;
      await this.indexRange(from, to);
      this.db.setLastIndexedBlock(to);
      from = to + 1n;
      if (from <= head && DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }

  /** Index a single [from, to] block range for all tracked events. */
  private async indexRange(from: bigint, to: bigint): Promise<void> {
    for (const [kind, event] of Object.entries(EVENTS) as [EventKind, (typeof EVENTS)[EventKind]][]) {
      const logs = await this.client.getLogs({
        address: this.vault,
        event,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const args = log.args as { user?: Address; amount?: bigint; reward?: bigint };
        this.db.insertEvent({
          kind,
          user: args.user ?? '0x0000000000000000000000000000000000000000',
          amount: args.amount ?? args.reward ?? 0n,
          blockNumber: log.blockNumber ?? 0n,
          logIndex: log.logIndex ?? 0,
          txHash: log.transactionHash ?? '0x',
        });
      }
    }
  }

  /** Start polling for new blocks at the configured interval. */
  startPolling(): void {
    this.timer = setInterval(() => {
      this.backfill().catch((err) => {
        // Transient RPC errors must not crash the process; next tick retries.
        console.error('[indexer] poll error:', err);
      });
    }, this.cfg.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

/**
 * DEX indexer: backfills + polls the pair's Swap events into the `swaps` table.
 * Mirrors {Indexer}'s resume/chunk strategy but tracks its own block cursor
 * (`last_dex_block`) so the vault and DEX indexers advance independently.
 */
export class DexIndexer {
  readonly client: PublicClient;
  private readonly pairs: Address[];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly cfg: AppConfig,
    private readonly db: Db,
  ) {
    // Primary pair + any native-ETH pools, so ETH swaps land in the same feed.
    this.pairs = cfg.dexPairAddresses;
    this.client = createPublicClient({ chain: sepolia, transport: http(cfg.rpcUrl) });
  }

  async backfill(): Promise<void> {
    const head = await this.client.getBlockNumber();
    const last = this.db.getLastDexBlock();
    let from = last !== null ? last + 1n : this.cfg.dexDeployBlock;

    while (from <= head) {
      const to = from + CHUNK > head ? head : from + CHUNK;
      await this.indexRange(from, to);
      this.db.setLastDexBlock(to);
      from = to + 1n;
      if (from <= head && DELAY_MS > 0) await sleep(DELAY_MS);
    }
  }

  private async indexRange(from: bigint, to: bigint): Promise<void> {
    const logs = await this.client.getLogs({
      address: this.pairs,
      event: SWAP_EVENT,
      fromBlock: from,
      toBlock: to,
    });
    for (const log of logs) {
      const args = log.args as {
        sender?: Address;
        to?: Address;
        amount0In?: bigint;
        amount1In?: bigint;
        amount0Out?: bigint;
        amount1Out?: bigint;
      };
      this.db.insertSwap({
        sender: args.sender ?? '0x0000000000000000000000000000000000000000',
        recipient: args.to ?? '0x0000000000000000000000000000000000000000',
        amount0In: args.amount0In ?? 0n,
        amount1In: args.amount1In ?? 0n,
        amount0Out: args.amount0Out ?? 0n,
        amount1Out: args.amount1Out ?? 0n,
        blockNumber: log.blockNumber ?? 0n,
        logIndex: log.logIndex ?? 0,
        txHash: log.transactionHash ?? '0x',
      });
    }
  }

  startPolling(): void {
    this.timer = setInterval(() => {
      this.backfill().catch((err) => {
        console.error('[dex-indexer] poll error:', err);
      });
    }, this.cfg.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
