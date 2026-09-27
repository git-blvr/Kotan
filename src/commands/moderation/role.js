const { PermissionFlagsBits } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember, resolveRole } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');

module.exports = {
    name: 'role',
    description: 'Gives a role to a member.',
    usage: '<@member | id> <role>',
    aliases: ['addrole', 'giverole'],
    userPermissions: [PermissionFlagsBits.ManageRoles],
    botPermissions: [PermissionFlagsBits.ManageRoles],
    cooldown: 3,
    async execute(message, args) {
        const target = await resolveMember(message, args[0]);
        if (!target)
            return sendError(message, `Member not found. Usage: \`${message.prefix}role @member <role>\``);

        const role = resolveRole(message.guild, args.slice(1).join(' '));
        if (!role) return sendError(message, 'Role not found.');
        if (role.managed || role.id === message.guild.roles.everyone.id)
            return sendError(message, 'I cannot assign that role.');
        if (role.position >= message.guild.members.me.roles.highest.position)
            return sendError(message, 'That role is above my highest role.');
        if (message.author.id !== message.guild.ownerId && role.position >= message.member.roles.highest.position)
            return sendError(message, 'That role is at or above your highest role.');
        if (target.roles.cache.has(role.id))
            return sendError(message, `**${target.user.tag}** already has that role.`);

        await target.roles.add(role, `Role added by ${message.author.tag}`);
        logModAction(message.client, message.guild.id, {
            action: 'Role add',
            target: `${target.user.tag} (${target.id})`,
            moderator: message.author.tag,
            reason: `+ ${role.name}`,
        });
        return message.reply(cv2(success(`Gave **${role.name}** to **${target.user.tag}**.`, 'Role added')));
    },
};
