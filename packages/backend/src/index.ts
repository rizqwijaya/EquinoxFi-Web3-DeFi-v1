/**
 * EquinoxFi backend — indexer/API entrypoint (GENERAL.md Section 7).
 *
 * Role: the EquinoxVault contract is the single source of truth. This service
 * exists only to serve fast, aggregated, historical reads the chain cannot
 * cheaply provide. On startup it backfills Staked / Withdrawn / RewardPaid
 * events into SQLite, then polls for new blocks, and exposes a small REST API:
 *
 *   GET /stats              → totalStaked, totalStakers, rewardRate, totalRewardsPaid
 *   GET /stakers/:address   → that user's staked balance + total claimed (cache)
 *   GET /health             → liveness probe
 *
 * Live on-chain figures (totalStaked, rewardRate) are read directly from the
 * contract; historical aggregates (staker count, rewards paid) come from the
 * SQLite cache.
 */
import Fastify from 'fastify';
import { isAddress, getAddress } from 'viem';
import { appConfig } from './config.js';
import { openDb } from './db.js';
import { Indexer } from './indexer.js';
import { equinoxVaultAbi } from './abi.js';

const app = Fastify({ logger: true });
const db = openDb(appConfig.databasePath);

// Indexer is only started when a real vault address is configured.
const indexer = appConfig.isConfigured ? new Indexer(appConfig, db) : null;

app.get('/health', async () => ({
  status: 'ok',
  service: 'equinoxfi-backend',
  configured: appConfig.isConfigured,
}));

app.get('/stats', async (_req, reply) => {
  if (!indexer || !appConfig.vaultAddress) {
    return reply.code(503).send({ error: 'indexer not configured (no VAULT_ADDRESS)' });
  }

  // Live reads from the contract.
  const [totalStaked, rewardRate] = await Promise.all([
    indexer.client.readContract({
      address: appConfig.vaultAddress,
      abi: equinoxVaultAbi,
      functionName: 'totalSupply',
    }),
    indexer.client.readContract({
      address: appConfig.vaultAddress,
      abi: equinoxVaultAbi,
      functionName: 'rewardRate',
    }),
  ]);

  return {
    totalStaked: totalStaked.toString(),
    totalStakers: db.getStakerCount(),
    rewardRate: rewardRate.toString(),
    totalRewardsPaid: db.getTotalRewardsPaid().toString(),
  };
});

app.get<{ Params: { address: string } }>('/stakers/:address', async (req, reply) => {
  const { address } = req.params;
  if (!isAddress(address)) {
    return reply.code(400).send({ error: 'invalid address' });
  }
  const agg = db.getStakerAggregate(address);
  return {
    address: getAddress(address),
    stakedBalance: agg.staked.toString(),
    totalClaimed: agg.claimed.toString(),
  };
});

app.get<{ Params: { address: string } }>('/stakers/:address/history', async (req, reply) => {
  const { address } = req.params;
  if (!isAddress(address)) {
    return reply.code(400).send({ error: 'invalid address' });
  }
  return { address: getAddress(address), events: db.getStakerHistory(address, 50) };
});

app.get('/activity', async () => ({ events: db.getRecentActivity(25) }));

async function main(): Promise<void> {
  if (indexer) {
    app.log.info('Backfilling vault events…');
    try {
      await indexer.backfill();
      indexer.startPolling();
      app.log.info('Indexer running.');
    } catch (err) {
      app.log.error({ err }, 'initial backfill failed; API will serve cached data');
    }
  } else {
    app.log.warn('No VAULT_ADDRESS configured — running API only, indexer idle.');
  }

  try {
    await app.listen({ port: appConfig.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    indexer?.stop();
    db.close();
    process.exit(0);
  });
}

void main();
