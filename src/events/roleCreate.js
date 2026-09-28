const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.GuildRoleCreate,
    execute(role, client) {
        logEvent(client, role.guild.id, 'roleCreate', [
            { name: 'Role', value: `${role} (${role.id})`, inline: true },
        ]).catch(() => {});
    },
};
