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
  close(): void;
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

    close() {
      sqlite.close();
    },
  };
}
