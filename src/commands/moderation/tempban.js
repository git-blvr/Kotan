const { PermissionFlagsBits } = require('discord.js');
const { success, sendError } = require('../../helpers/embeds');
const { resolveMember, extractId } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { parseDuration, formatDuration, timestamp } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

module.exports = {
    name: 'tempban',
    description: 'Bans a user for a limited time, then automatically unbans them.',
    usage: '<@member | id> <duration> [reason]',
    aliases: ['tb', 'temporaryban'],
    userPermissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    cooldown: 3,
    async execute(message, args) {
        const duration = parseDuration(args[1]);
        const reason = args.slice(2).join(' ') || 'No reason provided';
        const unbanAt = Date.now() + (duration || 0);

        const target = await resolveMember(message, args[0]);
        let userId;
        let tag;

        if (target) {
            const check = canModerate(message, target);
            if (!check.ok) return sendError(message, check.reason);
            if (!target.bannable) return sendError(message, 'I cannot ban that member.');
            userId = target.id;
            tag = target.user.tag;
        } else {
            userId = extractId(args[0]);
            if (!userId)
                return sendError(
                    message,
                    `User not found. Usage: \`${config.prefix}tempban @member 1d [reason]\``
                );
            if (userId === message.author.id) return sendError(message, 'You cannot ban yourself.');
            tag = userId;
        }

        if (!duration)
            return sendError(message, 'Invalid duration. Examples: `30m`, `12h`, `7d`.');

        await message.guild.members.ban(userId, {
            reason: `Tempban ${formatDuration(duration)}: ${reason} — by ${message.author.tag}`,
        });
        await db.setTempban(message.guild.id, userId, {
            unbanAt,
            moderatorId: message.author.id,
            reason,
        });

        return message.reply({
            embeds: [
                success(
                    `**${tag}** was banned for **${formatDuration(duration)}**.\n` +
                        `Reason: ${reason}\nUnban: ${timestamp(unbanAt)}`,
                    'Member tempbanned'
                ),
            ],
        });
    },
};
