const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember, resolveRole } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx, target, role) {
    if (!target)
        return sendError(ctx, `Member not found. Usage: \`${ctx.prefix}role @member <role>\``);
    if (!role) return sendError(ctx, 'Role not found.');
    if (role.managed || role.id === ctx.guild.roles.everyone.id)
        return sendError(ctx, 'I cannot assign that role.');
    if (role.position >= ctx.guild.members.me.roles.highest.position)
        return sendError(ctx, 'That role is above my highest role.');
    if (ctx.user.id !== ctx.guild.ownerId && role.position >= ctx.member.roles.highest.position)
        return sendError(ctx, 'That role is at or above your highest role.');
    if (target.roles.cache.has(role.id))
        return sendError(ctx, `**${target.user.tag}** already has that role.`);

    await target.roles.add(role, `Role added by ${ctx.user.tag}`);
    logModAction(ctx.client, ctx.guild.id, {
        action: 'Role add',
        target: `${target.user.tag} (${target.id})`,
        moderator: ctx.user.tag,
        reason: `+ ${role.name}`,
    });
    return ctx.reply(cv2(success(`Gave **${role.name}** to **${target.user.tag}**.`, 'Role added')));
}

module.exports = {
    name: 'role',
    description: 'Gives a role to a member.',
    usage: '<@member | id> <role>',
    aliases: ['addrole', 'giverole'],
    userPermissions: [PermissionFlagsBits.ManageRoles],
    botPermissions: [PermissionFlagsBits.ManageRoles],
    cooldown: 3,
    slash: [
        { name: 'member', description: 'Member to receive the role', type: Opt.User, required: true },
        { name: 'role', description: 'Role to give', type: Opt.Role, required: true },
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
