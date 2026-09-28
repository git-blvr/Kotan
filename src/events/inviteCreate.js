const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

module.exports = {
    name: Events.InviteCreate,
    execute(invite, client) {
        logEvent(client, invite.guild?.id, 'inviteCreate', [
            { name: 'Code', value: invite.code, inline: true },
            ...(invite.inviter ? [{ name: 'By', value: `${invite.inviter}`, inline: true }] : []),
            ...(invite.channel ? [{ name: 'Channel', value: `${invite.channel}`, inline: true }] : []),
        ]).catch(() => {});
    },
};
