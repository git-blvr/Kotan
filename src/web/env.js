// Web-layer configuration — validated at server start so a misconfigured
// .env fails the website loudly without taking the bot down with it.
const crypto = require('node:crypto');

const env = process.env;
const required = ['CLIENT_ID', 'CLIENT_SECRET', 'SESSION_SECRET'];
const missing = required.filter((k) => !env[k]);

// Resolved here so REDIRECT_URI can fall back to SITE_URL/auth/callback.
const port = Number(env.SERVER_PORT || env.WEB_PORT || env.PORT || 3000);
const siteUrl = env.SITE_URL || `http://localhost:${port}`;

module.exports = {
    ok: missing.length === 0,
    missing,
    CLIENT_ID: env.CLIENT_ID,
    CLIENT_SECRET: env.CLIENT_SECRET,
    // Derived from SITE_URL — set SITE_URL to the public URL on the host and
    // the OAuth callback follows automatically. OAUTH_REDIRECT_URI remains
    // as an override for unusual setups.
    REDIRECT_URI: env.OAUTH_REDIRECT_URI || `${siteUrl}/auth/callback`,
    SESSION_SECRET: env.SESSION_SECRET,
    SITE_URL: siteUrl,
    DEVELOPER_IDS: (env.DEVELOPER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean),
    // Bind address — WEB_HOST accepts friendly modes or a raw interface IP:
    //   local (default) → 127.0.0.1  — this machine only
    //   public / lan    → 0.0.0.0    — visible to the whole network
    //   <ip>            → bind to that specific interface
    HOST: (() => {
        const h = (env.WEB_HOST || 'local').trim().toLowerCase();
        if (['public', 'lan', 'all', '0.0.0.0'].includes(h)) return '0.0.0.0';
        if (['local', 'localhost', 'loopback', '127.0.0.1'].includes(h)) return '127.0.0.1';
        return env.WEB_HOST.trim(); // custom interface IP
    })(),
    // SERVER_PORT (injected by panel hosts for the allocated public port) wins —
    // on those hosts it's the ONLY reachable port; WEB_PORT for local override.
    PORT: port,
    // Secure cookies default ON whenever SITE_URL is https — an https public
    // URL means browsers reach the site over TLS, so a plaintext cookie can
    // only leak. COOKIE_SECURE=false remains as an explicit escape hatch.
    COOKIE_SECURE: (() => {
        const v = env.COOKIE_SECURE;
        const https = siteUrl.startsWith('https:');
        if (v === 'true') return true;
        if (v === 'false') {
            if (https) console.warn('[env] SITE_URL is https but COOKIE_SECURE=false — session cookies will travel over plaintext');
            return false;
        }
        if (https) console.warn('[env] COOKIE_SECURE unset — defaulting on because SITE_URL is https (set COOKIE_SECURE=false to override)');
        return https;
    })(),
    // How much Fastify trusts proxy headers (X-Forwarded-For → req.ip, which
    // rate limiting keys on). Default 'loopback' only trusts a proxy running
    // on this machine — a bare `true` lets ANY client spoof their IP.
    // TRUST_PROXY accepts: true | false | <hop count> | comma-separated
    // trusted proxy IPs/CIDRs (e.g. "10.0.0.0/8,172.16.0.0/12").
    TRUST_PROXY: (() => {
        const v = env.TRUST_PROXY;
        if (v == null || v === '') return 'loopback';
        if (v === 'true') {
            console.warn('[env] TRUST_PROXY=true — any client can spoof X-Forwarded-For and bypass per-IP rate limits; prefer a proxy IP/CIDR list or hop count');
            return true;
        }
        if (v === 'false') return false;
        if (/^\d+$/.test(v)) return Number(v);
        return v.split(',').map((s) => s.trim()).filter(Boolean);
    })(),
    crypto,
};
