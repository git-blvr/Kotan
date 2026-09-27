const { PermissionFlagsBits } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { logModAction } = require('../../utils/modlog');

module.exports = {
    name: 'purge',
    description: 'Deletes a batch of recent messages in this channel. Optionally only from one member.',
    usage: '<1-100> [@member]',
    aliases: ['clear', 'prune'],
    userPermissions: [PermissionFlagsBits.ManageMessages],
    botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
    cooldown: 5,
    async execute(message, args) {
        const amount = parseInt(args[0], 10);
        if (!Number.isInteger(amount) || amount < 1 || amount > 100)
            return sendError(message, `Usage: \`${message.prefix}purge <1-100> [@member]\``);

        let target = null;
        if (args[1]) {
            target = await resolveMember(message, args[1]);
            if (!target) return sendError(message, 'Member not found.');
        }

        const fetched = await message.channel.messages.fetch({ limit: 100 });
        let batch = [...fetched.values()].filter((m) => !m.pinned);
        if (target) batch = batch.filter((m) => m.author.id === target.id);
        batch = batch.slice(0, amount);
        if (!batch.length)
            return sendError(message, target ? `No recent messages from **${target.user.tag}** found.` : 'Nothing to delete.');

        // bulkDelete's `true` filter skips messages older than 14 days.
        const deleted = await message.channel.bulkDelete(batch, true).catch(() => null);
        if (!deleted?.size) return sendError(message, 'Could not delete those messages (they may be too old).');

        logModAction(message.client, message.guild.id, {
            action: 'Purge',
            target: `#${message.channel.name}${target ? ` — ${target.user.tag} only` : ''}`,
            moderator: message.author.tag,
            reason: `${deleted.size} message(s) deleted`,
        });
        const notice = await message.channel.send(
            cv2(success(`Deleted **${deleted.size}** message(s)${target ? ` from **${target.user.tag}**` : ''}.`, 'Messages purged'))
        );
        setTimeout(() => notice.delete().catch(() => {}), 5000);
    },
};
