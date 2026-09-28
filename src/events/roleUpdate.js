const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.GuildRoleUpdate,
    execute(oldRole, newRole, client) {
        const fields = [{ name: 'Role', value: `${newRole}`, inline: true }];
        if (oldRole.name !== newRole.name) fields.push({ name: 'Name', value: `${oldRole.name} → ${newRole.name}`, inline: true });
        if (oldRole.hexColor !== newRole.hexColor) fields.push({ name: 'Color', value: `${oldRole.hexColor} → ${newRole.hexColor}`, inline: true });
        if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) fields.push({ name: 'Permissions', value: 'changed', inline: true });
        if (oldRole.hoist !== newRole.hoist) fields.push({ name: 'Hoisted', value: newRole.hoist ? 'yes' : 'no', inline: true });
        if (fields.length === 1) return;
        logEvent(client, newRole.guild.id, 'roleUpdate', fields).catch(() => {});
    },
};
