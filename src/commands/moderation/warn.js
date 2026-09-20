const { PermissionFlagsBits } = require('discord.js');
const { success, sendError } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { canModerate } = require('../../helpers/checks');
const { timestamp } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

module.exports = {
    name: 'warn',
    description: 'Warns a member and stores the warning.',
    usage: '<@member> <reason>',
    aliases: ['strike'],
    userPermissions: [PermissionFlagsBits.ModerateMembers],
    cooldown: 3,
    async execute(message, args) {
        const target = await resolveMember(message, args[0]);
        if (!target)
            return sendError(message, `Member not found. Usage: \`${config.prefix}warn @member <reason>\``);

        const check = canModerate(message, target);
        if (!check.ok) return sendError(message, check.reason);

        const reason = args.slice(1).join(' ');
        if (!reason) return sendError(message, 'Please provide a reason for the warn.');

        const warn = await db.addWarn(message.guild.id, target.id, {
            reason,
            moderatorId: message.author.id,
        });
        const total = (await db.getWarns(message.guild.id, target.id)).length;

        await target
            .send({
                embeds: [
                    success(
                        `You were warned in **${message.guild.name}**.\nReason: ${reason}`,
                        'You received a warn'
                    ),
                ],
            })
            .catch(() => {}); // DMs closed — warn still counts

        return message.reply({
            embeds: [
                success(
                    `Warned **${target.user.tag}** (warn \`${warn.id}\`)\n` +
                        `Reason: ${reason}\nTotal warns: **${total}** — ${timestamp(warn.at)}`,
                    'Member warned'
                ),
            ],
        });
    },
};
