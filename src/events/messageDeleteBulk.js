const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.MessageBulkDelete,
    // MessageBulkDelete emits (messages, channel) — the channel arg sits
    // between messages and the client the loader appends.
    execute(messages, channel, client) {
        const first = messages.first();
        if (!first?.guild) return;
        logEvent(client, first.guild.id, 'bulkDelete', [
            { name: 'Count', value: `${messages.size} messages`, inline: true },
            { name: 'Channel', value: `${channel}`, inline: true },
        ]).catch(() => {});
    },
};
