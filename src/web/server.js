const fs = require('node:fs');
const path = require('node:path');
const fastify = require('fastify');
const env = require('./env');
const logger = require('../utils/logger');
const { sessionMiddleware, requireAuth, sameOriginOnly } = require('./auth');
const { checkGuildAccess, isDeveloper } = require('./permissions');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { rateLimit } = require('./rateLimit');

const WEB_DIR = __dirname;
const page = (name) => path.join(WEB_DIR, 'pages', name);

// Page bodies cached briefly in memory so refresh storms don't hit disk
// on every request. Short TTL keeps edits visible without a restart.
const pageCache = new Map();
function cachedPage(name) {
    const c = pageCache.get(name);
    if (c && c.exp > Date.now()) return c.buf;
    const buf = fs.readFileSync(page(name));
    pageCache.set(name, { buf, exp: Date.now() + 2000 });
    return buf;
}

const MIME = {
    '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json',
    '.map': 'application/json', '.txt': 'text/plain',
};

// Starts the dashboard server inside the bot process. Called from ready.js —
// the site reads the shared DB layer and the live discord.js client directly,
// so it must start only after login.
async function startWebsite(client) {
    if (!env.ok) {
        logger.error(`Website disabled — missing env vars: ${env.missing.join(', ')}`);
        return null;
    }

    const app = fastify({
        trustProxy: env.TRUST_PROXY,
        bodyLimit: 256 * 1024,
        routerOptions: { ignoreTrailingSlash: true },
    });
    // Request decorators can't hold object values — attach via hook instead.
    app.addHook('preHandler', async (req) => { req.client = client; });

    // Security headers — the design uses inline styles in places, so CSP
    // permits 'unsafe-inline' for style only; scripts stay self-hosted.
    app.addHook('onSend', async (req, reply) => {
        reply.headers({
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://cdn.discordapp.com https://i.imgur.com data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin',
        });
        // HSTS only when the deployment actually serves HTTPS (COOKIE_SECURE
        // is the existing "production HTTPS" flag) — sending it on plain HTTP
        // would pin browsers to a broken scheme.
        if (env.COOKIE_SECURE)
            reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    });

    app.addHook('preHandler', sessionMiddleware);
    app.addHook('preHandler', sameOriginOnly);

    await app.register(authRoutes);
    await app.register(apiRoutes);

    // Dashboard shells — gated server-side; the SPA inside then re-checks per
    // guild via the API (which enforces the same rules on every request).
    const html = (name) => (req, reply) => reply.type('text/html').send(cachedPage(name));
    app.get('/dashboard', { preHandler: requireAuth }, html('dashboard.html'));
    app.get('/dashboard/admin/blacklist', { preHandler: requireAuth }, (req, reply) => {
        if (!isDeveloper(req.session.user.id)) return reply.code(404).type('text/html').send(cachedPage('error.html'));
        return reply.type('text/html').send(cachedPage('admin.html'));
    });
    app.get('/dashboard/:id', { preHandler: requireAuth }, (req, reply) => {
        const err = checkGuildAccess(req.client, req.session, req.params.id);
        if (err?.error === 'restricted')
            return reply.code(403).type('text/html').send(cachedPage('restricted.html'));
        if (err) return reply.code(err.status).type('text/html').send(cachedPage('error.html'));
        return reply.type('text/html').send(cachedPage('dashboard.html'));
    });

    // Public pages + static assets — per-IP limited so F5 spam can't
    // burn the process; pages serve from the memory cache above.
    const pageLimit = rateLimit({ windowMs: 60_000, max: 120 });
    const staticLimit = rateLimit({ windowMs: 60_000, max: 300 });
    for (const [route, file] of [['/', 'index.html'], ['/doc', 'doc.html'], ['/tos', 'tos.html'],
        ['/privacy', 'privacy.html'], ['/uptime', 'uptime.html'], ['/login', 'login.html']])
        app.get(route, { preHandler: pageLimit }, html(file));

    // /invite → Discord's add-bot flow with the permission set the bot needs.
    app.get('/invite', (req, reply) => {
        if (!req.client?.user) return reply.code(503).send({ ok: false, error: 'Bot is not ready yet' });
        return reply.redirect(req.client.generateInvite({
            scopes: ['bot', 'applications.commands'],
            permissions: require('../utils/invitePerms'),
        }));
    });
    app.get('/favicon.ico', (req, reply) => reply.redirect('/assets/icon.png'));

    app.get('/robots.txt', (req, reply) => reply.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /api\nSitemap: ' + env.SITE_URL + '/sitemap.xml\n'));
    // Discord domain verification (Developer Portal → Verify Domain) — serves
    // the dh= token from DISCORD_DOMAIN_HASH; 404s when unset.
    app.get('/.well-known/discord', (req, reply) => {
        const hash = process.env.DISCORD_DOMAIN_HASH;
        if (!hash) return reply.code(404).send({ ok: false });
        return reply.type('text/plain').send(hash);
    });
    app.get('/sitemap.xml', (req, reply) => {
        const urls = ['', '/doc', '/tos', '/privacy', '/uptime', '/login']
            .map((p) => `<url><loc>${env.SITE_URL}${p}</loc></url>`).join('');
        reply.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
    });

    // Static mounts — safe flat-file reads with cache headers.
    const mount = (prefix, dir, maxAge) => app.get(`${prefix}/:file`, { preHandler: staticLimit }, (req, reply) => {
        const file = String(req.params.file);
        if (!/^[\w.-]+$/.test(file) || file.startsWith('.')) return reply.code(404).send({ ok: false });
        let buf;
        try { buf = fs.readFileSync(path.join(dir, file)); }
        catch { return reply.code(404).send({ ok: false }); }
        return reply
            .header('Cache-Control', `public, max-age=${maxAge}`)
            .type(MIME[path.extname(file).toLowerCase()] || 'application/octet-stream')
            .send(buf);
    });
    mount('/script', path.join(WEB_DIR, 'script'), 300);
    mount('/stylesheets', path.join(WEB_DIR, 'stylesheets'), 300);
    mount('/assets', path.join(WEB_DIR, 'assets'), 3600);

    app.setNotFoundHandler((req, reply) => reply.code(404).type('text/html').send(cachedPage('error.html')));
    app.setErrorHandler((err, req, reply) => {
        logger.error('Website error:', err);
        reply.code(500).type('text/html').send(cachedPage('error.html'));
    });

    await app.listen({ port: env.PORT, host: env.HOST });
    const displayHost = env.HOST === '127.0.0.1' ? 'localhost' : env.HOST;
    const exposure = env.HOST === '0.0.0.0' ? ' (exposed to LAN)' : '';
    logger.success(`Dashboard listening on http://${displayHost}:${env.PORT}${exposure}`);
    return app;
}

module.exports = {
    // ready.js calls this fire-and-forget — absorb listen failures into logs
    // instead of an unhandled rejection taking the bot down.
    startWebsite: (client) => startWebsite(client).catch((err) => {
        logger.error('Website failed to start:', err);
        return null;
    }),
};
