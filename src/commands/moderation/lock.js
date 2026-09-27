const { PermissionFlagsBits } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { extractId } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');

module.exports = {
    name: 'lock',
    description: 'Locks a channel — members can no longer send messages in it.',
    usage: '[#channel] [reason]',
    aliases: ['lockdown'],
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels],
    cooldown: 5,
    async execute(message, args) {
        const mentioned = message.mentions.channels.first() || message.guild.channels.cache.get(extractId(args[0]));
        const channel = mentioned || message.channel;
        const reason = (mentioned ? args.slice(1) : args).join(' ') || 'No reason provided';
        if (!channel.isTextBased()) return sendError(message, 'That is not a text channel.');

        const everyone = message.guild.roles.everyone;
        if (channel.permissionOverwrites.cache.get(everyone.id)?.deny.has(PermissionFlagsBits.SendMessages))
            return sendError(message, `${channel} is already locked.`);

        await channel.permissionOverwrites.edit(everyone, { SendMessages: false },
            { reason: `${reason} — by ${message.author.tag}` });
        logModAction(message.client, message.guild.id, {
            action: 'Lock',
            target: `#${channel.name}`,
            moderator: message.author.tag,
            reason,
        });
        return message.reply(cv2(success(`**#${channel.name}** is locked.\nReason: ${reason}`, 'Channel locked')));
    },
};
