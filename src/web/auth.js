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
        if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
}

// Attaches req.session / req.sid for every request.
async function sessionMiddleware(req, res, next) {
    req.sid = parseCookies(req)[COOKIE] || null;
    req.session = req.sid ? await sessions.get(req.sid) : null;
    next();
}

// Page guard — unauthenticated users go to /login with their destination
// preserved for post-login redirect.
function requireAuth(req, res, next) {
    if (req.session) return next();
    res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

// API variant — JSON 401, no redirect.
function requireAuthApi(req, res, next) {
    if (req.session) return next();
    res.status(401).json({ ok: false, error: 'Unauthorized' });
}

// Blocks cross-origin form posts/fetches on mutating methods.
function sameOriginOnly(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin || req.headers.referer;
    if (origin && new URL(origin).host !== req.headers.host)
        return res.status(403).json({ ok: false, error: 'Cross-origin request rejected' });
    next();
}

module.exports = { COOKIE, cookieHeader, sessionMiddleware, requireAuth, requireAuthApi, sameOriginOnly };
