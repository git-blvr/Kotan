const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const db = require('../utils/database');
const { ruleBlocks } = require('../utils/commandRules');
const { sendError } = require('../helpers/embeds');
const { formatDuration } = require('../helpers/format');
const automod = require('../utils/automod');
const leveling = require('../utils/leveling');

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

        // Developer guild blacklist — a blacklisted guild gets nothing, not
        // even an error reply or tag expansion (silent by design).
        if (message.guild && db.isGuildBlacklisted(message.guild.id)) return;

        const content = message.content.trim();

        // Per-guild settings: prefix, module toggles, disabled
        // commands. One fetch covers all of it — settings are TTL-cached.
        const settings = message.guild ? await db.getGuildSettings(message.guild.id) : null;
        const prefix = settings?.prefix || config.prefix;
        message.prefix = prefix; // commands show this in usage hints
        message.guildSettings = settings; // commands reuse it (currency etc.)

        // Automod scans every message — invites, blacklist, spam velocity.
        // If it deleted the message we stop here, before command resolution.
        if (settings && (await automod.checkMessage(message, settings.automod, client))) return;

        // Leveling — every surviving message earns XP (commands included).
        // Fire-and-forget: never blocks or slows command resolution.
        if (settings) leveling.awardXp(message, settings.leveling).catch(() => {});

        let command = null;
        let args = [];
        let tagName = null; // prefix used but no builtin matched -> try tags

        if (content.startsWith(prefix)) {
            const body = content.slice(prefix.length).trim();
            if (!body) return;
            args = body.split(/\s+/);
            const name = args.shift().toLowerCase();
            command = client.commands.get(name) ?? client.commands.get(client.aliases.get(name));
            if (!command) tagName = name;
        } else {
            // Triggers let a plain word invoke a command ("net" -> ping).
            const [first, ...rest] = content.split(/\s+/);
            const trigger = client.triggers.get(first.toLowerCase());
            if (trigger) {
                command = client.commands.get(trigger);
                args = rest;
            }
        }

        // Custom commands (tags): "<prefix><tagname>" replies
        // with the saved text. Builtins always win over tags.
        if (!command && tagName && message.guild) {
            const tagContent = await db.useTag(message.guild.id, tagName);
            if (tagContent)
                return message
                    .reply({ content: tagContent, allowedMentions: { parse: [] } }) // tags can't mass-ping
                    .catch(() => {});
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
            // Per-module role gate — configured on the Modules page.
            const need = settings.moduleRoles?.[command.category];
            if (
                need?.length &&
                !message.member?.permissions.has(PermissionFlagsBits.ManageGuild) &&
                !message.member?.roles.cache.some((r) => need.includes(r.id))
            )
                return sendError(
                    message,
                    `The \`${command.category}\` module requires one of these roles: ${need.map((r) => `<@&${r}>`).join(', ')}`
                );
            // Scoped rules — channel and/or daily time-window disables.
            const hit = settings.commandRules?.find((r) => ruleBlocks(r, command.name, message.channel));
            if (hit) {
                const where = hit.channelId ? 'in this channel' : 'in this server';
                const when = hit.start ? ` between ${hit.start}–${hit.end} ${hit.tz || 'UTC'}` : '';
                return sendError(message, `The \`${command.name}\` command is disabled ${where}${when}.`);
            }
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

        // Dashboard stats — fire-and-forget so it never slows the command.
        if (message.guild) db.trackCommandUse(message.guild.id, command.name, message.author.id).catch(() => {});

        try {
            await command.execute(message, args, client);
        } catch (err) {
            logger.error(`Command "${command.name}" failed:`, err);
            sentry.capture(err);
            await sendError(message, 'Something went wrong while running that command.');
        }
    },
};
