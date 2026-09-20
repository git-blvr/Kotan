const { Events, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { sendError } = require('../helpers/embeds');
const { formatDuration } = require('../helpers/format');

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
        let command = null;
        let args = [];

        if (content.startsWith(config.prefix)) {
            const body = content.slice(config.prefix.length).trim();
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
        if (command.guildOnly !== false && !message.guild)
            return sendError(message, 'This command can only be used inside a server.');
        if (command.ownerOnly && !config.ownerIds.includes(message.author.id)) return;

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
            await sendError(message, 'Something went wrong while running that command.');
        }
    },
};
