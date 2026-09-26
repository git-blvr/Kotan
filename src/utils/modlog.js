const config = require('../config');
const db = require('./database');
const logger = require('./logger');
const { base, cv2 } = require('../helpers/embeds');

// Sends a moderation log entry to the guild's configured modlog channel
// (per-guild setting). Silently no-ops when not configured.

async function logModAction(client, guildId, { action, target, moderator, reason, extra }) {
    try {
        const settings = await db.getGuildSettings(guildId);
        if (!settings?.modlogChannel) return;

        const channel = await client.channels.fetch(settings.modlogChannel).catch(() => null);
        if (!channel?.isTextBased()) return;

        const fields = [
            { name: 'Target', value: String(target), inline: true },
            { name: 'Moderator', value: String(moderator), inline: true },
        ];
        if (reason) fields.push({ name: 'Reason', value: reason });
        if (extra) fields.push({ name: 'Details', value: extra });

        const container = base({
            color: config.colors.warning,
            title: `Mod action — ${action}`,
            fields,
            footer: { text: `<t:${Math.floor(Date.now() / 1000)}:f>` },
        });
        await channel.send(cv2(container));
    } catch (err) {
        logger.warn(`modlog send failed for ${guildId}: ${err.message}`);
    }
}

module.exports = { logModAction };
