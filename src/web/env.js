// Web-layer configuration — validated at server start so a misconfigured
// .env fails the website loudly without taking the bot down with it.
const crypto = require('node:crypto');

const env = process.env;
const required = ['CLIENT_ID', 'CLIENT_SECRET', 'SESSION_SECRET', 'OAUTH_REDIRECT_URI'];
const missing = required.filter((k) => !env[k]);

module.exports = {
    ok: missing.length === 0,
    missing,
    CLIENT_ID: env.CLIENT_ID,
    CLIENT_SECRET: env.CLIENT_SECRET,
    REDIRECT_URI: env.OAUTH_REDIRECT_URI,
    SESSION_SECRET: env.SESSION_SECRET,
    SITE_URL: env.SITE_URL || `http://localhost:${env.PORT || 3000}`,
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
    PORT: Number(env.WEB_PORT || env.PORT || 3000),
    COOKIE_SECURE: env.COOKIE_SECURE === 'true',
    crypto,
};
