const db = require('./database');
const logger = require('./logger');

// Background jobs that keep running for the lifetime of the bot process.

// Unbans users whose tempban has expired. Only touches guilds this process
// actually has cached — a record for a guild we're not in is simply skipped.
async function checkExpiredTempbans(client) {
    const now = Date.now();
    for await (const ban of db.iterateTempbans()) {
        if (ban.unbanAt > now) continue;
        const guild = client.guilds.cache.get(ban.guildId);
        if (!guild) continue; // guild not on this process
        try {
            await guild.members.unban(ban.userId, 'Tempban expired');
            logger.info(`Tempban expired: unbanned ${ban.userId} in ${ban.guildId}`);
        } catch (err) {
            // Unknown ban / missing access — the record is useless either way.
            logger.warn(`Could not unban ${ban.userId} in ${ban.guildId}: ${err.message}`);
        }
        await db.removeTempban(ban.guildId, ban.userId);
    }
}

// Records each guild's member count so the dashboard can chart growth.
function snapshotMemberCounts(client) {
    for (const guild of client.guilds.cache.values())
        db.trackMemberCount(guild.id, guild.memberCount).catch(() => {});
}

function startTasks(client) {
    checkExpiredTempbans(client).catch((err) => logger.error('Tempban check failed', err));
    snapshotMemberCounts(client);
    const interval = setInterval(
        () => checkExpiredTempbans(client).catch((err) => logger.error('Tempban check failed', err)),
        60_000
    );
    interval.unref?.();
    const memberSnap = setInterval(() => snapshotMemberCounts(client), 30 * 60_000);
    memberSnap.unref?.();
}

module.exports = { startTasks, checkExpiredTempbans };
