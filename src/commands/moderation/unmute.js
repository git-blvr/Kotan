const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx, target) {
    if (!target)
        return sendError(ctx, `Member not found. Usage: \`${ctx.prefix}unmute @member\``);

    const check = canModerate(ctx, target);
    if (!check.ok) return sendError(ctx, check.reason);

    if (!target.isCommunicationDisabled())
        return sendError(ctx, `**${target.user.tag}** is not muted.`);

    await target.timeout(null, `Unmuted by ${ctx.user.tag}`);
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Unmute',
        target: `${target.user.tag} (${target.id})`,
        moderator: ctx.user.tag,
    });
    return ctx.reply(
        cv2(success(`**${target.user.tag}** is no longer muted.`, 'Member unmuted'))
    );
}

module.exports = {
    name: 'unmute',
    description: 'Removes a member\'s timeout.',
    usage: '<@member>',
    aliases: ['untimeout', 'unsilence'],
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    botPermissions: [PermissionFlagsBits.ModerateMembers],
    cooldown: 3,
    slash: [
        { name: 'member', description: 'Member to unmute', type: Opt.User, required: true },
    ],
    execute: async (message, args) => run(fromMessage(message), await resolveMember(message, args[0])),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getMember('member')),
};
