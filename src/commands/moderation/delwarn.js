const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const { logModAction } = require('../../utils/modlog');

async function run(ctx, target, which) {
    if (!target)
        return sendError(
            ctx,
            `Member not found. Usage: \`${ctx.prefix}delwarn @member <warn id | all>\``
        );

    if (!which) return sendError(ctx, 'Give me a warn id, or `all` to clear everything.');
    which = which.toLowerCase();

    if (which === 'all') {
        const removed = await db.clearWarns(ctx.guild.id, target.id);
        if (!removed) return sendError(ctx, `**${target.user.tag}** has no warns to clear.`);
        logModAction(ctx.client, ctx.guild.id, {
            action: 'Clear warns',
            target: `${target.user.tag} (${target.id})`,
            moderator: ctx.user.tag,
            extra: `Removed ${removed} warn(s)`,
        });
        return ctx.reply(
            cv2(
                success(`Cleared **${removed}** warn(s) from **${target.user.tag}**.`, 'Warns cleared')
            )
        );
    }

    const removed = await db.deleteWarn(ctx.guild.id, target.id, which);
    if (removed)
        logModAction(ctx.client, ctx.guild.id, {
            action: 'Delete warn',
            target: `${target.user.tag} (${target.id})`,
            moderator: ctx.user.tag,
            extra: `Warn \`${removed.id}\` — "${removed.reason}"`,
        });
    if (!removed)
        return sendError(
            ctx,
            `No warn with id \`${which}\` found for **${target.user.tag}**. Check \`${ctx.prefix}warns\`.`
        );
    return ctx.reply(
        cv2(success(`Removed warn \`${removed.id}\` from **${target.user.tag}**.`, 'Warn removed'))
    );
}

module.exports = {
    name: 'delwarn',
    description: 'Removes one warning by id, or all warnings with "all".',
    usage: '<@member> <warn id | all>',
    aliases: ['removewarn', 'clearwarns', 'delwarns'],
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    cooldown: 3,
    slash: [
        { name: 'member', description: 'Member whose warn to remove', type: Opt.User, required: true },
        { name: 'warn', description: 'Warn id — or "all" to clear everything', type: Opt.String, required: true },
    ],
    execute: async (message, args) =>
        run(fromMessage(message), await resolveMember(message, args[0]), args[1]),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getMember('member'),
            interaction.options.getString('warn')
        ),
};
