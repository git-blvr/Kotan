const env = require('./env');

// Reusable authorization helpers — single source for every page/API gate.
// Dashboard access per spec: guild owner OR MANAGE_GUILD, bot must be in the
// guild, guild must not be developer-blacklisted.

const MANAGE_GUILD = 0x20n;
const ADMINISTRATOR = 0x8n;

function canManageGuild(g) {
    if (!g) return false;
    if (g.owner) return true;
    try {
        const p = BigInt(g.permissions || '0');
        return (p & MANAGE_GUILD) !== 0n || (p & ADMINISTRATOR) !== 0n;
    } catch {
        return false;
    }
}

const isDeveloper = (userId) => env.DEVELOPER_IDS.includes(String(userId));

// Guilds the session user may administer AND where the bot is present.
function manageableGuilds(client, session) {
    return (session.guilds || [])
        .filter(canManageGuild)
        .filter((g) => client.guilds.cache.has(g.id))
        .map((g) => ({ id: g.id, name: g.name, icon: g.icon, owner: !!g.owner }));
}

// Session.guilds is a snapshot from login — permissions there can be stale
// for up to the session TTL (30 days). For mutations the API gate calls this
// to re-verify against live Discord data, cached briefly so it stays cheap.
// Returns true (allowed), false (verified: not allowed), null (Discord hiccup
// — caller decides; we fail closed). Developers always pass.
const liveCache = new Map(); // `${guildId}:${userId}` -> { ok, exp }
const LIVE_TTL = 10 * 60 * 1000;

async function verifyMemberAccess(guild, userId) {
    if (!guild || !userId) return false;
    if (isDeveloper(userId) || guild.ownerId === userId) return true;
    const k = `${guild.id}:${userId}`;
    const hit = liveCache.get(k);
    if (hit && hit.exp > Date.now()) return hit.ok;
    try {
        const m = await guild.members.fetch(userId);
        const ok = !!m && (m.permissions.has('ManageGuild') || m.permissions.has('Administrator'));
        liveCache.set(k, { ok, exp: Date.now() + LIVE_TTL });
        return ok;
    } catch {
        // 404 = left the guild or never was in it. Other errors are transient
        // Discord failures — fail closed either way, but don't cache misses.
        return false;
    }
}

// Per-guild gate shared by dashboard pages and API routes.
// Returns null on success, else { status, error }.
function checkGuildAccess(client, session, guildId) {
    if (!session) return { status: 401, error: 'Unauthorized' };
    const listed = (session.guilds || []).find((g) => g.id === guildId);
    if (!listed || !canManageGuild(listed)) return { status: 403, error: 'You do not manage this server' };
    if (!client.guilds.cache.has(guildId)) return { status: 404, error: 'Kotan is not in this server' };
    if (require('./blacklist').isGuildBlacklisted(guildId))
        return { status: 403, error: 'restricted' };
    return null;
}

module.exports = { canManageGuild, isDeveloper, manageableGuilds, checkGuildAccess, verifyMemberAccess };
