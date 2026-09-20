const { PermissionFlagsBits } = require('discord.js');
const { success, sendError } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const config = require('../../config');

module.exports = {
    name: 'unmute',
    description: 'Removes a member\'s timeout.',
    usage: '<@member>',
    aliases: ['untimeout', 'unsilence'],
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ModerateMembers],
    cooldown: 3,
    async execute(message, args) {
        const target = await resolveMember(message, args[0]);
        if (!target)
            return sendError(message, `Member not found. Usage: \`${config.prefix}unmute @member\``);

        const check = canModerate(message, target);
        if (!check.ok) return sendError(message, check.reason);

        if (!target.isCommunicationDisabled())
            return sendError(message, `**${target.user.tag}** is not muted.`);

        await target.timeout(null, `Unmuted by ${message.author.tag}`);
        return message.reply({
            embeds: [success(`**${target.user.tag}** is no longer muted.`, 'Member unmuted')],
        });
    },
};
