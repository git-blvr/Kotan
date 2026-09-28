const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.ChannelUpdate,
    execute(oldCh, newCh, client) {
        if (!newCh.guild) return;
        const fields = [{ name: 'Channel', value: `${newCh}`, inline: true }];
        if (oldCh.name !== newCh.name) fields.push({ name: 'Name', value: `${oldCh.name} → ${newCh.name}`, inline: true });
        if ((oldCh.topic || '') !== (newCh.topic || '')) fields.push({ name: 'Topic', value: 'updated', inline: true });
        if (oldCh.parentId !== newCh.parentId) fields.push({ name: 'Category', value: 'moved', inline: true });
        if (fields.length === 1) return; // permission-sync noise — nothing meaningful changed
        logEvent(client, newCh.guild.id, 'channelUpdate', fields).catch(() => {});
    },
};
