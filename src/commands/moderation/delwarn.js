const { PermissionFlagsBits } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const db = require('../../utils/database');
const { logModAction } = require('../../utils/modlog');

module.exports = {
    name: 'delwarn',
    description: 'Removes one warning by id, or all warnings with "all".',
    usage: '<@member> <warn id | all>',
    aliases: ['removewarn', 'clearwarns', 'delwarns'],
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    cooldown: 3,
    async execute(message, args) {
        const target = await resolveMember(message, args[0]);
        if (!target)
            return sendError(
                message,
                `Member not found. Usage: \`${message.prefix}delwarn @member <warn id | all>\``
            );

        const which = (args[1] || '').toLowerCase();
        if (!which) return sendError(message, 'Give me a warn id, or `all` to clear everything.');

        if (which === 'all') {
            const removed = await db.clearWarns(message.guild.id, target.id);
            if (!removed) return sendError(message, `**${target.user.tag}** has no warns to clear.`);
            logModAction(message.client, message.guild.id, {
                action: 'Clear warns',
                target: `${target.user.tag} (${target.id})`,
                moderator: message.author.tag,
                extra: `Removed ${removed} warn(s)`,
            });
            return message.reply(
                cv2(
                    success(`Cleared **${removed}** warn(s) from **${target.user.tag}**.`, 'Warns cleared')
                )
            );
        }

        const removed = await db.deleteWarn(message.guild.id, target.id, which);
        if (removed)
            logModAction(message.client, message.guild.id, {
                action: 'Delete warn',
                target: `${target.user.tag} (${target.id})`,
                moderator: message.author.tag,
                extra: `Warn \`${removed.id}\` — "${removed.reason}"`,
            });
        if (!removed)
            return sendError(
                message,
                `No warn with id \`${which}\` found for **${target.user.tag}**. Check \`${message.prefix}warns\`.`
            );
        return message.reply(
            cv2(success(`Removed warn \`${removed.id}\` from **${target.user.tag}**.`, 'Warn removed'))
        );
    },
};
