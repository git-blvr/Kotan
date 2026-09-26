const path = require('node:path');
const express = require('express');
const env = require('./env');
const logger = require('../utils/logger');
const { sessionMiddleware, requireAuth, sameOriginOnly } = require('./auth');
const { checkGuildAccess, isDeveloper } = require('./permissions');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

const WEB_DIR = __dirname;
const page = (name) => path.join(WEB_DIR, 'pages', name);

// Starts the dashboard server inside the bot process. Called from ready.js —
// the site reads the shared DB layer and the live discord.js client directly,
// so it must start only after login.
function startWebsite(client) {
    if (!env.ok) {
        logger.error(`Website disabled — missing env vars: ${env.missing.join(', ')}`);
        return null;
    }

    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', true);
    app.locals.client = client;

    // Security headers — the design uses inline styles/scripts in places, so
    // CSP permits 'unsafe-inline' for style only; scripts stay self-hosted.
    app.use((req, res, next) => {
        res.set({
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin',
        });
        next();
    });

    app.use(express.urlencoded({ extended: false, limit: '256kb' }));
    app.use(sessionMiddleware);
    app.use(sameOriginOnly);

    app.use(authRoutes);
    app.use(apiRoutes);

    // Dashboard shells — gated server-side; the SPA inside then re-checks per
    // guild via the API (which enforces the same rules on every request).
    app.get('/dashboard', requireAuth, (req, res) => res.sendFile(page('dashboard.html')));
    app.get('/dashboard/admin/blacklist', requireAuth, (req, res) => {
        if (!isDeveloper(req.session.user.id)) return res.status(404).sendFile(page('error.html'));
        res.sendFile(page('admin.html'));
    });
    app.get('/dashboard/:id', requireAuth, (req, res) => {
        const err = checkGuildAccess(client, req.session, req.params.id);
        if (err?.error === 'restricted')
            return res.status(403).sendFile(page('restricted.html'));
        if (err) return res.status(err.status).sendFile(page('error.html'));
        res.sendFile(page('dashboard.html'));
    });

    // Public pages + static assets (pages/, script/, stylesheets/).
    const send = (name) => (req, res) => res.sendFile(page(name));
    app.get('/', send('index.html'));
    app.get('/doc', send('doc.html'));
    app.get('/tos', send('tos.html'));
    app.get('/privacy', send('privacy.html'));
    app.get('/uptime', send('uptime.html'));
    app.get('/login', send('login.html'));
    app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /api\nSitemap: ' + env.SITE_URL + '/sitemap.xml\n'));
    app.get('/sitemap.xml', (req, res) => {
        const urls = ['', '/doc', '/tos', '/privacy', '/uptime', '/login']
            .map((p) => `<url><loc>${env.SITE_URL}${p}</loc></url>`).join('');
        res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
    });
    app.use('/script', express.static(path.join(WEB_DIR, 'script'), { maxAge: '5m' }));
    app.use('/stylesheets', express.static(path.join(WEB_DIR, 'stylesheets'), { maxAge: '5m' }));
    app.use('/assets', express.static(path.join(WEB_DIR, 'assets'), { maxAge: '1h' }));

    app.use((req, res) => res.status(404).sendFile(page('error.html')));
    app.use((err, req, res, next) => {
        logger.error('Website error:', err);
        res.status(500).sendFile(page('error.html'));
    });

    const displayHost = env.HOST === '127.0.0.1' ? 'localhost' : env.HOST;
    app.listen(env.PORT, env.HOST, () => {
        logger.success(`Dashboard listening on http://${displayHost}:${env.PORT}`);
    });
    return app;
}

module.exports = { startWebsite };
