const { Events } = require('discord.js');
const db = require('../utils/database');
const logger = require('../utils/logger');

// Auto-leave developer-blacklisted guilds — enforced at join time, so a
// blacklisted server can't re-invite the bot. Command-path silence is
// handled separately in messageCreate.

module.exports = {
    name: Events.GuildCreate,
    async execute(guild) {
        if (db.isGuildBlacklisted(guild.id)) {
            logger.warn(`Leaving blacklisted guild ${guild.name} (${guild.id})`);
            await guild.leave().catch((err) => logger.error(`Failed to leave ${guild.id}:`, err));
            return;
        }
        logger.info(`Joined guild "${guild.name}" (${guild.id}) — ${guild.memberCount} members`);
    },
};
