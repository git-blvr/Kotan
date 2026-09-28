const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');

// Voice join/leave/move — one "Voice activity" event type.
module.exports = {
    name: Events.VoiceStateUpdate,
    execute(oldState, newState, client) {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;
        const fields = [{ name: 'Member', value: `${member.user.tag} (${member.id})`, inline: true }];
        if (!oldState.channelId && newState.channelId)
            fields.push({ name: 'Joined', value: `${newState.channel}`, inline: true });
        else if (oldState.channelId && !newState.channelId)
            fields.push({ name: 'Left', value: `${oldState.channel}`, inline: true });
        else if (oldState.channelId !== newState.channelId)
            fields.push({ name: 'Moved', value: `${oldState.channel} → ${newState.channel}`, inline: true });
        else return; // mute/deafen flips — too noisy to log
        logEvent(client, newState.guild.id, 'voiceState', fields).catch(() => {});
    },
};
