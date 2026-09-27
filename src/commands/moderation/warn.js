const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { timestamp } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const { logModAction } = require('../../utils/modlog');

async function run(ctx, target, reason) {
    if (!target)
        return sendError(ctx, `Member not found. Usage: \`${ctx.prefix}warn @member <reason>\``);

    const check = canModerate(ctx, target);
    if (!check.ok) return sendError(ctx, check.reason);

    if (!reason) return sendError(ctx, 'Please provide a reason for the warn.');

    const warn = await db.addWarn(ctx.guild.id, target.id, {
        reason,
        moderatorId: ctx.user.id,
    });
    const total = (await db.getWarns(ctx.guild.id, target.id)).length;

    logModAction(ctx.client, ctx.guild.id, {
        action: 'Warn',
        target: `${target.user.tag} (${target.id})`,
        moderator: ctx.user.tag,
        reason,
        extra: `Warn id \`${warn.id}\` — total warns: ${total}`,
    });

    await target
        .send(
            cv2(
                success(
                    `You were warned in **${ctx.guild.name}**.\nReason: ${reason}`,
                    'You received a warn'
                )
            )
        )
        .catch(() => {}); // DMs closed — warn still counts

    return ctx.reply(
        cv2(
            success(
                `Warned **${target.user.tag}** (warn \`${warn.id}\`)\n` +
                    `Reason: ${reason}\nTotal warns: **${total}** — ${timestamp(warn.at)}`,
                'Member warned'
            )
        )
    );
}

module.exports = {
    name: 'warn',
    description: 'Warns a member and stores the warning.',
    usage: '<@member> <reason>',
    aliases: ['strike'],
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    cooldown: 3,
    slash: [
        { name: 'member', description: 'Member to warn', type: Opt.User, required: true },
        { name: 'reason', description: 'Why they\'re being warned', type: Opt.String, required: true },
    ],
    execute: async (message, args) =>
        run(fromMessage(message), await resolveMember(message, args[0]), args.slice(1).join(' ')),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getMember('member'),
            interaction.options.getString('reason')
        ),
};
