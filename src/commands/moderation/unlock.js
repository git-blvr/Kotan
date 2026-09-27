const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { extractId } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx, channel) {
    channel = channel || ctx.channel;
    if (!channel.isTextBased()) return sendError(ctx, 'That is not a text channel.');

    const everyone = ctx.guild.roles.everyone;
    if (!channel.permissionOverwrites.cache.get(everyone.id)?.deny.has(PermissionFlagsBits.SendMessages))
        return sendError(ctx, `${channel} is not locked.`);

    // null clears the deny — restores whatever the category/default allows.
    await channel.permissionOverwrites.edit(everyone, { SendMessages: null },
        { reason: `Unlocked by ${ctx.user.tag}` });
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Unlock',
        target: `#${channel.name}`,
        moderator: ctx.user.tag,
    });
    return ctx.reply(cv2(success(`**#${channel.name}** is unlocked.`, 'Channel unlocked')));
}

module.exports = {
    name: 'unlock',
    description: 'Unlocks a channel — lifts the message restriction set by lock.',
    usage: '[#channel]',
    aliases: ['unlockdown'],
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels],
    cooldown: 5,
    slash: [
        { name: 'channel', description: 'Channel to unlock (default: this one)', type: Opt.Channel, channel_types: [0, 5] },
    ],
    execute: (message, args) =>
        run(
            fromMessage(message),
            message.mentions.channels.first() || message.guild.channels.cache.get(extractId(args[0])) || null
        ),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getChannel('channel')),
};
