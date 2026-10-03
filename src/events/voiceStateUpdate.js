const { Events } = require('discord.js');
const { logEvent } = require('../utils/eventlog');
const voicemaster = require('../utils/voicemaster');
const logger = require('../utils/logger');

// Voice join/leave/move — one "Voice activity" event type.
module.exports = {
    name: Events.VoiceStateUpdate,
    execute(oldState, newState, client) {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        // VoiceMaster — trigger joins spawn a personal channel, vacated
        // ones get cleaned up. Fire-and-forget next to the logging below.
        voicemaster
            .handleVoiceUpdate(oldState, newState)
            .catch((e) => logger.warn(`voicemaster: ${e.message}`));

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
