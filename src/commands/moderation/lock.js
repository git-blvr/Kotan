const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { extractId } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx, channel, reason) {
    channel = channel || ctx.channel;
    if (!channel.isTextBased()) return sendError(ctx, 'That is not a text channel.');

    const everyone = ctx.guild.roles.everyone;
    if (channel.permissionOverwrites.cache.get(everyone.id)?.deny.has(PermissionFlagsBits.SendMessages))
        return sendError(ctx, `${channel} is already locked.`);

    await channel.permissionOverwrites.edit(everyone, { SendMessages: false },
        { reason: `${reason} — by ${ctx.user.tag}` });
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Lock',
        target: `#${channel.name}`,
        moderator: ctx.user.tag,
        reason,
    });
    return ctx.reply(cv2(success(`**#${channel.name}** is locked.\nReason: ${reason}`, 'Channel locked')));
}

module.exports = {
    name: 'lock',
    description: 'Locks a channel — members can no longer send messages in it.',
    usage: '[#channel] [reason]',
    aliases: ['lockdown'],
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels],
    cooldown: 5,
    slash: [
        { name: 'channel', description: 'Channel to lock (default: this one)', type: Opt.Channel, channel_types: [0, 5] },
        { name: 'reason', description: 'Why it\'s being locked', type: Opt.String },
    ],
    execute: (message, args) => {
        const mentioned = message.mentions.channels.first() || message.guild.channels.cache.get(extractId(args[0]));
        return run(
            fromMessage(message),
            mentioned || null,
            (mentioned ? args.slice(1) : args).join(' ') || 'No reason provided'
        );
    },
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getChannel('channel'),
            interaction.options.getString('reason') || 'No reason provided'
        ),
};
