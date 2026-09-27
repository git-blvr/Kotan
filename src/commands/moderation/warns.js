const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { timestamp } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');

async function run(ctx, target) {
    if (!target) return sendError(ctx, 'Member not found.');

    // Anyone can see their own warns; checking others needs perms.
    const checkingOther = target.id !== ctx.user.id;
    if (checkingOther && !ctx.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return sendError(ctx, 'You need the `ModerateMembers` permission to view other people\'s warns.');

    const warns = await db.getWarns(ctx.guild.id, target.id);
    if (!warns.length)
        return ctx.reply(
            cv2(base({ title: 'Warns', description: `**${target.user.tag}** has no warnings.` }))
        );

    const fields = [];
    for (const warn of warns.slice(-15)) {
        const mod = await ctx.client.users.fetch(warn.moderatorId).catch(() => null);
        fields.push({
            name: `\`${warn.id}\` — ${timestamp(warn.at)}`,
            value: `${warn.reason}\nBy: ${mod ? mod.tag : warn.moderatorId}`,
        });
    }
    const embed = base({
        title: `Warns for ${target.user.tag} (${warns.length})`,
        fields,
        footer: warns.length > 15 ? { text: `Showing latest 15 of ${warns.length}` } : undefined,
    });
    return ctx.reply(cv2(embed));
}

module.exports = {
    name: 'warns',
    description: 'Lists the warnings of a member (or your own).',
    usage: '[@member]',
    aliases: ['warnings', 'warnlist'],
    cooldown: 3,
    slash: [
        { name: 'member', description: 'Whose warns to list (default: you)', type: Opt.User },
    ],
    execute: async (message, args) =>
        run(fromMessage(message), args[0] ? await resolveMember(message, args[0]) : message.member),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getMember('member') ?? interaction.member
        ),
};
