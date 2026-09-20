const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const db = require('../utils/database');
const { sendError } = require('../helpers/embeds');
const { formatDuration } = require('../helpers/format');

// Global anti-spam: beyond per-command cooldowns, cap total command invocations
// per user so one spammer can't hammer our API/DB in a loop.
const SPAM_LIMIT = 5; // commands
const SPAM_WINDOW = 10_000; // per 10 seconds

// The heart of the bot: turns a raw message into a command call.
//
// Resolution order:
//   1. "<prefix><name or alias> [args]"  -> .ping, .bal @user
//   2. "<trigger> [args]"                -> "net" runs ping without a prefix

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || message.webhookId) return;

        const content = message.content.trim();

        // Per-guild settings (dashboard): prefix, module toggles, disabled
        // commands. One fetch covers all of it — settings are TTL-cached.
        const settings = message.guild ? await db.getGuildSettings(message.guild.id) : null;
        const prefix = settings?.prefix || config.prefix;
        message.prefix = prefix; // commands show this in usage hints

        let command = null;
        let args = [];

        if (content.startsWith(prefix)) {
            const body = content.slice(prefix.length).trim();
            if (!body) return;
            args = body.split(/\s+/);
            const name = args.shift().toLowerCase();
            command = client.commands.get(name) ?? client.commands.get(client.aliases.get(name));
        } else {
            // Triggers let a plain word invoke a command ("net" -> ping).
            const [first, ...rest] = content.split(/\s+/);
            const trigger = client.triggers.get(first.toLowerCase());
            if (trigger) {
                command = client.commands.get(trigger);
                args = rest;
            }
        }

        if (!command) return;

        // Global anti-spam bucket — rejected before any expensive work runs.
        if (!config.ownerIds.includes(message.author.id)) {
            const now = Date.now();
            let bucket = client.rateLimits.get(message.author.id);
            if (!bucket || bucket.resetAt < now) {
                bucket = { count: 0, resetAt: now + SPAM_WINDOW };
                client.rateLimits.set(message.author.id, bucket);
            }
            bucket.count++;
            if (bucket.count > SPAM_LIMIT) {
                if (bucket.count === SPAM_LIMIT + 1)
                    return sendError(message, 'You are running commands too fast — slow down.');
                return; // already warned this window — drop silently
            }
        }

        if (command.guildOnly !== false && !message.guild)
            return sendError(message, 'This command can only be used inside a server.');
        if (command.ownerOnly && !config.ownerIds.includes(message.author.id)) return;

        // Dashboard toggles — owners bypass so they can always fix things.
        if (settings && !config.ownerIds.includes(message.author.id)) {
            if (settings.modules?.[command.category] === false)
                return sendError(message, `The \`${command.category}\` module is disabled in this server.`);
            if (settings.disabledCommands?.includes(command.name))
                return sendError(message, `The \`${command.name}\` command is disabled in this server.`);
        }

        if (message.guild) {
            const missingUser = (command.userPermissions || []).filter(
                (p) => !message.member.permissions.has(p)
            );
            if (missingUser.length)
                return sendError(
                    message,
                    `You need these permissions: ${missingUser.map((p) => `\`${p}\``).join(', ')}`
                );

            const missingBot = (command.botPermissions || []).filter(
                (p) => !message.guild.members.me.permissions.has(p)
            );
            if (missingBot.length)
                return sendError(
                    message,
                    `I need these permissions: ${missingBot.map((p) => `\`${p}\``).join(', ')}`
                );

            if (!message.channel.permissionsFor(client.user.id)?.has(PermissionFlagsBits.SendMessages)) return;
        }

        // Per-user cooldowns live in memory — they intentionally reset on restart.
        if (command.cooldown > 0 && !config.ownerIds.includes(message.author.id)) {
            const key = `${command.name}:${message.author.id}`;
            const expiresAt = client.cooldowns.get(key) ?? 0;
            const now = Date.now();
            if (now < expiresAt) {
                return sendError(
                    message,
                    `Slow down — you can use \`${command.name}\` again in ${formatDuration(expiresAt - now)}.`
                );
            }
            client.cooldowns.set(key, now + command.cooldown * 1000);
        }

        try {
            await command.execute(message, args, client);
        } catch (err) {
            logger.error(`Command "${command.name}" failed:`, err);
            sentry.capture(err);
            await sendError(message, 'Something went wrong while running that command.');
        }
    },
};
