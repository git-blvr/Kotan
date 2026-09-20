const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const db = require('./database');
const logger = require('./logger');

// Sends a moderation log entry to the guild's configured modlog channel
// (settable from the web dashboard). Silently no-ops when not configured.

async function logModAction(client, guildId, { action, target, moderator, reason, extra }) {
    try {
        const settings = await db.getGuildSettings(guildId);
        if (!settings?.modlogChannel) return;

        const channel = await client.channels.fetch(settings.modlogChannel).catch(() => null);
        if (!channel?.isTextBased()) return;

        const embed = new EmbedBuilder()
            .setColor(config.colors.warning)
            .setTitle(`Mod action — ${action}`)
            .setTimestamp()
            .addFields(
                { name: 'Target', value: String(target), inline: true },
                { name: 'Moderator', value: String(moderator), inline: true }
            );
        if (reason) embed.addFields({ name: 'Reason', value: reason });
        if (extra) embed.addFields({ name: 'Details', value: extra });

        await channel.send({ embeds: [embed] });
    } catch (err) {
        logger.warn(`modlog send failed for ${guildId}: ${err.message}`);
    }
}

module.exports = { logModAction };
