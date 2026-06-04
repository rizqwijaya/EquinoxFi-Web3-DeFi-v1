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

// Conservative range per getLogs call (many free RPCs cap at ~10k blocks).
const CHUNK = 9_000n;

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
