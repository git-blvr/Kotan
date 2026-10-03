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

// Records each guild's member count.
function snapshotMemberCounts(client) {
    for (const guild of client.guilds.cache.values())
        db.trackMemberCount(guild.id, guild.memberCount).catch(() => {});
}

// Liveness record for the website's /uptime page — one write per minute.
function heartbeat(client) {
    db.writeHeartbeat(client).catch((err) => logger.warn('Heartbeat write failed:', err.message));
}

// Credits one voice minute to every member connected to a voice channel,
// then flushes the activity buffer — one minute granularity for the
// dashboard's voice leaderboard, no per-event bookkeeping needed.
function sweepVoice(client) {
    for (const guild of client.guilds.cache.values()) {
        const ids = [];
        for (const vs of guild.voiceStates.cache.values())
            if (vs.channelId && !vs.member?.user.bot) ids.push(vs.id);
        if (ids.length) db.trackVoiceMinutes(guild.id, ids);
    }
    db.flushActivity().catch(() => {});
}

function startTasks(client) {
    checkExpiredTempbans(client).catch((err) => logger.error('Tempban check failed', err));
    // Reconcile voicemaster state after a restart — drop records for gone
    // channels, delete empty managed ones. Delayed: voice states stream in
    // via GUILD_CREATE after ready, so an early sweep would see occupied
    // channels as empty and delete them.
    const vmp = setTimeout(() => require('./voicemaster').prune(client).catch((err) => logger.warn(`voicemaster prune failed: ${err.message}`)), 20_000);
    vmp.unref?.();
    snapshotMemberCounts(client);
    heartbeat(client);
    const interval = setInterval(
        () => checkExpiredTempbans(client).catch((err) => logger.error('Tempban check failed', err)),
        60_000
    );
    interval.unref?.();
    const memberSnap = setInterval(() => snapshotMemberCounts(client), 30 * 60_000);
    memberSnap.unref?.();
    const hb = setInterval(() => heartbeat(client), 60_000);
    hb.unref?.();
    sweepVoice(client);
    const act = setInterval(() => sweepVoice(client), 60_000);
    act.unref?.();
}

module.exports = { startTasks, checkExpiredTempbans };
