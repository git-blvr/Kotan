const { Events, ChannelType } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

const TYPE_NAMES = Object.fromEntries(Object.entries(ChannelType).map(([k, v]) => [v, k]));

module.exports = {
    name: Events.ChannelDelete,
    async execute(channel, client) {
        if (!channel.guild) return;
        await logEvent(client, channel.guild.id, 'channelDelete', [
            { name: 'Channel', value: `#${channel.name} (${channel.id})`, inline: true },
            { name: 'Type', value: TYPE_NAMES[channel.type] || String(channel.type), inline: true },
        ]);
    },
};
