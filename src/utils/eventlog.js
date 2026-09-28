const config = require('../config');
const db = require('./database');
const logger = require('./logger');
const { base, cv2 } = require('../helpers/embeds');

// Server event log — separate from modlog (which covers punishments).
// Every type has its own toggle in settings.logging.events and can route to
// its own channel via settings.logging.channels[type]; both fall back to the
// default channel / legacy grouped flags on older documents.
// Distinct from welcome/goodbye, which are member-facing announcements.

const TYPES = {
    // Messages
    messageDelete: { legacy: 'messageDelete', title: 'Message deleted', color: 'error' },
    messageEdit: { legacy: 'messageEdit', title: 'Message edited', color: 'warning' },
    bulkDelete: { legacy: 'messageDelete', title: 'Messages purged', color: 'error' },
    // Members
    memberJoin: { legacy: 'joinLeave', title: 'Member joined', color: 'success' },
    memberLeave: { legacy: 'joinLeave', title: 'Member left', color: 'warning' },
    memberUpdate: { title: 'Member updated', color: 'warning' },
    banAdd: { title: 'Member banned', color: 'error' },
    banRemove: { title: 'Member unbanned', color: 'success' },
    // Channels
    channelCreate: { legacy: 'channelEvents', title: 'Channel created', color: 'success' },
    channelDelete: { legacy: 'channelEvents', title: 'Channel deleted', color: 'error' },
    channelUpdate: { title: 'Channel updated', color: 'warning' },
    threadCreate: { title: 'Thread created', color: 'success' },
    threadDelete: { title: 'Thread deleted', color: 'error' },
    // Roles & server
    roleCreate: { title: 'Role created', color: 'success' },
    roleDelete: { title: 'Role deleted', color: 'error' },
    roleUpdate: { title: 'Role updated', color: 'warning' },
    emojiCreate: { title: 'Emoji added', color: 'success' },
    emojiDelete: { title: 'Emoji removed', color: 'error' },
    inviteCreate: { title: 'Invite created', color: 'success' },
    inviteDelete: { title: 'Invite deleted', color: 'error' },
    voiceState: { title: 'Voice activity', color: 'main' },
};

// The authoritative list of loggable types, grouped for the dashboard.
const GROUPS = {
    Messages: ['messageDelete', 'messageEdit', 'bulkDelete'],
    Members: ['memberJoin', 'memberLeave', 'memberUpdate', 'banAdd', 'banRemove'],
    Channels: ['channelCreate', 'channelDelete', 'channelUpdate', 'threadCreate', 'threadDelete'],
    'Roles & server': ['roleCreate', 'roleDelete', 'roleUpdate', 'emojiCreate', 'emojiDelete', 'inviteCreate', 'inviteDelete', 'voiceState'],
};

// Whether a type is enabled — per-event flag first, then the legacy grouped
// toggle for docs written before per-event flags existed.
const isOn = (log, type, meta) =>
    log.events?.[type] ?? (meta.legacy ? !!log[meta.legacy] : false);

async function logEvent(client, guildId, type, fields) {
    try {
        const meta = TYPES[type];
        if (!meta) return;
        const settings = await db.getGuildSettings(guildId);
        const log = settings?.logging;
        if (!log || !isOn(log, type, meta)) return;

        // Log-per-channel: an event can route to its own channel, else the main one.
        const channelId = log.channels?.[type] || log.channel;
        if (!channelId) return;
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased()) return;

        const container = base({
            color: config.colors[meta.color] || config.colors.main,
            title: meta.title,
            fields,
            footer: { text: `<t:${Math.floor(Date.now() / 1000)}:f>` },
        });
        await channel.send(cv2(container));
    } catch (err) {
        logger.warn(`eventlog ${type} failed for ${guildId}: ${err.message}`);
    }
}

module.exports = { logEvent, TYPES, GROUPS };
