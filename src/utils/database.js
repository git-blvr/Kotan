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
const sessions = createStore('sessions');
const usage = createStore('usage');
const tags = createStore('tags');

// A store error (Redis disconnect, disk failure) must never crash the process.
// @keyv/redis reconnects automatically; SQLite is in-process and won't drop.
for (const store of [profiles, warns, tempbans, guilds, sessions, usage, tags]) {
    store.on('error', (err) => logger.error(`Storage error in "${store.namespace}":`, err));
}
if (sharedRedis) sharedRedis.on('error', (err) => logger.error('Redis error:', err));

const key = (guildId, userId) => `${guildId}:${userId}`;

// ---------- guild settings (dashboard) ----------

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
    },
    logging: {
        channel: null,          // null = logging off
        messageDelete: false,
        messageEdit: false,
        joinLeave: false,
        channelEvents: false,
    },
    welcome: {
        channel: null,      // welcome off when null
        message: 'Welcome {user} to {server}! You are member #{members}.',
        goodbyeChannel: null,
        goodbyeMessage: '**{username}** left {server}.',
    },
    roles: {
        autorole: null,     // role id granted on join
        reactionRoles: [],  // [{ channelId, messageId, emoji, roleId }]
    },
    economy: {
        currency: null,     // null -> config.economy.currency
        dailyBase: null,    // null -> config.economy.daily.base
    },
};

// Nested sections must merge key-by-key — a saved doc written before a new
// sub-key existed shouldn't lose the defaults.
const NESTED = ['automod', 'logging', 'welcome', 'roles', 'economy'];

async function getGuildSettings(guildId) {
    const hit = settingsCache.get(guildId);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = { ...DEFAULT_SETTINGS, ...(await guilds.get(guildId)) };
    for (const k of NESTED) value[k] = { ...DEFAULT_SETTINGS[k], ...(value[k] || {}) };
    settingsCache.set(guildId, { value, expires: Date.now() + SETTINGS_TTL });
    return value;
}

async function saveGuildSettings(guildId, settings) {
    await guilds.set(guildId, settings);
    settingsCache.delete(guildId);
    return settings;
}

// ---------- guild stats (dashboard) ----------

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
async function trackCommandUse(guildId, commandName) {
    const data = (await usage.get(guildId)) || { commands: {}, daily: {} };
    data.commands[commandName] = (data.commands[commandName] || 0) + 1;
    const day = (data.daily[dayKey(Date.now())] ||= {});
    day[commandName] = (day[commandName] || 0) + 1;
    const cutoff = dayKey(Date.now() - USAGE_KEEP_DAYS * DAY);
    for (const k of Object.keys(data.daily)) if (k < cutoff) delete data.daily[k];
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

// Member-count series for the dashboard sparkline + growth badge. Days with no
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

const DEFAULT_PROFILE = { wallet: 0, bank: 0, lastDaily: 0, dailyStreak: 0, inventory: {} };

async function getProfile(guildId, userId) {
    const profile = await profiles.get(key(guildId, userId));
    return { ...DEFAULT_PROFILE, ...(profile || {}) };
}

async function saveProfile(guildId, userId, profile) {
    await profiles.set(key(guildId, userId), profile);
    return profile;
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

async function addTag(guildId, name, content, authorId) {
    if (!TAG_NAME.test(name)) return null;
    const all = await getTags(guildId);
    all[name] = { content: String(content).slice(0, 1000), authorId, uses: 0, at: Date.now() };
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

// Returns the tag content and bumps its use counter.
async function useTag(guildId, name) {
    const all = await getTags(guildId);
    const tag = all[name];
    if (!tag) return null;
    tag.uses = (tag.uses || 0) + 1;
    await tags.set(guildId, all);
    return tag.content;
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
    sessions, // raw Keyv — used by the website's session store
};
