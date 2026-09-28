const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.GuildBanAdd,
    execute(ban, client) {
        logEvent(client, ban.guild.id, 'banAdd', [
            { name: 'Member', value: `${ban.user?.tag ?? ban.user?.id ?? 'unknown'} (${ban.user?.id})`, inline: true },
            ...(ban.reason ? [{ name: 'Reason', value: ban.reason, inline: true }] : []),
        ]).catch(() => {});
    },
};
