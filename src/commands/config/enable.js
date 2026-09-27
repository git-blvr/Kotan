const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const { describeRule } = require('../../utils/commandRules');

// Shared enable logic — `scopeText` is the prefix-mode free-form tail that
// still needs parsing; slash passes a channel id directly.
async function run(ctx, name, { channelId = null, scopeText = '' } = {}) {
    if (!name)
        return sendError(ctx, `Usage: \`${ctx.prefix}enable <command> [#channel]\``);

    const command =
        ctx.client.commands.get(name) ?? ctx.client.commands.get(ctx.client.aliases.get(name));
    if (!command) return sendError(ctx, `Unknown command \`${name}\`.`);

    // Prefix mode: the channel is buried in free text — parse it out.
    if (scopeText) {
        const cm = scopeText.match(/<#(\d{17,20})>|#([^\s#]+)|\b(\d{17,20})\b/);
        if (cm) {
            const ch = (cm[1] || cm[3])
                ? ctx.guild.channels.cache.get(cm[1] || cm[3])
                : ctx.guild.channels.cache.find((c) => c.name === cm[2] && c.isTextBased());
            if (!ch) return sendError(ctx, `Channel \`${cm[0]}\` not found in this server.`);
            channelId = ch.id;
        } else {
            return sendError(ctx, `Couldn't parse \`${scopeText.trim()}\` — pass a channel like \`#general\`.`);
        }
    }

    const settings = await db.getGuildSettings(ctx.guild.id);
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
            ctx,
            `\`${command.name}\` has no disable rules${channelId ? ' in that channel' : ''} to remove.`
        );

    await db.saveGuildSettings(ctx.guild.id, settings);
    const scope = channelId
        ? ` in #${ctx.guild.channels.cache.get(channelId)?.name || 'that channel'}`
        : '';
    const extra = wasGlobal && !channelId ? ' (global disable lifted)' : '';
    return ctx.reply(
        cv2(success(`\`${command.name}\` re-enabled${scope} — removed ${removed} rule${removed === 1 ? '' : 's'}${extra}.`))
    );
}

module.exports = {
    name: 'enable',
    description: 'Re-enable a command — removes global or scoped disable rules.',
    usage: '<command> [#channel]',
    aliases: ['enablecmd'],
    userPermissions: [PermissionFlagsBits.ManageGuild],
    cooldown: 3,
    slash: [
        { name: 'command', description: 'Command to re-enable', type: Opt.String, required: true },
        { name: 'channel', description: 'Only lift channel-scoped rules here', type: Opt.Channel, channel_types: [0, 5] },
    ],
    execute: (message, args) =>
        run(fromMessage(message), (args[0] || '').toLowerCase(), { scopeText: args.slice(1).join(' ') }),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getString('command')?.toLowerCase(), {
            channelId: interaction.options.getChannel('channel')?.id ?? null,
        }),
};
