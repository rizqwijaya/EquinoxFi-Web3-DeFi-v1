/**
 * SQLite cache layer.
 *
 * Uses Node's built-in `node:sqlite` (DatabaseSync) — no native compilation
 * step, which keeps the indexer install-clean on modern Node. The API mirrors
 * better-sqlite3's synchronous prepare/run/get/all closely.
 *
 * Why a cache at all (GENERAL.md Section 7): the EquinoxVault contract is the
 * source of truth, but the chain cannot cheaply answer aggregate/historical
 * questions like "how many distinct stakers have there ever been" or "total
 * rewards paid out". We index the relevant events once and serve those
 * aggregates from SQLite in O(1).
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type EventKind = 'Staked' | 'Withdrawn' | 'RewardPaid';

export interface Db {
  insertEvent(e: {
    kind: EventKind;
    user: string;
    amount: bigint;
    blockNumber: bigint;
    logIndex: number;
    txHash: string;
  }): void;
  getLastIndexedBlock(): bigint | null;
  setLastIndexedBlock(block: bigint): void;
  getStakerCount(): number;
  getTotalRewardsPaid(): bigint;
  getStakerAggregate(user: string): { staked: bigint; claimed: bigint };
  getStakerHistory(user: string, limit: number): HistoryRow[];
  getRecentActivity(limit: number): HistoryRow[];
  // ── DEX (swap) ──
  insertSwap(e: SwapInsert): void;
  getLastDexBlock(): bigint | null;
  setLastDexBlock(block: bigint): void;
  getSwapCount(): number;
  getSwapVolume(): { volume0In: bigint; volume1In: bigint };
  getRecentSwaps(limit: number): SwapRow[];
  getSwapHistory(user: string, limit: number): SwapRow[];
  close(): void;
}

export interface HistoryRow {
  kind: EventKind;
  amount: string;
  blockNumber: number;
  txHash: string;
}

export interface SwapInsert {
  sender: string;
  recipient: string;
  amount0In: bigint;
  amount1In: bigint;
  amount0Out: bigint;
  amount1Out: bigint;
  blockNumber: bigint;
  logIndex: number;
  txHash: string;
}

export interface SwapRow {
  sender: string;
  recipient: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
  blockNumber: number;
  txHash: string;
}

export function openDb(path: string): Db {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA journal_mode = WAL;');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      kind        TEXT NOT NULL,
      user        TEXT NOT NULL,
      amount      TEXT NOT NULL,        -- uint256 stored as decimal string
      block_number INTEGER NOT NULL,
      log_index   INTEGER NOT NULL,
      tx_hash     TEXT NOT NULL,
      UNIQUE(tx_hash, log_index)        -- idempotent re-indexing
    );
    CREATE INDEX IF NOT EXISTS idx_events_user ON events(user);
    CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS swaps (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sender      TEXT NOT NULL,
      recipient   TEXT NOT NULL,
      amount0_in  TEXT NOT NULL,         -- uint256 as decimal string
      amount1_in  TEXT NOT NULL,
      amount0_out TEXT NOT NULL,
      amount1_out TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      log_index   INTEGER NOT NULL,
      tx_hash     TEXT NOT NULL,
      UNIQUE(tx_hash, log_index)         -- idempotent re-indexing
    );
    CREATE INDEX IF NOT EXISTS idx_swaps_sender ON swaps(sender);
    CREATE INDEX IF NOT EXISTS idx_swaps_recipient ON swaps(recipient);
  `);

  const insertStmt = sqlite.prepare(
    `INSERT OR IGNORE INTO events (kind, user, amount, block_number, log_index, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const lastBlockStmt = sqlite.prepare(`SELECT value FROM meta WHERE key = 'last_block'`);
  const setBlockStmt = sqlite.prepare(
    `INSERT INTO meta (key, value) VALUES ('last_block', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const stakerCountStmt = sqlite.prepare(
    `SELECT COUNT(DISTINCT user) AS n FROM events WHERE kind = 'Staked'`,
  );
  const rewardsPaidStmt = sqlite.prepare(`SELECT amount FROM events WHERE kind = 'RewardPaid'`);
  const aggStmt = sqlite.prepare(`SELECT amount FROM events WHERE kind = ? AND user = ?`);
  const historyStmt = sqlite.prepare(
    `SELECT kind, amount, block_number AS blockNumber, tx_hash AS txHash
     FROM events WHERE user = ?
     ORDER BY block_number DESC, log_index DESC
     LIMIT ?`,
  );
  const recentStmt = sqlite.prepare(
    `SELECT kind, amount, block_number AS blockNumber, tx_hash AS txHash
     FROM events
     ORDER BY block_number DESC, log_index DESC
     LIMIT ?`,
  );

  // ── DEX (swap) statements ──
  const insertSwapStmt = sqlite.prepare(
    `INSERT OR IGNORE INTO swaps
       (sender, recipient, amount0_in, amount1_in, amount0_out, amount1_out,
        block_number, log_index, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const lastDexBlockStmt = sqlite.prepare(`SELECT value FROM meta WHERE key = 'last_dex_block'`);
  const setDexBlockStmt = sqlite.prepare(
    `INSERT INTO meta (key, value) VALUES ('last_dex_block', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  const swapCountStmt = sqlite.prepare(`SELECT COUNT(*) AS n FROM swaps`);
  const swapVolumeStmt = sqlite.prepare(`SELECT amount0_in, amount1_in FROM swaps`);
  const swapCols = `sender, recipient,
       amount0_in AS amount0In, amount1_in AS amount1In,
       amount0_out AS amount0Out, amount1_out AS amount1Out,
       block_number AS blockNumber, tx_hash AS txHash`;
  const recentSwapsStmt = sqlite.prepare(
    `SELECT ${swapCols} FROM swaps ORDER BY block_number DESC, log_index DESC LIMIT ?`,
  );
  const swapHistoryStmt = sqlite.prepare(
    `SELECT ${swapCols} FROM swaps WHERE sender = ? OR recipient = ?
     ORDER BY block_number DESC, log_index DESC LIMIT ?`,
  );

  return {
    insertEvent(e) {
      insertStmt.run(
        e.kind,
        e.user.toLowerCase(),
        e.amount.toString(),
        Number(e.blockNumber),
        e.logIndex,
        e.txHash,
      );
    },

    getLastIndexedBlock() {
      const row = lastBlockStmt.get() as { value: string } | undefined;
      return row ? BigInt(row.value) : null;
    },

    setLastIndexedBlock(block) {
      setBlockStmt.run(block.toString());
    },

    getStakerCount() {
      const row = stakerCountStmt.get() as { n: number };
      return row.n;
    },

    getTotalRewardsPaid() {
      const rows = rewardsPaidStmt.all() as { amount: string }[];
      return rows.reduce((acc, r) => acc + BigInt(r.amount), 0n);
    },

    getStakerAggregate(user) {
      const u = user.toLowerCase();
      const sum = (kind: EventKind): bigint => {
        const rows = aggStmt.all(kind, u) as { amount: string }[];
        return rows.reduce((acc, r) => acc + BigInt(r.amount), 0n);
      };
      // Net staked = total staked − total withdrawn (from indexed history).
      const staked = sum('Staked') - sum('Withdrawn');
      const claimed = sum('RewardPaid');
      return { staked: staked < 0n ? 0n : staked, claimed };
    },

    getStakerHistory(user, limit) {
      return historyStmt.all(user.toLowerCase(), limit) as unknown as HistoryRow[];
    },

    getRecentActivity(limit) {
      return recentStmt.all(limit) as unknown as HistoryRow[];
    },

    // ── DEX (swap) ──
    insertSwap(e) {
      insertSwapStmt.run(
        e.sender.toLowerCase(),
        e.recipient.toLowerCase(),
        e.amount0In.toString(),
        e.amount1In.toString(),
        e.amount0Out.toString(),
        e.amount1Out.toString(),
        Number(e.blockNumber),
        e.logIndex,
        e.txHash,
      );
    },

    getLastDexBlock() {
      const row = lastDexBlockStmt.get() as { value: string } | undefined;
      return row ? BigInt(row.value) : null;
    },

    setLastDexBlock(block) {
      setDexBlockStmt.run(block.toString());
    },

    getSwapCount() {
      const row = swapCountStmt.get() as { n: number };
      return row.n;
    },

    getSwapVolume() {
      const rows = swapVolumeStmt.all() as { amount0_in: string; amount1_in: string }[];
      return rows.reduce(
        (acc, r) => ({
          volume0In: acc.volume0In + BigInt(r.amount0_in),
          volume1In: acc.volume1In + BigInt(r.amount1_in),
        }),
        { volume0In: 0n, volume1In: 0n },
      );
    },

    getRecentSwaps(limit) {
      return recentSwapsStmt.all(limit) as unknown as SwapRow[];
    },

    getSwapHistory(user, limit) {
      const u = user.toLowerCase();
      return swapHistoryStmt.all(u, u, limit) as unknown as SwapRow[];
    },

    close() {
      sqlite.close();
    },
  };
}
