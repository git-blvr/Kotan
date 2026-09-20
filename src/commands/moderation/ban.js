const { PermissionFlagsBits } = require('discord.js');
const { success, sendError } = require('../../helpers/embeds');
const { resolveMember, extractId } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { logModAction } = require('../../utils/modlog');

module.exports = {
    name: 'ban',
    description: 'Bans a member. Also accepts a user id to ban someone who left.',
    usage: '<@member | id> [reason]',
    aliases: ['hammer'],
    userPermissions: [PermissionFlagsBits.BanMembers],
    botPermissions: [PermissionFlagsBits.BanMembers],
    cooldown: 3,
    async execute(message, args) {
        const reason = args.slice(1).join(' ') || 'No reason provided';
        const target = await resolveMember(message, args[0]);

        if (target) {
            const check = canModerate(message, target);
            if (!check.ok) return sendError(message, check.reason);
            if (!target.bannable) return sendError(message, 'I cannot ban that member.');
            await target.ban({ reason: `${reason} — by ${message.author.tag}` });
            logModAction(message.client, message.guild.id, {
                action: 'Ban',
                target: `${target.user.tag} (${target.id})`,
                moderator: message.author.tag,
                reason,
            });
            return message.reply({
                embeds: [success(`**${target.user.tag}** was banned.\nReason: ${reason}`, 'Member banned')],
            });
        }

        // Not a member — allow banning by raw id so pre-emptive bans work.
        const id = extractId(args[0]);
        if (!id)
            return sendError(message, `User not found. Usage: \`${message.prefix}ban @member [reason]\``);
        if (id === message.author.id) return sendError(message, 'You cannot ban yourself.');

        const already = await message.guild.bans.fetch(id).catch(() => null);
        if (already) return sendError(message, 'That user is already banned.');

        await message.guild.members.ban(id, { reason: `${reason} — by ${message.author.tag}` });
        logModAction(message.client, message.guild.id, {
            action: 'Ban',
            target: id,
            moderator: message.author.tag,
            reason,
            extra: 'Banned by user id',
        });
        const user = await message.client.users.fetch(id).catch(() => null);
        return message.reply({
            embeds: [
                success(`**${user ? user.tag : id}** was banned.\nReason: ${reason}`, 'User banned'),
            ],
        });
    },
};
