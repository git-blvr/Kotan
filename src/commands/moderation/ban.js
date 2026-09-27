const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember, resolveUser } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

// `user` is a resolved User — member-or-id resolution happens at each entry.
async function run(ctx, user, reason) {
    const target = user ? await ctx.guild.members.fetch(user.id).catch(() => null) : null;

    if (target) {
        const check = canModerate(ctx, target);
        if (!check.ok) return sendError(ctx, check.reason);
        if (!target.bannable) return sendError(ctx, 'I cannot ban that member.');
        await target.ban({ reason: `${reason} — by ${ctx.user.tag}` });
        logModAction(ctx.client, ctx.guild.id, {
            action: 'Ban',
            target: `${target.user.tag} (${target.id})`,
            moderator: ctx.user.tag,
            reason,
        });
        return ctx.reply(
            cv2(success(`**${target.user.tag}** was banned.\nReason: ${reason}`, 'Member banned'))
        );
    }

    // Not a member — allow banning by raw id so pre-emptive bans work.
    const id = user?.id;
    if (!id) return sendError(ctx, `User not found. Usage: \`${ctx.prefix}ban @member [reason]\``);
    if (id === ctx.user.id) return sendError(ctx, 'You cannot ban yourself.');

    const already = await ctx.guild.bans.fetch(id).catch(() => null);
    if (already) return sendError(ctx, 'That user is already banned.');

    await ctx.guild.members.ban(id, { reason: `${reason} — by ${ctx.user.tag}` });
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Ban',
        target: id,
        moderator: ctx.user.tag,
        reason,
        extra: 'Banned by user id',
    });
    return ctx.reply(
        cv2(success(`**${user ? user.tag : id}** was banned.\nReason: ${reason}`, 'User banned'))
    );
}

module.exports = {
    name: 'ban',
    description: 'Bans a member. Also accepts a user id to ban someone who left.',
    usage: '<@member | id> [reason]',
    aliases: ['hammer'],
    userPermissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    cooldown: 3,
    slash: [
        { name: 'user', description: 'Member or user to ban', type: Opt.User, required: true },
        { name: 'reason', description: 'Why they\'re being banned', type: Opt.String },
    ],
    execute: async (message, args, client) => {
        const member = await resolveMember(message, args[0]);
        const user = member?.user ?? (await resolveUser(client, args[0]));
        return run(fromMessage(message, { client }), user, args.slice(1).join(' ') || 'No reason provided');
    },
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getUser('user'),
            interaction.options.getString('reason') || 'No reason provided'
        ),
};
