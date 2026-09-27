const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember, resolveUser } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { parseDuration, formatDuration, timestamp } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const { logModAction } = require('../../utils/modlog');

async function run(ctx, user, durationInput, reason) {
    const duration = parseDuration(durationInput);
    if (!duration)
        return sendError(ctx, 'Invalid duration. Examples: `30m`, `12h`, `7d`.');
    const unbanAt = Date.now() + duration;

    const target = user ? await ctx.guild.members.fetch(user.id).catch(() => null) : null;
    let userId;
    let tag;

    if (target) {
        const check = canModerate(ctx, target);
        if (!check.ok) return sendError(ctx, check.reason);
        if (!target.bannable) return sendError(ctx, 'I cannot ban that member.');
        userId = target.id;
        tag = target.user.tag;
    } else {
        userId = user?.id;
        if (!userId)
            return sendError(
                ctx,
                `User not found. Usage: \`${ctx.prefix}tempban @member 1d [reason]\``
            );
        if (userId === ctx.user.id) return sendError(ctx, 'You cannot ban yourself.');
        tag = userId;
    }

    await ctx.guild.members.ban(userId, {
        reason: `Tempban ${formatDuration(duration)}: ${reason} — by ${ctx.user.tag}`,
    });
    await db.setTempban(ctx.guild.id, userId, {
        unbanAt,
        moderatorId: ctx.user.id,
        reason,
    });
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Tempban',
        target: `${tag} (${userId})`,
        moderator: ctx.user.tag,
        reason,
        extra: `Duration: ${formatDuration(duration)}`,
    });

    return ctx.reply(
        cv2(
            success(
                `**${tag}** was banned for **${formatDuration(duration)}**.\n` +
                    `Reason: ${reason}\nUnban: ${timestamp(unbanAt)}`,
                'Member tempbanned'
            )
        )
    );
}

module.exports = {
    name: 'tempban',
    description: 'Bans a user for a limited time, then automatically unbans them.',
    usage: '<@member | id> <duration> [reason]',
    aliases: ['tb', 'temporaryban'],
    userPermissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    cooldown: 3,
    slash: [
        { name: 'user', description: 'Member or user to tempban', type: Opt.User, required: true },
        { name: 'duration', description: 'How long — e.g. 30m, 12h, 7d', type: Opt.String, required: true },
        { name: 'reason', description: 'Why they\'re being banned', type: Opt.String },
    ],
    execute: async (message, args, client) => {
        const member = await resolveMember(message, args[0]);
        const user = member?.user ?? (await resolveUser(client, args[0]));
        return run(fromMessage(message, { client }), user, args[1], args.slice(2).join(' ') || 'No reason provided');
    },
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getUser('user'),
            interaction.options.getString('duration'),
            interaction.options.getString('reason') || 'No reason provided'
        ),
};
