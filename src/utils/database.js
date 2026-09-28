const path = require('path');
const { Keyv } = require('keyv');
const SqliteStore = require('./sqliteStore');
const logger = require('./logger');

// Storage layer for Kotan.
//
// Each data domain gets its own Keyv instance (and therefore its own key
// namespace). If REDIS_URL is set all namespaces share one Redis connection;
// otherwise everything goes into a single SQLite file at data/kotan.sqlite
// via Node's built-in node:sqlite — no external services required.

let sharedRedis = null;
let sharedDb = null;

function createStore(namespace) {
    if (process.env.REDIS_URL) {
        if (!sharedRedis) {
            const KeyvRedis = require('@keyv/redis').default;
            sharedRedis = new KeyvRedis(process.env.REDIS_URL);
            logger.info('Database: using Redis backend');
        }
        return new Keyv({ store: sharedRedis, namespace });
    }
    if (!sharedDb) {
        sharedDb = SqliteStore.connect(path.join(__dirname, '..', '..', 'data', 'kotan.sqlite'));
        logger.info('Database: using SQLite backend (data/kotan.sqlite)');
    }
    return new Keyv({ store: new SqliteStore(sharedDb), namespace });
}

const profiles = createStore('economy');
const warns = createStore('warns');
const tempbans = createStore('tempbans');
const guilds = createStore('guilds');
const usage = createStore('usage');
const tags = createStore('tags');
const audit = createStore('audit');
const meta = createStore('meta'); // process heartbeat for the website's status page
const sessions = createStore('sessions'); // website login sessions
const tickets = createStore('tickets');   // open ticket channels per guild

// A store error (Redis disconnect, disk failure) must never crash the process.
// @keyv/redis reconnects automatically; SQLite is in-process and won't drop.
for (const store of [profiles, warns, tempbans, guilds, usage, tags, audit, meta, sessions, tickets]) {
    store.on('error', (err) => logger.error(`Storage error in "${store.namespace}":`, err));
}
if (sharedRedis) sharedRedis.on('error', (err) => logger.error('Redis error:', err));

const key = (guildId, userId) => `${guildId}:${userId}`;

// ---------- per-guild settings ----------

// Short TTL cache: keeps per-message settings reads cheap. Writes through
// saveGuildSettings drop the entry immediately; the TTL is just a backstop
// for edits made by other tools/processes sharing the SQLite file.
const settingsCache = new Map();
const SETTINGS_TTL = 30_000;

// modules[category] === false disables a whole category; missing = enabled.
// disabledCommands lists individually disabled command names.
const DEFAULT_SETTINGS = {
    prefix: null,
    modules: {},
    disabledCommands: [],
    modlogChannel: null,
    automod: {
        antiInvite: false,
        blacklist: [],      // substrings — any hit deletes the message
        spamMax: 0,         // max messages per window; 0 = off
        spamWindow: 5,      // seconds
        raidMax: 0,         // joins per window that trigger a raid alert; 0 = off
        raidWindow: 10,     // seconds
        raidAction: 'alert',// 'alert' (modlog) | 'kick' (kick the joiner)
        exemptRoles: [],    // role ids automod never flags
        exemptChannels: [], // channel ids automod never scans
    },
    logging: {
        channel: null,          // null = logging off
        channels: {},           // event type -> channelId override (log-per-channel)
        events: {},             // event type -> bool; {} falls back to the legacy flags
        messageDelete: false,
        messageEdit: false,
        joinLeave: false,
        channelEvents: false,
    },
    welcome: {
        channel: null,      // welcome off when null
        message: 'Welcome {user} to {server}! You are member #{members}.',
        // optional rich card — when enabled, replaces the plain message
        // style: 'embed' (classic embed) | 'cv2' (Kotan container)
        embed: { enabled: false, style: 'embed', title: '', description: '', color: '', footer: '', thumbnail: true, components: [] },
        goodbyeChannel: null,
        goodbyeMessage: '**{username}** left {server}.',
        goodbyeEmbed: { enabled: false, style: 'embed', title: '', description: '', color: '', footer: '', thumbnail: true, components: [] },
    },
    roles: {
        autorole: null,     // role id granted on join
        reactionRoles: [],  // [{ channelId, messageId, emoji, roleId }]
    },
    economy: {
        currency: null,     // null -> config.economy.currency
        dailyBase: null,    // null -> config.economy.daily.base
        dailyStreak: null,  // null -> config.economy.daily.streakBonus
        dailyMaxStreak: null, // null -> config.economy.daily.maxStreakBonus
        startBalance: null, // wallet for new profiles; null -> 0
        shop: [],           // [{id,name,price,description}] — overrides config.shop when set
    },
    // Game tuning — prizes and wager limits.
    games: {
        guessReward: 150,   // flat payout for .guess
        scrambleReward: 200,// flat payout for .scramble
        winMultiplier: 1,   // scales wager wins (1 = bet back x2 net, standard)
        maxBet: 0,          // cap on wagers; 0 = unlimited
        per: {},            // game name -> {reward,maxBet,winMultiplier} overrides
    },
    // Server-boost perks — fires on premium_since appearing.
    boosts: {
        channel: null,      // boost announcement channel; null = off
        message: '{user} just boosted {server}! 🚀',
        roleId: null,       // role granted to boosters
    },
    // Per-guild dashboard theming — applies when viewing this guild's panel.
    appearance: {
        accent: '',         // hex color; '' = default accent
        background: '',     // image URL behind the shell; '' = none
    },
    // Bot presence inside this guild.
    branding: {
        nickname: '',       // bot nickname here; '' = default name
    },
    // Ticket system — CV2 panel posted anywhere, topic dropdown opens a
    // private channel under the configured category.
    tickets: {
        enabled: false,
        categoryId: null,       // parent category for ticket channels
        logChannel: null,       // open/close announcements; null = silent
        supportRoles: [],       // roles that see and manage tickets
        maxOpen: 1,             // open tickets per member
        naming: 'ticket-{user}',// channel name template — {user} {count}
        topics: [],             // [{name, desc}] — the panel dropdown (max 10)
        panel: { enabled: true, style: 'cv2', title: 'Support', description: 'Pick a topic below to open a ticket.', color: '', footer: '', thumbnail: false, components: [] },
    },
    leveling: {
        enabled: false,
        xpMin: 15,          // xp granted per message, random between min/max
        xpMax: 25,
        cooldown: 60,       // seconds between xp gains per member
        multiplier: 1,      // scales every gain
        announce: true,     // level-up announcements
        channel: null,      // level-up channel; null = the channel they leveled in
        message: 'GG {user} — you reached **level {level}**!',
        rewards: [],        // [{ level, roleId }] granted when reaching a level
    },
    // Dashboard access control — who may view/edit each section.
    access: {
        modRoles: [],       // member holding any -> 'mod' tier
        adminRoles: [],     // member holding any -> 'admin' tier
        // slug -> 'member'|'mod'|'admin'|'manager'. Missing = 'manager'
        // (current behavior: only Discord-manageable users reach pages).
        sections: {},
    },
    // CV2 item shop — homepage text plus three fixed-effect categories.
    shop: {
        enabled: true,
        title: 'Shop',
        description: 'Spend your coins on boosts and goodies.',
        color: '',              // accent hex; '' = brand color
        categories: {
            dynamic:     { name: 'Items',          items: [] }, // [{name,desc,price}]
            multipliers: { name: 'Boosters',       items: [] }, // [{name,desc,price,kind:'coins'|'xp',mult,mins}]
            roles:       { name: 'Roles & Crates', items: [] }, // [{name,desc,price,type:'role'|'crate',roleId|min,max}]
        },
    },
    // Discord roles allowed to use each command module. Empty = everyone.
    moduleRoles: {},        // category -> [roleIds]
    // Channels a module may be used in. Empty = anywhere.
    moduleChannels: {},     // category -> [channelIds]
    // Scoped disables: a command blocked in a channel and/or a time window.
    // { command, channelId|null, start|'HH:MM'|null, end|'HH:MM'|null, tz }
    commandRules: [],
    overview: {
        // which stat cards show on Overview, in display order
        cards: ['members', 'commands', 'warns', 'tempbans'],
    },
};

// Nested sections must merge key-by-key — a saved doc written before a new
// sub-key existed shouldn't lose the defaults.
const NESTED = ['automod', 'logging', 'welcome', 'roles', 'economy', 'leveling', 'access', 'overview', 'games', 'boosts', 'appearance', 'branding', 'shop', 'tickets'];

async function getGuildSettings(guildId) {
    const hit = settingsCache.get(guildId);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = { ...DEFAULT_SETTINGS, ...(await guilds.get(guildId)) };
    for (const k of NESTED) value[k] = { ...DEFAULT_SETTINGS[k], ...(value[k] || {}) };
    value.welcome.embed = { ...DEFAULT_SETTINGS.welcome.embed, ...(value.welcome.embed || {}) };
    value.welcome.goodbyeEmbed = { ...DEFAULT_SETTINGS.welcome.goodbyeEmbed, ...(value.welcome.goodbyeEmbed || {}) };
    settingsCache.set(guildId, { value, expires: Date.now() + SETTINGS_TTL });
    return value;
}

async function saveGuildSettings(guildId, settings) {
    await guilds.set(guildId, settings);
    settingsCache.delete(guildId);
    return settings;
}

// ---------- audit trail ----------

const AUDIT_KEEP = 30;

// Records who changed which settings section.
async function logAudit(guildId, userId, section) {
    const list = (await audit.get(guildId)) || [];
    list.unshift({ userId, section, at: Date.now() });
    await audit.set(guildId, list.slice(0, AUDIT_KEEP));
}

async function getAudit(guildId, limit = 15) {
    return ((await audit.get(guildId)) || []).slice(0, limit);
}

// ---------- guild stats ----------

const DAY = 86_400_000;
const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
const USAGE_KEEP_DAYS = 45;

// Counts this-vs-previous-week totals out of a { 'YYYY-MM-DD': n } map.
function weekDelta(perDay) {
    const today = dayKey(Date.now());
    const weekStart = dayKey(Date.now() - 6 * DAY); // last 7 days incl. today
    const prevStart = dayKey(Date.now() - 13 * DAY);
    let week = 0;
    let prevWeek = 0;
    for (const [k, v] of Object.entries(perDay)) {
        if (k >= weekStart && k <= today) week += v;
        else if (k >= prevStart && k < weekStart) prevWeek += v;
    }
    return { week, prevWeek };
}

// One doc per guild: all-time per-command counts + per-day buckets for
// trends. Written fire-and-forget from messageCreate — never on a hot path.
async function trackCommandUse(guildId, commandName, userId) {
    const data = (await usage.get(guildId)) || { commands: {}, daily: {}, recent: [] };
    data.commands[commandName] = (data.commands[commandName] || 0) + 1;
    const day = (data.daily[dayKey(Date.now())] ||= {});
    day[commandName] = (day[commandName] || 0) + 1;
    const cutoff = dayKey(Date.now() - USAGE_KEEP_DAYS * DAY);
    for (const k of Object.keys(data.daily)) if (k < cutoff) delete data.daily[k];
    // Ring of the latest invocations for the Overview activity feed.
    data.recent = data.recent || [];
    data.recent.unshift({ cmd: commandName, userId, at: Date.now() });
    if (data.recent.length > 10) data.recent.length = 10;
    await usage.set(guildId, data);
}

// Last `days` daily totals + week-over-week delta + top commands.
async function getCommandUsage(guildId, days = 14) {
    const data = (await usage.get(guildId)) || { commands: {}, daily: {} };
    const perDay = {};
    for (const [k, cmds] of Object.entries(data.daily)) {
        perDay[k] = Object.values(cmds).reduce((a, b) => a + b, 0);
    }
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
        const k = dayKey(Date.now() - i * DAY);
        series.push({ date: k, count: perDay[k] || 0 });
    }
    return {
        total: Object.values(data.commands).reduce((a, b) => a + b, 0),
        top: Object.entries(data.commands)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([name, count]) => ({ name, count })),
        series,
        recent: data.recent || [],
        ...weekDelta(perDay),
    };
}

// Daily member-count snapshot per guild, kept alongside usage. Called from a
// periodic sweep and on join/leave — writes only when the count changed.
async function trackMemberCount(guildId, count) {
    if (!Number.isFinite(count)) return;
    const key = `${guildId}:members`;
    const data = (await usage.get(key)) || { days: {} };
    const today = dayKey(Date.now());
    if (data.days[today] === count) return;
    data.days[today] = count;
    data.latest = count;
    const cutoff = dayKey(Date.now() - USAGE_KEEP_DAYS * DAY);
    for (const k of Object.keys(data.days)) if (k < cutoff) delete data.days[k];
    await usage.set(key, data);
}

// Member-count series. Days with no
// snapshot carry the last known count forward; before the first snapshot they
// backfill it, so the line spans the whole window.
async function getMemberGrowth(guildId, days = 14) {
    const data = (await usage.get(`${guildId}:members`)) || { days: {} };
    const series = [];
    let last = null;
    for (let i = days - 1; i >= 0; i--) {
        const k = dayKey(Date.now() - i * DAY);
        if (data.days[k] != null) last = data.days[k];
        series.push(last);
    }
    const firstKnown = series.find((v) => v != null);
    if (firstKnown == null) return { series: new Array(days).fill(0), latest: null, pct: null };
    for (let i = 0; i < series.length && series[i] == null; i++) series[i] = firstKnown;
    const latest = series[series.length - 1];
    const pct = firstKnown > 0 ? Math.round(((latest - firstKnown) / firstKnown) * 1000) / 10 : null;
    return { series, latest, pct };
}

// Warns + tempbans bucketed by day for the Mod Log chart. Records carry `at`
// timestamps; older tempbans without one count toward totals only.
async function getModActivity(guildId, days = 14) {
    const warnDays = {};
    const banDays = {};
    let warnsTotal = 0;
    let tempbansTotal = 0;
    for await (const [k, list] of warns.iterator()) {
        if (!k.startsWith(`${guildId}:`) || !Array.isArray(list)) continue;
        warnsTotal += list.length;
        for (const w of list) {
            if (w.at) warnDays[dayKey(w.at)] = (warnDays[dayKey(w.at)] || 0) + 1;
        }
    }
    for await (const ban of iterateTempbans()) {
        if (ban.guildId !== guildId) continue;
        tempbansTotal++;
        if (ban.at) banDays[dayKey(ban.at)] = (banDays[dayKey(ban.at)] || 0) + 1;
    }
    const series = [];
    for (let i = days - 1; i >= 0; i--) {
        const k = dayKey(Date.now() - i * DAY);
        series.push({ date: k, warns: warnDays[k] || 0, tempbans: banDays[k] || 0 });
    }
    const w = weekDelta(warnDays);
    const t = weekDelta(banDays);
    return {
        days: series,
        warnsTotal,
        tempbansTotal,
        warnsWeek: w.week,
        warnsPrevWeek: w.prevWeek,
        tempbansWeek: t.week,
        tempbansPrevWeek: t.prevWeek,
    };
}

// ---------- economy ----------

const DEFAULT_PROFILE = {
    wallet: 0,
    lastDaily: 0,
    dailyStreak: 0,
    inventory: {},  // itemId -> qty owned
    mults: {},      // 'coins'|'xp' -> { mult, until } timed boosters
    xp: 0,      // progress toward the next level
    level: 0,
    lastXp: 0,  // timestamp of last xp gain (cooldown)
};

async function getProfile(guildId, userId) {
    const profile = await profiles.get(key(guildId, userId));
    if (profile) return { ...DEFAULT_PROFILE, ...profile };
    // New member — seed the wallet with the guild's configured start balance.
    const start = (await getGuildSettings(guildId).catch(() => null))?.economy?.startBalance ?? 0;
    return { ...DEFAULT_PROFILE, wallet: start };
}

async function saveProfile(guildId, userId, profile) {
    await profiles.set(key(guildId, userId), profile);
    return profile;
}

// Leaderboards — iterate the guild's profiles and rank them. Fine at guild
// scale; both commands are cooldown-gated.
async function getTopLevels(guildId, limit = 10) {
    const rows = [];
    for await (const [k, p] of profiles.iterator()) {
        if (!k.startsWith(`${guildId}:`) || !p) continue;
        rows.push({ userId: k.slice(guildId.length + 1), level: p.level || 0, xp: p.xp || 0 });
    }
    return rows.sort((a, b) => b.level - a.level || b.xp - a.xp).slice(0, limit);
}

async function getTopRich(guildId, limit = 10) {
    const rows = [];
    for await (const [k, p] of profiles.iterator()) {
        if (!k.startsWith(`${guildId}:`) || !p) continue;
        rows.push({
            userId: k.slice(guildId.length + 1),
            total: p.wallet || 0,
        });
    }
    return rows.sort((a, b) => b.total - a.total).slice(0, limit);
}

// Latest warns + tempbans merged by timestamp — feeds the Overview
// "recent activity" list. Records without `at` (pre-timestamp data) are skipped.
async function getRecentModActions(guildId, limit = 5) {
    const out = [];
    for await (const [k, list] of warns.iterator()) {
        if (!k.startsWith(`${guildId}:`) || !Array.isArray(list)) continue;
        const targetId = k.slice(guildId.length + 1);
        for (const w of list) {
            if (w.at)
                out.push({ type: 'warn', userId: targetId, moderatorId: w.moderatorId, reason: w.reason, at: w.at });
        }
    }
    for await (const b of iterateTempbans()) {
        if (b.guildId === guildId && b.at)
            out.push({ type: 'tempban', userId: b.userId, moderatorId: b.moderatorId, reason: b.reason, at: b.at });
    }
    return out.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---------- warns ----------

async function getWarns(guildId, userId) {
    return (await warns.get(key(guildId, userId))) || [];
}

async function addWarn(guildId, userId, data) {
    const list = await getWarns(guildId, userId);
    const warn = {
        id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        reason: data.reason,
        moderatorId: data.moderatorId,
        at: Date.now(),
    };
    list.push(warn);
    await warns.set(key(guildId, userId), list);
    return warn;
}

// Returns the removed warn, or null when the id did not exist.
async function deleteWarn(guildId, userId, warnId) {
    const list = await getWarns(guildId, userId);
    const index = list.findIndex((w) => w.id === warnId);
    if (index === -1) return null;
    const [removed] = list.splice(index, 1);
    await warns.set(key(guildId, userId), list);
    return removed;
}

async function clearWarns(guildId, userId) {
    const list = await getWarns(guildId, userId);
    await warns.delete(key(guildId, userId));
    return list.length;
}

// ---------- tempbans ----------

async function setTempban(guildId, userId, data) {
    await tempbans.set(key(guildId, userId), {
        guildId,
        userId,
        unbanAt: data.unbanAt,
        moderatorId: data.moderatorId,
        reason: data.reason,
        at: Date.now(),
    });
}

async function removeTempban(guildId, userId) {
    await tempbans.delete(key(guildId, userId));
}

// Yields every stored tempban. Callers decide which ones are expired so the
// same iterator can be reused for different checks.
async function* iterateTempbans() {
    for await (const [, value] of tempbans.iterator()) {
        if (value && value.guildId) yield value;
    }
}

// ---------- guild blacklist (developer-controlled) ----------

// Single source of truth: the blacklisted_guilds table (written by the
// website's /api/admin/blacklist route). Guild-level only — no user
// blacklist exists anywhere. Short TTL cache keeps the check off the hot
// path; Redis-mode deployments have no table and fall through unblocked.
let blCheck = null;
const blCache = new Map();
const BL_TTL = 30_000;

function isGuildBlacklisted(guildId) {
    if (!guildId || !sharedDb) return false;
    if (!blCheck)
        blCheck = sharedDb.prepare('SELECT 1 FROM blacklisted_guilds WHERE guild_id = ?');
    const hit = blCache.get(guildId);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = !!blCheck.get(guildId);
    blCache.set(guildId, { value, expires: Date.now() + BL_TTL });
    return value;
}

// Admin writes from the website — same table the gate above reads. The TTL
// cache is dropped on write so enforcement is immediate. No-ops under a Redis
// backend (no SQLite table exists there).
function blacklistGuild(guildId, reason, developerId) {
    if (!sharedDb) return false;
    sharedDb.prepare(
        'INSERT INTO blacklisted_guilds (guild_id, reason, blacklisted_by, blacklisted_at) VALUES (?, ?, ?, ?) ' +
        'ON CONFLICT(guild_id) DO UPDATE SET reason = excluded.reason, blacklisted_by = excluded.blacklisted_by, blacklisted_at = excluded.blacklisted_at'
    ).run(String(guildId), String(reason), String(developerId), Date.now());
    blCache.delete(String(guildId));
    return true;
}

function unblacklistGuild(guildId) {
    if (!sharedDb) return false;
    const { changes } = sharedDb.prepare('DELETE FROM blacklisted_guilds WHERE guild_id = ?').run(String(guildId));
    blCache.delete(String(guildId));
    return changes > 0;
}

function listBlacklistedGuilds() {
    if (!sharedDb) return [];
    return sharedDb.prepare(
        'SELECT guild_id, reason, blacklisted_by, blacklisted_at FROM blacklisted_guilds ORDER BY blacklisted_at DESC'
    ).all();
}

// ---------- heartbeat (website status page reads this) ----------

const UPTIME_LOG_CAP = 1440; // one sample per minute = 24h

// Writes a liveness record the website reads through the shared DB —
// the site has no other channel into this process.
async function writeHeartbeat(client) {
    const now = Date.now();
    await meta.set('heartbeat', {
        at: now,
        guilds: client.guilds.cache.size,
        users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
        ping: Math.round(client.ws.ping),
        memoryMB: Math.round(process.memoryUsage().rss / 1048576),
    });
    // Ring of minute-bucketed heartbeat timestamps -> real uptime history.
    const minute = Math.floor(now / 60_000);
    const log = (await meta.get('uptimeLog')) || [];
    if (log[log.length - 1] !== minute) log.push(minute);
    if (log.length > UPTIME_LOG_CAP) log.splice(0, log.length - UPTIME_LOG_CAP);
    await meta.set('uptimeLog', log);
}

async function getHeartbeat() {
    return {
        heartbeat: (await meta.get('heartbeat')) || null,
        uptimeLog: (await meta.get('uptimeLog')) || [],
    };
}

// ---------- custom commands (tags) ----------

// One doc per guild: { name: { content, authorId, uses, at } }. Tags are
// invoked like "<prefix><name>" when no builtin command matches.
const TAG_NAME = /^[a-z0-9_-]{1,32}$/;

async function getTags(guildId) {
    return (await tags.get(guildId)) || {};
}

async function getTag(guildId, name) {
    return (await getTags(guildId))[name] || null;
}

async function addTag(guildId, name, content, authorId, trigger = false) {
    if (!TAG_NAME.test(name)) return null;
    const all = await getTags(guildId);
    // trigger: the tag fires on a bare first word, no prefix needed
    all[name] = { content: String(content).slice(0, 1000), authorId, uses: 0, at: Date.now(), trigger: !!trigger };
    await tags.set(guildId, all);
    return all[name];
}

async function deleteTag(guildId, name) {
    const all = await getTags(guildId);
    if (!all[name]) return false;
    delete all[name];
    await tags.set(guildId, all);
    return true;
}

// Returns the tag content and bumps its use counter. `triggerOnly` restricts
// to tags flagged as bare-word triggers (fires without a prefix).
async function useTag(guildId, name, triggerOnly = false) {
    const all = await getTags(guildId);
    const tag = all[name];
    if (!tag || (triggerOnly && !tag.trigger)) return null;
    tag.uses = (tag.uses || 0) + 1;
    await tags.set(guildId, all);
    return tag.content;
}

// ---------- tickets ----------

// Open ticket state per guild: counter, channel records and a user->channel
// index so the per-member cap is cheap to enforce.
async function getTickets(guildId) {
    return (await tickets.get(guildId)) || { count: 0, byUser: {}, channels: {} };
}

async function saveTickets(guildId, data) {
    await tickets.set(guildId, data);
    return data;
}

// Flushes and closes the storage backends — called on graceful shutdown so
// no writes are lost (WAL checkpoint) and Redis disconnects cleanly.
async function closeDatabase() {
    try {
        if (sharedDb) {
            sharedDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            sharedDb.close();
        }
        if (sharedRedis) await sharedRedis.disconnect();
    } catch (err) {
        logger.error('Error while closing database:', err);
    }
}

module.exports = {
    closeDatabase,
    getProfile,
    saveProfile,
    getTopLevels,
    getTopRich,
    getRecentModActions,
    logAudit,
    getAudit,
    getWarns,
    addWarn,
    deleteWarn,
    clearWarns,
    setTempban,
    removeTempban,
    iterateTempbans,
    getGuildSettings,
    saveGuildSettings,
    trackCommandUse,
    getCommandUsage,
    trackMemberCount,
    getMemberGrowth,
    getModActivity,
    getTags,
    getTag,
    addTag,
    deleteTag,
    useTag,
    getTickets,
    saveTickets,
    isGuildBlacklisted,
    blacklistGuild,
    unblacklistGuild,
    listBlacklistedGuilds,
    writeHeartbeat,
    getHeartbeat,
    sessions,
};
