const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.GuildBanRemove,
    execute(ban, client) {
        logEvent(client, ban.guild.id, 'banRemove', [
            { name: 'Member', value: `${ban.user?.tag ?? ban.user?.id ?? 'unknown'} (${ban.user?.id})`, inline: true },
        ]).catch(() => {});
    },
};
