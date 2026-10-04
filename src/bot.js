require('dotenv').config({ quiet: true }); // index.js already loads+logs .env
const { Client, GatewayIntentBits, Collection, Options, Partials, Events } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const sentry = require('./utils/sentry');
const db = require('./utils/database');

// The bot process. index.js requires this file; `npm run dev` runs it
// directly. Single process, no sharding — one client handles everything.

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // privileged: member cache + name lookups
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // privileged: required for prefix commands
        GatewayIntentBits.GuildModeration, // ban/unban events
        GatewayIntentBits.GuildMessageReactions, // reaction roles
        GatewayIntentBits.GuildVoiceStates, // voice-state events + activity voice tracking
    ],
    // Reaction roles and delete/edit logging need events for uncached
    // messages too — partials deliver them with .fetch() on demand.
    partials: [Partials.Message, Partials.Reaction, Partials.User],
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
});

// Shared state, attached to the client so every module reaches it via `client`.
client.config = config;
client.commands = new Collection(); // name -> command module
client.aliases = new Collection(); // alias -> command name
client.triggers = new Collection(); // trigger word -> command name
client.cooldowns = new Collection(); // "cmd:userId" -> expiry timestamp
client.rateLimits = new Collection(); // userId -> { count, resetAt } anti-spam bucket
client.automodSpam = new Collection(); // "guildId:userId" -> [timestamps] spam filter
client.raidJoins = new Collection(); // guildId -> [timestamps] raid detector

require('./handlers/commandHandler')(client);
require('./handlers/eventHandler')(client);

if (!config.token) {
    logger.error('BOT_MAIN_TOKEN is not set in .env');
    process.exit(1);
}

client.login(config.token);

// Localhost dev REST API (restart/close/commands/guilds/…) — starts only
// when DEV_API_KEY is set. Independent of the public dashboard listener.
require('./utils/devrest').startDevApi(client, shutdown);

// Interactive dev console — `kotan>` prompt in this terminal once the bot is
// logged in (ready.js prints "Logged in as" first since it registered before
// us). Skipped under pm2/devctl where stdin can't be typed into.
client.once(Events.ClientReady, () => {
    setTimeout(() => require('./utils/devcli').startDevConsole(client, { shutdown }), 500);
});

// ---------- crash resilience ----------

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err);
    sentry.capture(err, { kind: 'process', source: 'unhandledRejection' });
});

process.on('uncaughtException', (err) => {
    // Unrecoverable — log it, flush storage, exit. PM2 (ecosystem.config.js)
    // or the host's supervisor is responsible for restarting the process.
    logger.error('Uncaught exception:', err);
    sentry.capture(err, { kind: 'process', source: 'uncaughtException' });
    shutdown('uncaughtException', 1);
});

async function shutdown(signal, code = 0) {
    logger.warn(`${signal} received — destroying client and flushing storage`);
    try {
        client.destroy();
        await db.flushActivity().catch(() => {});
        await db.closeDatabase();
        await sentry.close(2000); // flush pending Sentry events before exit
    } catch (err) {
        logger.error('Error during shutdown:', err);
    }
    process.exit(code);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
