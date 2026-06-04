/**
 * EquinoxFi backend — indexer/API skeleton.
 *
 * Role (see GENERAL.md Section 7): the EquinoxVault contract is the single
 * source of truth. This service exists only to serve fast, aggregated,
 * historical reads the chain cannot cheaply provide — it backfills
 * Staked / Withdrawn / RewardPaid events into SQLite, then polls for new
 * blocks and exposes a small REST API.
 *
 * The indexing logic (viem getLogs backfill + poll, SQLite cache, /stats and
 * /stakers/:address endpoints) is implemented in Phase 5. This file currently
 * stands up the Fastify server and a /health probe so the package is runnable
 * end-to-end from the scaffold onward.
 */
import Fastify from 'fastify';

const PORT = Number(process.env.PORT ?? 3001);

const app = Fastify({ logger: true });

app.get('/health', async () => ({ status: 'ok', service: 'equinoxfi-backend' }));

async function main(): Promise<void> {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
