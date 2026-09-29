const env = require('./env');
const sessions = require('./sessionStore');

const COOKIE = 'kotan_sid';

function cookieHeader(name, value, maxAgeMs) {
    const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', 'HttpOnly'];
    if (env.COOKIE_SECURE) parts.push('Secure');
    if (maxAgeMs != null) parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
    return parts.join('; ');
}

function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || '').split(';')) {
        const i = part.indexOf('=');
        if (i <= 0) continue;
        try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
    }
    return out;
}

// Attaches req.session / req.sid for every request (preHandler hook).
async function sessionMiddleware(req) {
    const raw = parseCookies(req)[COOKIE];
    req.sid = typeof raw === 'string' && raw.length <= 128 ? raw : null;
    req.session = req.sid ? await sessions.get(req.sid) : null;
}

// Page guard — unauthenticated users go to /login with their destination
// preserved for post-login redirect.
async function requireAuth(req, reply) {
    if (!req.session) return reply.redirect(`/login?next=${encodeURIComponent(req.url)}`);
}

// API variant — JSON 401, no redirect.
async function requireAuthApi(req, reply) {
    if (!req.session) return reply.code(401).send({ ok: false, error: 'Unauthorized' });
}

// Blocks cross-origin form posts/fetches on mutating methods. A malformed
// Origin/Referer would otherwise throw in new URL() and 500 the request.
async function sameOriginOnly(req, reply) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin || req.headers.referer;
    if (!origin) return; // same-site cookies already block cross-site POSTs
    let host;
    try { host = new URL(origin).host; } catch { return reply.code(403).send({ ok: false, error: 'Cross-origin request rejected' }); }
    if (host !== req.headers.host)
        return reply.code(403).send({ ok: false, error: 'Cross-origin request rejected' });
}

module.exports = { COOKIE, cookieHeader, sessionMiddleware, requireAuth, requireAuthApi, sameOriginOnly };
