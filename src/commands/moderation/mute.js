const { PermissionFlagsBits } = require('discord.js');
const { success, sendError } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { parseDuration, formatDuration } = require('../../helpers/format');
const config = require('../../config');

const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000; // Discord caps timeouts at 28 days

module.exports = {
    name: 'mute',
    description: 'Times out a member for a given duration (e.g. 10m, 1h, 2d).',
    usage: '<@member> <duration> [reason]',
    aliases: ['timeout', 'silence'],
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ModerateMembers],
    cooldown: 3,
    async execute(message, args) {
        const target = await resolveMember(message, args[0]);
        if (!target)
            return sendError(
                message,
                `Member not found. Usage: \`${config.prefix}mute @member 10m [reason]\``
            );

        const check = canModerate(message, target);
        if (!check.ok) return sendError(message, check.reason);
        if (!target.moderatable) return sendError(message, 'I cannot time out that member.');

        const duration = parseDuration(args[1]);
        if (!duration)
            return sendError(message, 'Invalid duration. Examples: `30s`, `10m`, `1h30m`, `2d`.');
        if (duration > MAX_TIMEOUT) return sendError(message, 'Timeouts cannot exceed 28 days.');

        const reason = args.slice(2).join(' ') || 'No reason provided';
        await target.timeout(duration, `${reason} — by ${message.author.tag}`);

        return message.reply({
            embeds: [
                success(
                    `**${target.user.tag}** was muted for **${formatDuration(duration)}**.\nReason: ${reason}`,
                    'Member muted'
                ),
            ],
        });
    },
};
