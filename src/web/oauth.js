const crypto = require('node:crypto');
const env = require('./env');

// Discord OAuth2 — authorize URL building, code exchange, user + guild
// fetches. `state` is an HMAC-signed payload carrying the intended
// post-login destination.

const API = 'https://discord.com/api/v10';
const SCOPES = 'identify guilds';
const STATE_TTL = 10 * 60 * 1000;

const sign = (v) => crypto.createHmac('sha256', env.SESSION_SECRET).update(v).digest('base64url');
const signOk = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// A safe in-site path: single leading slash, never protocol-relative
// ("//host"), backslash-relative ("/\host") or scheme-embedded ("a:b").
const safeNext = (n) => (typeof n === 'string' && /^\/[a-z0-9\-._~%!$&'()*+,;=:@]/i.test(n) ? n : null);

function authorizeUrl(next = '/dashboard') {
    const payload = Buffer.from(JSON.stringify({ n: safeNext(next) || '/dashboard', t: Date.now() })).toString('base64url');
    const params = new URLSearchParams({
        client_id: env.CLIENT_ID,
        redirect_uri: env.REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        state: `${payload}.${sign(payload)}`,
        prompt: 'none',
    });
    return `${API}/oauth2/authorize?${params}`;
}

function readState(state) {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig || payload.length > 512 || !signOk(sign(payload), sig)) return null;
    try {
        const p = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!Number.isFinite(p.t) || Math.abs(Date.now() - p.t) > STATE_TTL) return null;
        return { next: safeNext(p.n) || '/dashboard' };
    } catch {
        return null;
    }
}

async function exchangeCode(code) {
    const res = await fetch(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: env.CLIENT_ID,
            client_secret: env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: env.REDIRECT_URI,
        }),
        signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res) return null;
    const data = await res.json().catch(() => null);
    return res.ok ? data : null;
}

async function fetchJson(path, accessToken) {
    const res = await fetch(`${API}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!res?.ok) return null;
    return res.json().catch(() => null);
}

const fetchUser = (t) => fetchJson('/users/@me', t);
const fetchGuilds = (t) => fetchJson('/users/@me/guilds', t);

module.exports = { authorizeUrl, readState, exchangeCode, fetchUser, fetchGuilds, safeNext };
