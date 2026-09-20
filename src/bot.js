require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Options } = require('discord.js');
const { ClusterClient, getInfo } = require('discord-hybrid-sharding');
const config = require('./config');
const logger = require('./utils/logger');
const sentry = require('./utils/sentry');
const db = require('./utils/database');

// This file is the actual bot process. When launched through index.js the
// ClusterManager injects shard info via env vars and getInfo() returns it.
// When run directly (npm run dev) getInfo() throws — we catch that and boot a
// normal unsharded client, which is perfect for local debugging.

let clusterInfo = null;
try {
    clusterInfo = getInfo();
} catch {
    logger.info('No cluster manager detected — running standalone');
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // privileged: member cache + name lookups
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // privileged: required for prefix commands
        GatewayIntentBits.GuildModeration, // ban/unban events
    ],
    // RAM discipline for a public bot: cap every cache we don't rely on and
    // zero out the ones we never touch. Members are fetched on demand, so a
    // small member cache + always keeping ourselves is enough.
    makeCache: Options.cacheWithLimits({
        MessageManager: {
            maxSize: 10,
            keepOverLimit: (m) => m.author?.id === client.user?.id, // keep our own (edits)
        },
        GuildMemberManager: {
            maxSize: 200,
            keepOverLimit: (m) => m.id === client.user?.id,
        },
        UserManager: {
            maxSize: 1_000,
            keepOverLimit: (u) => u.id === client.user?.id,
        },
        // unused managers — never cache
        ThreadManager: 0,
        VoiceStateManager: 0,
        PresenceManager: 0,
        ReactionManager: 0,
        ReactionUserManager: 0,
        StageInstanceManager: 0,
        GuildInviteManager: 0,
        GuildScheduledEventManager: 0,
        AutoModerationManager: 0,
        GuildEmojiManager: 0,
        GuildStickerManager: 0,
        EntitlementManager: 0,
        GuildBanManager: 0,
    }),
    // Periodic sweepers on top of the hard caps — drop stale messages and
    // cached users even when under the limit.
    sweepers: {
        messages: { interval: 300, lifetime: 180 }, // >3 min old
        users: {
            interval: 3600,
            filter: () => (user) => user.id !== client.user?.id,
        },
    },
    ...(clusterInfo && {
        shards: clusterInfo.SHARD_LIST,
        shardCount: clusterInfo.TOTAL_SHARDS,
    }),
});

if (clusterInfo) client.cluster = new ClusterClient(client);

// Shared state, attached to the client so every module reaches it via `client`.
client.config = config;
client.commands = new Collection(); // name -> command module
client.aliases = new Collection(); // alias -> command name
client.triggers = new Collection(); // trigger word -> command name
client.cooldowns = new Collection(); // "cmd:userId" -> expiry timestamp
client.rateLimits = new Collection(); // userId -> { count, resetAt } anti-spam bucket

require('./handlers/commandHandler')(client);
require('./handlers/eventHandler')(client);

if (!config.token) {
    logger.error('BOT_MAIN_TOKEN is not set in .env');
    process.exit(1);
}

client.login(config.token);

// ---------- crash resilience ----------

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err);
    sentry.capture(err);
});

process.on('uncaughtException', (err) => {
    // Unrecoverable — log it, flush storage, exit. When clustered, the
    // manager (respawn:true) brings this cluster right back; in dev it just stops.
    logger.error('Uncaught exception:', err);
    sentry.capture(err);
    shutdown('uncaughtException', 1);
});

async function shutdown(signal, code = 0) {
    logger.warn(`${signal} received — destroying client and flushing storage`);
    try {
        client.destroy();
        await db.closeDatabase();
    } catch (err) {
        logger.error('Error during shutdown:', err);
    }
    process.exit(code);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
