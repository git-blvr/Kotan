require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { ClusterClient, getInfo } = require('discord-hybrid-sharding');
const config = require('./config');
const logger = require('./utils/logger');

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

require('./handlers/commandHandler')(client);
require('./handlers/eventHandler')(client);

if (!config.token) {
    logger.error('BOT_MAIN_TOKEN is not set in .env');
    process.exit(1);
}

client.login(config.token);

process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
