const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.InviteDelete,
    execute(invite, client) {
        logEvent(client, invite.guild?.id, 'inviteDelete', [
            { name: 'Code', value: invite.code, inline: true },
            ...(invite.channel ? [{ name: 'Channel', value: `${invite.channel}`, inline: true }] : []),
        ]).catch(() => {});
    },
};
