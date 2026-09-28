const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.ThreadDelete,
    execute(thread, client) {
        logEvent(client, thread.guild.id, 'threadDelete', [
            { name: 'Thread', value: `${thread.name} (${thread.id})`, inline: true },
        ]).catch(() => {});
    },
};
