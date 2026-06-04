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
import { Indexer, DexIndexer } from './indexer.js';
import { equinoxVaultAbi, equinoxPairAbi } from './abi.js';

const app = Fastify({ logger: true });
const db = openDb(appConfig.databasePath);

// Indexers only start when their respective addresses are configured.
const indexer = appConfig.isConfigured ? new Indexer(appConfig, db) : null;
const dexIndexer = appConfig.isDexConfigured ? new DexIndexer(appConfig, db) : null;

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

// ── DEX (AMM) endpoints ──
app.get('/dex/stats', async (_req, reply) => {
  if (!dexIndexer || !appConfig.pairAddress) {
    return reply.code(503).send({ error: 'dex indexer not configured (no PAIR_ADDRESS)' });
  }
  // Live reserves + token ordering from the pair contract.
  const [reserves, token0, token1] = await Promise.all([
    dexIndexer.client.readContract({
      address: appConfig.pairAddress,
      abi: equinoxPairAbi,
      functionName: 'getReserves',
    }),
    dexIndexer.client.readContract({
      address: appConfig.pairAddress,
      abi: equinoxPairAbi,
      functionName: 'token0',
    }),
    dexIndexer.client.readContract({
      address: appConfig.pairAddress,
      abi: equinoxPairAbi,
      functionName: 'token1',
    }),
  ]);
  const [reserve0, reserve1] = reserves as readonly [bigint, bigint];
  const volume = db.getSwapVolume();
  // Spot price of token0 in token1 terms (reserve1/reserve0), scaled to 1e18.
  const price0In1 = reserve0 > 0n ? (reserve1 * 10n ** 18n) / reserve0 : 0n;

  return {
    token0,
    token1,
    reserve0: reserve0.toString(),
    reserve1: reserve1.toString(),
    price0In1: price0In1.toString(),
    swapCount: db.getSwapCount(),
    volume0In: volume.volume0In.toString(),
    volume1In: volume.volume1In.toString(),
  };
});

app.get('/dex/activity', async () => ({ swaps: db.getRecentSwaps(25) }));

app.get<{ Params: { address: string } }>('/dex/:address/history', async (req, reply) => {
  const { address } = req.params;
  if (!isAddress(address)) {
    return reply.code(400).send({ error: 'invalid address' });
  }
  return { address: getAddress(address), swaps: db.getSwapHistory(address, 50) };
});

async function main(): Promise<void> {
  if (indexer) {
    app.log.info('Backfilling vault events…');
    try {
      await indexer.backfill();
      indexer.startPolling();
      app.log.info('Vault indexer running.');
    } catch (err) {
      app.log.error({ err }, 'initial vault backfill failed; API will serve cached data');
    }
  } else {
    app.log.warn('No VAULT_ADDRESS configured — vault indexer idle.');
  }

  if (dexIndexer) {
    app.log.info('Backfilling DEX swap events…');
    try {
      await dexIndexer.backfill();
      dexIndexer.startPolling();
      app.log.info('DEX indexer running.');
    } catch (err) {
      app.log.error({ err }, 'initial DEX backfill failed; API will serve cached data');
    }
  } else {
    app.log.warn('No PAIR_ADDRESS configured — DEX indexer idle.');
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
    dexIndexer?.stop();
    db.close();
    process.exit(0);
  });
}

void main();
