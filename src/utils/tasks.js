const db = require('./database');
const logger = require('./logger');

// Background jobs that keep running for the lifetime of the bot process.

// Unbans users whose tempban has expired. Each cluster only touches guilds it
// actually owns (client.guilds.cache), so with multiple clusters the job is
// naturally partitioned and never fights itself.
async function checkExpiredTempbans(client) {
    const now = Date.now();
    for await (const ban of db.iterateTempbans()) {
        if (ban.unbanAt > now) continue;
        const guild = client.guilds.cache.get(ban.guildId);
        if (!guild) continue; // another cluster owns this guild
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

function startTasks(client) {
    checkExpiredTempbans(client).catch((err) => logger.error('Tempban check failed', err));
    const interval = setInterval(
        () => checkExpiredTempbans(client).catch((err) => logger.error('Tempban check failed', err)),
        60_000
    );
    interval.unref?.();
}

module.exports = { startTasks, checkExpiredTempbans };
