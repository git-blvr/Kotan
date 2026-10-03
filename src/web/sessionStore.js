const crypto = require('node:crypto');
const db = require('../utils/database');

// Opaque session ids -> `sessions:<sha256(sid)>` rows in the shared DB
// namespace. The cookie carries only the random id; the row holds the user
// profile, their guild list, and (optionally) a per-guild CSRF token.
//
// The storage key is a SHA-256 digest of the sid, not the sid itself: SQLite
// keeps kv keys plaintext (namespaces need LIKE scans), so a stolen
// kotan.sqlite would otherwise hand an attacker every live session id — no
// DB_KEY needed. With hashed keys the file reveals digests that can't be
// replayed as cookies. Rows written before hashing existed are adopted
// under the hashed key on first read.

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;

const keyFor = (sid) => crypto.createHash('sha256').update(sid).digest('hex');

async function create(data) {
    const sid = crypto.randomBytes(32).toString('base64url');
    await db.sessions.set(keyFor(sid), data, SESSION_TTL);
    return sid;
}

async function get(sid) {
    if (!sid || typeof sid !== 'string') return null;
    const k = keyFor(sid);
    let s = await db.sessions.get(k).catch(() => null);
    if (!s) {
        // Legacy row keyed by the raw sid — migrate it under the digest so the
        // plaintext copy disappears from the database.
        s = await db.sessions.get(sid).catch(() => null);
        if (s) {
            await db.sessions.set(k, s, SESSION_TTL).catch(() => {});
            db.sessions.delete(sid).catch(() => {});
        }
    }
    return s && s.user ? s : null;
}

const destroy = (sid) =>
    sid &&
    Promise.all([
        db.sessions.delete(keyFor(sid)).catch(() => {}),
        db.sessions.delete(sid).catch(() => {}), // legacy plaintext-keyed row
    ]);
const touch = (sid, data) => db.sessions.set(keyFor(sid), data, SESSION_TTL).catch(() => {});

module.exports = { create, get, destroy, touch, SESSION_TTL };
