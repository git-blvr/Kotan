const { PermissionFlagsBits } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { extractId } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');

module.exports = {
    name: 'unlock',
    description: 'Unlocks a channel — lifts the message restriction set by lock.',
    usage: '[#channel]',
    aliases: ['unlockdown'],
    userPermissions: [PermissionFlagsBits.ManageChannels],
    botPermissions: [PermissionFlagsBits.ManageChannels],
    cooldown: 5,
    async execute(message, args) {
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(extractId(args[0])) || message.channel;
        if (!channel.isTextBased()) return sendError(message, 'That is not a text channel.');

        const everyone = message.guild.roles.everyone;
        if (!channel.permissionOverwrites.cache.get(everyone.id)?.deny.has(PermissionFlagsBits.SendMessages))
            return sendError(message, `${channel} is not locked.`);

        // null clears the deny — restores whatever the category/default allows.
        await channel.permissionOverwrites.edit(everyone, { SendMessages: null },
            { reason: `Unlocked by ${message.author.tag}` });
        logModAction(message.client, message.guild.id, {
            action: 'Unlock',
            target: `#${channel.name}`,
            moderator: message.author.tag,
        });
        return message.reply(cv2(success(`**#${channel.name}** is unlocked.`, 'Channel unlocked')));
    },
};
