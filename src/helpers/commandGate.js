const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const db = require('../utils/database');
const { ruleBlocks } = require('../utils/commandRules');
const { sendError } = require('./embeds');
const { formatDuration } = require('./format');

// Global anti-spam: beyond per-command cooldowns, cap total command invocations
// per user so one spammer can't hammer our API/DB in a loop.
const SPAM_LIMIT = 5; // commands
const SPAM_WINDOW = 10_000; // per 10 seconds

// Shared gate for every invocation path (prefix, trigger, slash). Runs the
// same checks messageCreate used to own: anti-spam, guild/owner gates,
// dashboard toggles, permission requirements and cooldowns, then records the
// dashboard stat. `message` is a real Message for prefix commands and the
// interaction shim for slash commands — both expose the same surface.
//
// Returns true when the command was blocked (the user has been told already).
async function gateCommand(message, command, client) {
    const settings = message.guildSettings;
    if (!config.ownerIds.includes((message.author ?? message.user).id)) {
        const now = Date.now();
        let bucket = client.rateLimits.get((message.author ?? message.user).id);
        if (!bucket || bucket.resetAt < now) {
            bucket = { count: 0, resetAt: now + SPAM_WINDOW };
            client.rateLimits.set((message.author ?? message.user).id, bucket);
        }
        bucket.count++;
        if (bucket.count > SPAM_LIMIT) {
            if (bucket.count === SPAM_LIMIT + 1)
                return sendError(message, 'You are running commands too fast — slow down.'), true;
            return true; // already warned this window — drop silently
        }
    }

    if (command.guildOnly !== false && !message.guild)
        return sendError(message, 'This command can only be used inside a server.'), true;
    if (command.ownerOnly && !config.ownerIds.includes((message.author ?? message.user).id)) return true;

    // Dashboard toggles — owners bypass so they can always fix things.
    if (settings && !config.ownerIds.includes((message.author ?? message.user).id)) {
        if (settings.modules?.[command.category] === false)
            return sendError(message, `The \`${command.category}\` module is disabled in this server.`), true;
        if (settings.disabledCommands?.includes(command.name))
            return sendError(message, `The \`${command.name}\` command is disabled in this server.`), true;
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
            ), true;
        // Per-module channel gate — configured on the Modules page.
        // Threads pass if their parent channel is allowed.
        const chans = settings.moduleChannels?.[command.category];
        if (chans?.length && ![message.channel.id, message.channel.parentId].some((c) => chans.includes(c)))
            return sendError(
                message,
                `The \`${command.category}\` module only works in ${chans.map((c) => `<#${c}>`).join(', ')}`
            ), true;
        // Scoped rules — channel and/or daily time-window disables.
        const hit = settings.commandRules?.find((r) => ruleBlocks(r, command.name, message.channel));
        if (hit) {
            const where = hit.channelId ? 'in this channel' : 'in this server';
            const when = hit.start ? ` between ${hit.start}–${hit.end} ${hit.tz || 'UTC'}` : '';
            return sendError(message, `The \`${command.name}\` command is disabled ${where}${when}.`), true;
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
            ), true;

        const missingBot = (command.botPermissions || []).filter(
            (p) => !message.guild.members.me.permissions.has(p)
        );
        if (missingBot.length)
            return sendError(
                message,
                `I need these permissions: ${missingBot.map((p) => `\`${p}\``).join(', ')}`
            ), true;

        if (!message.channel.permissionsFor(client.user.id)?.has(PermissionFlagsBits.SendMessages)) return true;
    }

    // Per-user cooldowns live in memory — they intentionally reset on restart.
    if (command.cooldown > 0 && !config.ownerIds.includes((message.author ?? message.user).id)) {
        const key = `${command.name}:${(message.author ?? message.user).id}`;
        const expiresAt = client.cooldowns.get(key) ?? 0;
        const now = Date.now();
        if (now < expiresAt) {
            return sendError(
                message,
                `Slow down — you can use \`${command.name}\` again in ${formatDuration(expiresAt - now)}.`
            ), true;
        }
        client.cooldowns.set(key, now + command.cooldown * 1000);
    }

    // Dashboard stats — fire-and-forget so it never slows the command.
    if (message.guild) db.trackCommandUse(message.guild.id, command.name, (message.author ?? message.user).id).catch(() => {});

    return false;
}

module.exports = { gateCommand };
