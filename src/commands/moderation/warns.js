const { PermissionFlagsBits } = require('discord.js');
const { base, sendError } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { timestamp } = require('../../helpers/format');
const db = require('../../utils/database');

module.exports = {
    name: 'warns',
    description: 'Lists the warnings of a member (or your own).',
    usage: '[@member]',
    aliases: ['warnings', 'warnlist'],
    cooldown: 3,
    async execute(message, args) {
        // Anyone can see their own warns; checking others needs perms.
        const target = args[0] ? await resolveMember(message, args[0]) : message.member;
        if (!target) return sendError(message, 'Member not found.');

        const checkingOther = target.id !== message.author.id;
        if (checkingOther && !message.member.permissions.has(PermissionFlagsBits.ModerateMembers))
            return sendError(message, 'You need the `ModerateMembers` permission to view other people\'s warns.');

        const warns = await db.getWarns(message.guild.id, target.id);
        if (!warns.length)
            return message.reply({
                embeds: [base({ title: 'Warns', description: `**${target.user.tag}** has no warnings.` })],
            });

        const embed = base({ title: `Warns for ${target.user.tag} (${warns.length})` });
        for (const warn of warns.slice(-15)) {
            const mod = await message.client.users.fetch(warn.moderatorId).catch(() => null);
            embed.addFields({
                name: `\`${warn.id}\` — ${timestamp(warn.at)}`,
                value: `${warn.reason}\nBy: ${mod ? mod.tag : warn.moderatorId}`,
            });
        }
        if (warns.length > 15) embed.setFooter({ text: `Showing latest 15 of ${warns.length}` });
        return message.reply({ embeds: [embed] });
    },
};
