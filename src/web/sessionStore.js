const crypto = require('node:crypto');
const db = require('../utils/database');

// Opaque session ids -> `sessions:<sid>` rows in the shared DB namespace.
// The cookie carries only the random id; the row holds the user profile,
// their guild list, and (optionally) a per-guild CSRF token.

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

async function create(data) {
    const sid = crypto.randomBytes(32).toString('base64url');
    await db.sessions.set(sid, data, SESSION_TTL);
    return sid;
}

async function get(sid) {
    if (!sid || typeof sid !== 'string') return null;
    const s = await db.sessions.get(sid).catch(() => null);
    return s && s.user ? s : null;
}

const destroy = (sid) => sid && db.sessions.delete(sid).catch(() => {});
const touch = (sid, data) => db.sessions.set(sid, data, SESSION_TTL).catch(() => {});

module.exports = { create, get, destroy, touch, SESSION_TTL };
