const db = require('../utils/database');

// Guild-only blacklist — `blacklisted_guilds` is the single source of truth.
// The bot enforces it in messageCreate/guildCreate; the dashboard blocks
// access here. No user-level blacklist exists anywhere in this system.

module.exports = {
    isGuildBlacklisted: (id) => db.isGuildBlacklisted(id),
    list: () => db.listBlacklistedGuilds(),
    add: (guildId, reason, developerId) => db.blacklistGuild(guildId, reason, developerId),
    remove: (guildId) => db.unblacklistGuild(guildId),
};
