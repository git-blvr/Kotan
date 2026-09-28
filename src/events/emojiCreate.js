const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.GuildEmojiCreate,
    execute(emoji, client) {
        logEvent(client, emoji.guild.id, 'emojiCreate', [
            { name: 'Emoji', value: `${emoji.name} (${emoji.id})`, inline: true },
        ]).catch(() => {});
    },
};
