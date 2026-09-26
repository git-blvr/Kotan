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

module.exports = { canManageGuild, isDeveloper, manageableGuilds, checkGuildAccess };
