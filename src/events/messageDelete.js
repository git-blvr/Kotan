const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

// Message-delete logging. Uncached deletions arrive as partials — we log
// what we have instead of fetching (the message is gone anyway).

module.exports = {
    name: Events.MessageDelete,
    async execute(message, client) {
        if (!message.guild || message.author?.bot) return;
        const fields = [
            { name: 'Channel', value: `${message.channel}`, inline: true },
            {
                name: 'Author',
                value: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown (uncached)',
                inline: true,
            },
        ];
        if (message.content) fields.push({ name: 'Content', value: message.content.slice(0, 1000) });
        await logEvent(client, message.guild.id, 'messageDelete', fields);
    },
};
