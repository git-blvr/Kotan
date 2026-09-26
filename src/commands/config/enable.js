const { PermissionFlagsBits } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const db = require('../../utils/database');
const { describeRule } = require('../../utils/commandRules');

module.exports = {
    name: 'enable',
    description: 'Re-enable a command — removes global or scoped disable rules.',
    usage: '<command> [#channel]',
    aliases: ['enablecmd'],
    userPermissions: [PermissionFlagsBits.ManageGuild],
    cooldown: 3,
    async execute(message, args) {
        const name = (args[0] || '').toLowerCase();
        if (!name)
            return sendError(message, `Usage: \`${message.prefix}enable <command> [#channel]\``);

        const command =
            message.client.commands.get(name) ?? message.client.commands.get(message.client.aliases.get(name));
        if (!command) return sendError(message, `Unknown command \`${name}\`.`);

        // Optional channel narrows which scoped rules get removed.
        const rest = args.slice(1).join(' ');
        let channelId = null;
        const cm = rest.match(/<#(\d{17,20})>|#([^\s#]+)|\b(\d{17,20})\b/);
        if (cm) {
            const ch = (cm[1] || cm[3])
                ? message.guild.channels.cache.get(cm[1] || cm[3])
                : message.guild.channels.cache.find((c) => c.name === cm[2] && c.isTextBased());
            if (!ch) return sendError(message, `Channel \`${cm[0]}\` not found in this server.`);
            channelId = ch.id;
        } else if (rest.trim()) {
            return sendError(message, `Couldn't parse \`${rest.trim()}\` — pass a channel like \`#general\`.`);
        }

        const settings = await db.getGuildSettings(message.guild.id);
        const before = (settings.commandRules || []).length;
        const wasGlobal = settings.disabledCommands?.includes(command.name);

        if (channelId) {
            // Scoped enable — drop only rules bound to this channel.
            settings.commandRules = (settings.commandRules || []).filter(
                (r) => !(r.command === command.name && r.channelId === channelId)
            );
        } else {
            // Bare enable lifts everything for this command.
            settings.commandRules = (settings.commandRules || []).filter((r) => r.command !== command.name);
            settings.disabledCommands = (settings.disabledCommands || []).filter((c) => c !== command.name);
        }

        const removed = before - (settings.commandRules || []).length;
        if (!removed && !wasGlobal)
            return sendError(
                message,
                `\`${command.name}\` has no disable rules${channelId ? ' in that channel' : ''} to remove.`
            );

        await db.saveGuildSettings(message.guild.id, settings);
        const scope = channelId
            ? ` in #${message.guild.channels.cache.get(channelId)?.name || 'that channel'}`
            : '';
        const extra = wasGlobal && !channelId ? ' (global disable lifted)' : '';
        return message.reply(
            cv2(success(`\`${command.name}\` re-enabled${scope} — removed ${removed} rule${removed === 1 ? '' : 's'}${extra}.`))
        );
    },
};
