const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.GuildRoleDelete,
    execute(role, client) {
        logEvent(client, role.guild.id, 'roleDelete', [
            { name: 'Role', value: `${role.name} (${role.id})`, inline: true },
        ]).catch(() => {});
    },
};
