const path = require('path');
const { Keyv } = require('keyv');
const JsonStore = require('./jsonStore');
const logger = require('./logger');

// Storage layer for Kotan.
//
// Each data domain gets its own Keyv instance (and therefore its own key
// namespace). If REDIS_URL is set all namespaces share one Redis connection;
// otherwise each namespace is backed by a JSON file under ./data so the bot
// works out of the box with no external services.

let sharedRedis = null;

function createStore(namespace) {
    if (process.env.REDIS_URL) {
        if (!sharedRedis) {
            const KeyvRedis = require('@keyv/redis').default;
            sharedRedis = new KeyvRedis(process.env.REDIS_URL);
            logger.info('Database: using Redis backend');
        }
        return new Keyv({ store: sharedRedis, namespace });
    }
    const file = path.join(__dirname, '..', '..', 'data', `${namespace}.json`);
    return new Keyv({ store: new JsonStore(file), namespace });
}

const profiles = createStore('economy');
const warns = createStore('warns');
const tempbans = createStore('tempbans');

const key = (guildId, userId) => `${guildId}:${userId}`;

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

module.exports = {
    getProfile,
    saveProfile,
    getWarns,
    addWarn,
    deleteWarn,
    clearWarns,
    setTempban,
    removeTempban,
    iterateTempbans,
};
