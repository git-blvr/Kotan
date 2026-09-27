const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { parseDuration, formatDuration } = require('../../helpers/format');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

const MAX_TIMEOUT = 28 * 24 * 60 * 60 * 1000; // Discord caps timeouts at 28 days

async function run(ctx, target, durationInput, reason) {
    if (!target)
        return sendError(ctx, `Member not found. Usage: \`${ctx.prefix}mute @member 10m [reason]\``);

    const check = canModerate(ctx, target);
    if (!check.ok) return sendError(ctx, check.reason);
    if (!target.moderatable) return sendError(ctx, 'I cannot time out that member.');

    const duration = parseDuration(durationInput);
    if (!duration)
        return sendError(ctx, 'Invalid duration. Examples: `30s`, `10m`, `1h30m`, `2d`.');
    if (duration > MAX_TIMEOUT) return sendError(ctx, 'Timeouts cannot exceed 28 days.');

    await target.timeout(duration, `${reason} — by ${ctx.user.tag}`);
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Mute',
        target: `${target.user.tag} (${target.id})`,
        moderator: ctx.user.tag,
        reason,
        extra: `Duration: ${formatDuration(duration)}`,
    });

    return ctx.reply(
        cv2(
            success(
                `**${target.user.tag}** was muted for **${formatDuration(duration)}**.\nReason: ${reason}`,
                'Member muted'
            )
        )
    );
}

module.exports = {
    name: 'mute',
    description: 'Times out a member for a given duration (e.g. 10m, 1h, 2d).',
    usage: '<@member> <duration> [reason]',
    aliases: ['timeout', 'silence'],
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ModerateMembers],
    cooldown: 3,
    slash: [
        { name: 'member', description: 'Member to time out', type: Opt.User, required: true },
        { name: 'duration', description: 'How long — e.g. 30s, 10m, 2d', type: Opt.String, required: true },
        { name: 'reason', description: 'Why they\'re being muted', type: Opt.String },
    ],
    execute: async (message, args) =>
        run(
            fromMessage(message),
            await resolveMember(message, args[0]),
            args[1],
            args.slice(2).join(' ') || 'No reason provided'
        ),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getMember('member'),
            interaction.options.getString('duration'),
            interaction.options.getString('reason') || 'No reason provided'
        ),
};
