const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.ThreadCreate,
    execute(thread, client) {
        logEvent(client, thread.guild.id, 'threadCreate', [
            { name: 'Thread', value: `${thread.name} (${thread.id})`, inline: true },
            ...(thread.parent ? [{ name: 'In', value: `${thread.parent}`, inline: true }] : []),
        ]).catch(() => {});
    },
};
