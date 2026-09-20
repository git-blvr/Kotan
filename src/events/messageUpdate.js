const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

// Message-edit logging. Skips embed-only updates (content unchanged) and bots.

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage, client) {
        const msg = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
        if (!msg?.guild || msg.author?.bot) return;

        const before = oldMessage.partial || oldMessage.content == null ? '*(uncached)*' : oldMessage.content;
        if (before === msg.content) return; // embed resolved, pin, etc.

        await logEvent(client, msg.guild.id, 'messageEdit', [
            { name: 'Channel', value: `${msg.channel}`, inline: true },
            { name: 'Author', value: `${msg.author.tag} (${msg.author.id})`, inline: true },
            { name: 'Before', value: (before || '*(empty)*').slice(0, 500) },
            { name: 'After', value: (msg.content || '*(empty)*').slice(0, 500) },
        ]);
    },
};
