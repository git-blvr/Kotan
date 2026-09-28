const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.GuildEmojiDelete,
    execute(emoji, client) {
        logEvent(client, emoji.guild.id, 'emojiDelete', [
            { name: 'Emoji', value: `${emoji.name} (${emoji.id})`, inline: true },
        ]).catch(() => {});
    },
};
