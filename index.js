require('dotenv').config();
const { ClusterManager } = require('discord-hybrid-sharding');
const path = require('path');
const logger = require('./src/utils/logger');

// Entry point for the public bot. Instead of one process per shard, each
// cluster hosts several internal shards — cheaper on memory and CPU.
//
//   npm start        -> runs this file (clustered, production)
//   npm run dev      -> runs src/bot.js directly (single process, debugging)

if (!process.env.BOT_MAIN_TOKEN) {
    logger.error('BOT_MAIN_TOKEN is not set in .env');
    process.exit(1);
}

// Crash listeners on the manager too — a cluster crashing is respawned, but
// a manager error would otherwise take the whole bot down silently.
const sentry = require('./src/utils/sentry');
process.on('unhandledRejection', (err) => {
    logger.error('Manager unhandled rejection:', err);
    sentry.capture(err);
});
process.on('uncaughtException', (err) => {
    logger.error('Manager uncaught exception:', err);
    sentry.capture(err);
    process.exit(1); // a crashed manager can't supervise — let PM2/systemd restart it
});

const manager = new ClusterManager(path.join(__dirname, 'src', 'bot.js'), {
    token: process.env.BOT_MAIN_TOKEN,
    totalShards: 'auto', // let Discord decide how many shards we need
    shardsPerClusters: Number(process.env.SHARDS_PER_CLUSTER) || 2,
    mode: 'process', // clusters are child processes (use 'worker' for threads)
    respawn: true, // restart a cluster if it dies
    restarts: { max: 5, interval: 60_000 },
});

manager.on('clusterCreate', (cluster) => {
    logger.info(`Cluster ${cluster.id} launched (shards ${cluster.shardList?.join(', ') || 'pending'})`);
    cluster.on('death', () => logger.warn(`Cluster ${cluster.id} exited — respawning`));
});

manager
    .spawn({ timeout: -1 })
    .then(() => logger.success(`All ${manager.clusters.size} clusters spawned`))
    .catch((err) => {
        logger.error('Failed to spawn clusters', err);
        process.exit(1);
    });

// Graceful shutdown: kill clusters first so they can flush state, then exit.
function shutdown(signal) {
    logger.warn(`Manager received ${signal} — stopping clusters`);
    for (const cluster of manager.clusters.values()) {
        try {
            cluster.kill();
        } catch {}
    }
    process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
