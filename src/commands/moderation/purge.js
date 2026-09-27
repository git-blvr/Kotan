const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx, amount, target) {
    if (!Number.isInteger(amount) || amount < 1 || amount > 100)
        return sendError(ctx, `Usage: \`${ctx.prefix}purge <1-100> [@member]\``);

    const fetched = await ctx.channel.messages.fetch({ limit: 100 });
    let batch = [...fetched.values()].filter((m) => !m.pinned);
    if (target) batch = batch.filter((m) => m.author.id === target.id);
    batch = batch.slice(0, amount);
    if (!batch.length)
        return sendError(ctx, target ? `No recent messages from **${target.user.tag}** found.` : 'Nothing to delete.');

    // bulkDelete's `true` filter skips messages older than 14 days.
    const deleted = await ctx.channel.bulkDelete(batch, true).catch(() => null);
    if (!deleted?.size) return sendError(ctx, 'Could not delete those messages (they may be too old).');

    logModAction(ctx.client, ctx.guild.id, {
        action: 'Purge',
        target: `#${ctx.channel.name}${target ? ` — ${target.user.tag} only` : ''}`,
        moderator: ctx.user.tag,
        reason: `${deleted.size} message(s) deleted`,
    });
    // Prefix: the notice is a channel message (the invoke stays visible).
    // Slash: the notice is the interaction reply — same auto-delete.
    const payload = cv2(success(`Deleted **${deleted.size}** message(s)${target ? ` from **${target.user.tag}**` : ''}.`, 'Messages purged'));
    const notice = ctx.interaction ? await ctx.reply(payload) : await ctx.channel.send(payload);
    setTimeout(() => notice.delete().catch(() => {}), 5000);
}

module.exports = {
    name: 'purge',
    description: 'Deletes a batch of recent messages in this channel. Optionally only from one member.',
    usage: '<1-100> [@member]',
    aliases: ['clear', 'prune'],
    userPermissions: [PermissionFlagsBits.ManageMessages],
    botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
    cooldown: 5,
    slash: [
        { name: 'amount', description: 'How many recent messages to delete (1-100)', type: Opt.Integer, required: true, min_value: 1, max_value: 100 },
        { name: 'member', description: 'Only delete this member\'s messages', type: Opt.User },
    ],
    execute: async (message, args) =>
        run(fromMessage(message), parseInt(args[0], 10), args[1] ? await resolveMember(message, args[1]) : null),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getInteger('amount'),
            interaction.options.getMember('member')
        ),
};
