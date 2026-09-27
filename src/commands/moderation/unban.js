const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { extractId } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx, id, reason) {
    if (!id)
        return sendError(ctx, `Give me a user id. Usage: \`${ctx.prefix}unban <id> [reason]\``);

    const ban = await ctx.guild.bans.fetch(id).catch(() => null);
    if (!ban) return sendError(ctx, 'That user is not banned.');

    await ctx.guild.members.unban(id, `${reason} — by ${ctx.user.tag}`);
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Unban',
        target: `${ban.user.tag} (${id})`,
        moderator: ctx.user.tag,
        reason,
    });
    return ctx.reply(
        cv2(success(`**${ban.user.tag}** was unbanned.\nReason: ${reason}`, 'User unbanned'))
    );
}

module.exports = {
    name: 'unban',
    description: 'Unbans a user by their id.',
    usage: '<user id> [reason]',
    aliases: ['pardon'],
    userPermissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    cooldown: 3,
    slash: [
        { name: 'user', description: 'The banned user', type: Opt.User, required: true },
        { name: 'reason', description: 'Why they\'re being unbanned', type: Opt.String },
    ],
    execute: (message, args) =>
        run(fromMessage(message), extractId(args[0]), args.slice(1).join(' ') || 'No reason provided'),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getUser('user')?.id,
            interaction.options.getString('reason') || 'No reason provided'
        ),
};
