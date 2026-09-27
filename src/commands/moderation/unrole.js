const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember, resolveRole } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx, target, role) {
    if (!target)
        return sendError(ctx, `Member not found. Usage: \`${ctx.prefix}unrole @member <role>\``);
    if (!role) return sendError(ctx, 'Role not found.');
    if (role.managed || role.id === ctx.guild.roles.everyone.id)
        return sendError(ctx, 'I cannot manage that role.');
    if (role.position >= ctx.guild.members.me.roles.highest.position)
        return sendError(ctx, 'That role is above my highest role.');
    if (ctx.user.id !== ctx.guild.ownerId && role.position >= ctx.member.roles.highest.position)
        return sendError(ctx, 'That role is at or above your highest role.');
    if (!target.roles.cache.has(role.id))
        return sendError(ctx, `**${target.user.tag}** doesn't have that role.`);

    await target.roles.remove(role, `Role removed by ${ctx.user.tag}`);
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Role remove',
        target: `${target.user.tag} (${target.id})`,
        moderator: ctx.user.tag,
        reason: `- ${role.name}`,
    });
    return ctx.reply(cv2(success(`Removed **${role.name}** from **${target.user.tag}**.`, 'Role removed')));
}

module.exports = {
    name: 'unrole',
    description: 'Removes a role from a member.',
    usage: '<@member | id> <role>',
    aliases: ['removerole', 'takerole'],
    userPermissions: [PermissionFlagsBits.ManageRoles],
    botPermissions: [PermissionFlagsBits.ManageRoles],
    cooldown: 3,
    slash: [
        { name: 'member', description: 'Member to remove the role from', type: Opt.User, required: true },
        { name: 'role', description: 'Role to remove', type: Opt.Role, required: true },
    ],
    execute: async (message, args) =>
        run(
            fromMessage(message),
            await resolveMember(message, args[0]),
            resolveRole(message.guild, args.slice(1).join(' '))
        ),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getMember('member'),
            interaction.options.getRole('role')
        ),
};
