const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.MessageBulkDelete,
    execute(messages, client) {
        const first = messages.first();
        if (!first?.guild) return;
        logEvent(client, first.guild.id, 'bulkDelete', [
            { name: 'Count', value: `${messages.size} messages`, inline: true },
            { name: 'Channel', value: `${first.channel}`, inline: true },
        ]).catch(() => {});
    },
};
