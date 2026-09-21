const { PermissionFlagsBits } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { extractId } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');

module.exports = {
    name: 'unban',
    description: 'Unbans a user by their id.',
    usage: '<user id> [reason]',
    aliases: ['pardon'],
    userPermissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    cooldown: 3,
    async execute(message, args) {
        const id = extractId(args[0]);
        if (!id)
            return sendError(message, `Give me a user id. Usage: \`${message.prefix}unban <id> [reason]\``);

        const ban = await message.guild.bans.fetch(id).catch(() => null);
        if (!ban) return sendError(message, 'That user is not banned.');

        const reason = args.slice(1).join(' ') || 'No reason provided';
        await message.guild.members.unban(id, `${reason} — by ${message.author.tag}`);
        logModAction(message.client, message.guild.id, {
            action: 'Unban',
            target: `${ban.user.tag} (${id})`,
            moderator: message.author.tag,
            reason,
        });
        return message.reply(
            cv2(success(`**${ban.user.tag}** was unbanned.\nReason: ${reason}`, 'User unbanned'))
        );
    },
};
