const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.ThreadCreate,
    // ThreadCreate emits (thread, newlyCreated) — skip it, client comes last.
    execute(thread, _newlyCreated, client) {
        logEvent(client, thread.guild.id, 'threadCreate', [
            { name: 'Thread', value: `${thread.name} (${thread.id})`, inline: true },
            ...(thread.parent ? [{ name: 'In', value: `${thread.parent}`, inline: true }] : []),
        ]).catch(() => {});
    },
};
