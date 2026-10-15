const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const fastify = require('fastify');
const compress = require('@fastify/compress');
const env = require('./env');
const logger = require('../utils/logger');
const { sessionMiddleware, requireAuth, sameOriginOnly } = require('./auth');
const { checkGuildAccess, isDeveloper } = require('./permissions');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { rateLimit, concurrencyCap } = require('./rateLimit');

const WEB_DIR = __dirname;
const page = (name) => path.join(WEB_DIR, 'pages', name);

// Page bodies cached in memory — async reads so the event loop never blocks
// on disk I/O. TTL of 30s is generous enough for production while still
// picking up edits without a restart.
const pageCache = new Map();
const PAGE_CACHE_TTL = 30_000;

async function cachedPage(name) {
    const c = pageCache.get(name);
    if (c && c.exp > Date.now()) return c.buf;
    const buf = await fsp.readFile(page(name));
    pageCache.set(name, { buf, exp: Date.now() + PAGE_CACHE_TTL });
    return buf;
}

// Pre-warm the page cache at startup so the first visitors don't pay the
// read cost. Missing files are silently skipped (e.g. optional pages).
async function warmPageCache() {
    const pages = [
        'index.html', 'dashboard.html', 'login.html', 'error.html',
        'doc.html', 'tos.html', 'privacy.html', 'uptime.html',
        'admin.html', 'restricted.html',
    ];
    await Promise.allSettled(pages.map((n) => cachedPage(n)));
}

const MIME = {
    '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json',
    '.map': 'application/json', '.txt': 'text/plain',
};

// Static file cache — served assets are immutable for the life of the
// process; only re-read when the in-memory entry has expired.
const staticCache = new Map();
const STATIC_CACHE_TTL = 5 * 60_000; // 5 minutes

async function cachedStatic(filePath) {
    const c = staticCache.get(filePath);
    if (c && c.exp > Date.now()) return c.buf;
    const buf = await fsp.readFile(filePath);
    staticCache.set(filePath, { buf, exp: Date.now() + STATIC_CACHE_TTL });
    return buf;
}

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

    // Brotli + gzip compression — the biggest single performance win.
    // dash.js is 352 KB raw → 62 KB brotli (~82% smaller). With no compression
    // the browser downloads 5× more data on every page load.
    // encodings: prefer brotli (br) over gzip; zstd excluded (not universally
    // supported yet). Only compress text types — binary assets are already
    // compressed (png, woff2, webp) and re-compressing them costs CPU for 0 gain.
    await app.register(compress, {
        global: true,
        encodings: ['br', 'gzip', 'deflate'],
        threshold: 1024, // skip compression for tiny responses
        brotliOptions: { params: { [require('node:zlib').constants.BROTLI_PARAM_QUALITY]: 4 } }, // q4 = fast + good ratio
        zlibOptions: { level: 6 }, // gzip level 6 — balanced speed/ratio
    });
    // Request decorators can't hold object values — attach via hook instead.
    app.addHook('preHandler', async (req) => { req.client = client; });

    // HTTP request logger — toggled by WEB_REQUEST_LOG env var or at runtime
    // via logger.httpLog.enabled. Uses onResponse so elapsedTime is available.
    app.addHook('onResponse', logger.httpLog.hook);

    // Concurrency cap runs first — burst floods die at the cheapest check.
    // 60 covers parallel SPA fetches easily; browsers cap ~6 per host anyway.
    app.addHook('onRequest', concurrencyCap(60));
    // Static files are excluded from the global bucket — they already have a
    // larger per-route bucket (300/min); counting them here would triple-
    // charge every page load.
    const STATIC_SKIP = /^\/(?:script|stylesheets|assets)\//;
    // The global per-IP limit must run after sessionMiddleware (below) so
    // signed-in users get the authedMax lane instead of the anonymous one.
    const globalLimit = rateLimit({ windowMs: 60_000, max: 120, authedMax: 2000, global: true });

    // Security headers — the design uses inline styles in places, so CSP
    // permits 'unsafe-inline' for style only; scripts stay self-hosted.
    app.addHook('onSend', async (req, reply) => {
        reply.headers({
            'Content-Security-Policy': "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://cdn.discordapp.com https://i.imgur.com data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY', // legacy fallback for frame-ancestors
            'Referrer-Policy': 'same-origin',
            'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        });
        // HSTS only when the deployment actually serves HTTPS (COOKIE_SECURE
        // is the existing "production HTTPS" flag) — sending it on plain HTTP
        // would pin browsers to a broken scheme.
        if (env.COOKIE_SECURE)
            reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    });

    // Skip session lookup on static assets — scripts/styles/images don't need
    // session state and shouldn't pay a database lookup cost.
    app.addHook('preHandler', async (req) => {
        if (!STATIC_SKIP.test(req.url.split('?')[0])) {
            await sessionMiddleware(req);
        }
    });
    app.addHook('preHandler', sameOriginOnly);
    app.addHook('preHandler', async (req, reply) => {
        if (!STATIC_SKIP.test(req.url.split('?')[0])) {
            return globalLimit(req, reply);
        }
    });

    await app.register(authRoutes);
    await app.register(apiRoutes);

    // Dashboard shells — gated server-side; the SPA inside then re-checks per
    // guild via the API (which enforces the same rules on every request).
    const html = (name) => async (req, reply) => reply.type('text/html').send(await cachedPage(name));
    app.get('/dashboard', { preHandler: requireAuth }, html('dashboard.html'));
    app.get('/dashboard/admin/blacklist', { preHandler: requireAuth }, async (req, reply) => {
        if (!isDeveloper(req.session.user.id)) return reply.code(404).type('text/html').send(await cachedPage('error.html'));
        return reply.type('text/html').send(await cachedPage('admin.html'));
    });
    app.get('/dashboard/:id', { preHandler: requireAuth }, async (req, reply) => {
        const err = checkGuildAccess(req.client, req.session, req.params.id);
        if (err?.error === 'restricted')
            return reply.code(403).type('text/html').send(await cachedPage('restricted.html'));
        if (err) return reply.code(err.status).type('text/html').send(await cachedPage('error.html'));
        return reply.type('text/html').send(await cachedPage('dashboard.html'));
    });

    // Public pages + static assets — per-IP limited so F5 spam can't
    // burn the process; pages serve from the memory cache above.
    const pageLimit = rateLimit({ windowMs: 60_000, max: 120, authedMax: 1200 });
    const staticLimit = rateLimit({ windowMs: 60_000, max: 300, authedMax: 3000 });
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

    // Static mounts — async reads with in-memory cache and strict filename
    // validation. Long cache headers let CDN/browser skip re-fetching unchanged
    // assets across sessions (versioned query strings bust the cache when files change).
    const mount = (prefix, dir, maxAge) => app.get(`${prefix}/:file`, { preHandler: staticLimit }, async (req, reply) => {
        const file = String(req.params.file);
        // Reject anything that isn't a simple filename — no directories, no
        // dotfiles, no path separators. Strictly whitelisting alphanumerics +
        // hyphens/underscores/dots keeps traversal and trick extensions out.
        if (!/^[\w.-]+$/.test(file) || file.startsWith('.') || file.includes('..'))
            return reply.code(404).send({ ok: false });
        const ext = path.extname(file).toLowerCase();
        if (!MIME[ext]) return reply.code(404).send({ ok: false }); // reject unknown types
        let buf;
        try { buf = await cachedStatic(path.join(dir, file)); }
        catch { return reply.code(404).send({ ok: false }); }
        return reply
            .header('Cache-Control', `public, max-age=${maxAge}, immutable`)
            .type(MIME[ext])
            .send(buf);
    });
    // Scripts and CSS: 1 hour (3600s) — versioned with ?v= query strings so
    // cache busting works. Assets (images, fonts): 7 days (604800s) — rarely change.
    mount('/script', path.join(WEB_DIR, 'script'), 3600);
    mount('/stylesheets', path.join(WEB_DIR, 'stylesheets'), 3600);
    mount('/assets', path.join(WEB_DIR, 'assets'), 604800);

    app.setNotFoundHandler(async (req, reply) => reply.code(404).type('text/html').send(await cachedPage('error.html')));
    app.setErrorHandler(async (err, req, reply) => {
        logger.error('Website error:', err);
        reply.code(500).type('text/html').send(await cachedPage('error.html'));
    });

    // Pre-warm page cache before accepting connections.
    await warmPageCache();

    await app.listen({ port: env.PORT, host: env.HOST });
    // Socket-level flood hygiene — slowheaders, stalled request bodies and
    // socket floods cost the event loop nothing more than a timer each.
    app.server.headersTimeout = 20_000;  // Node default 60s — too generous
    app.server.requestTimeout = 30_000;  // Node default 300s
    app.server.maxConnections = 2048;    // refuse sockets beyond this
    const displayHost = env.HOST === '127.0.0.1' ? 'localhost' : env.HOST;
    const exposure = env.HOST === '0.0.0.0' ? ' (exposed to LAN)' : '';
    const logStatus = logger.httpLog.enabled ? 'on' : 'off (set WEB_REQUEST_LOG=true to enable)';
    logger.success(`Dashboard listening on http://${displayHost}:${env.PORT}${exposure}`);
    logger.info(`Request logging: ${logStatus}`);
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
