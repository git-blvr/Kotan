const config = require('../config');
const db = require('./database');
const logger = require('./logger');
const { base, cv2 } = require('../helpers/embeds');

// Server event log — separate from modlog (which covers punishments).
// Posts to settings.logging.channel when the matching toggle is on.
// Distinct from welcome/goodbye, which are member-facing announcements.

const TYPES = {
    messageDelete: { flag: 'messageDelete', title: 'Message deleted', color: 'error' },
    messageEdit: { flag: 'messageEdit', title: 'Message edited', color: 'warning' },
    memberJoin: { flag: 'joinLeave', title: 'Member joined', color: 'success' },
    memberLeave: { flag: 'joinLeave', title: 'Member left', color: 'warning' },
    channelCreate: { flag: 'channelEvents', title: 'Channel created', color: 'success' },
    channelDelete: { flag: 'channelEvents', title: 'Channel deleted', color: 'error' },
};

async function logEvent(client, guildId, type, fields) {
    try {
        const meta = TYPES[type];
        if (!meta) return;
        const settings = await db.getGuildSettings(guildId);
        const log = settings?.logging;
        if (!log?.channel || !log[meta.flag]) return;

        const channel = await client.channels.fetch(log.channel).catch(() => null);
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

module.exports = { logEvent };
