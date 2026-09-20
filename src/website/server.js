const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const session = require('express-session');
const db = require('../utils/database');
const logger = require('../utils/logger');
const KeyvSessionStore = require('./sessionStore');
const pagesRouter = require('./routes/pages');
const authRouter = require('./routes/auth');
const dashboardRouter = require('./routes/dashboard');
const { renderError } = require('./views/error');

// Kotan's website. Runs inside the single bot process — exactly one listener.
//
//   GET /               home     (public)
//   GET /doc            docs     (public, generated from loaded commands)
//   GET /status         health   (uptime monitors)
//   GET /privacy /tos   legal    (public)
//   GET /dashboard      picker   (Discord OAuth2)
//   GET /dashboard/:id  settings (must manage the guild, bot must be in it)
//
// Binding:
//   NODE_ENV=production -> HOST (default 0.0.0.0) + real certs when provided
//   otherwise           -> 127.0.0.1 + a self-signed localhost cert
//
// TLS env vars: SSL_KEY / SSL_CERT / SSL_CA (file paths). No certs in
// production means plain HTTP — fine behind a TLS-terminating proxy (nginx,
// caddy, cloudflare), which is the usual deployment anyway.

const IS_PROD = process.env.NODE_ENV === 'production';
const HOST = process.env.HOST || (IS_PROD ? '0.0.0.0' : '127.0.0.1');

async function loadTls() {
    const { SSL_KEY, SSL_CERT, SSL_CA } = process.env;
    if (SSL_KEY && SSL_CERT) {
        return {
            key: fs.readFileSync(SSL_KEY),
            cert: fs.readFileSync(SSL_CERT),
            ca: SSL_CA ? fs.readFileSync(SSL_CA) : undefined,
            selfSigned: false,
        };
    }
    if (IS_PROD) return null; // prod without certs -> HTTP (proxy terminates TLS)

    // Dev: reusable self-signed cert so the browser warning is accepted once.
    const certFile = path.join(__dirname, '..', '..', 'data', 'dev-cert.json');
    try {
        const cached = JSON.parse(fs.readFileSync(certFile, 'utf8'));
        if (cached.key && cached.cert) return { ...cached, selfSigned: true };
    } catch {}

    const selfsigned = require('selfsigned');
    const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
        days: 365,
        keySize: 2048,
        extensions: [
            {
                name: 'subjectAltName',
                altNames: [
                    { type: 2, value: 'localhost' },
                    { type: 7, ip: '127.0.0.1' },
                ],
            },
        ],
    });
    const tls = { key: pems.private, cert: pems.cert, selfSigned: true };
    try {
        fs.mkdirSync(path.dirname(certFile), { recursive: true });
        fs.writeFileSync(certFile, JSON.stringify({ key: tls.key, cert: tls.cert }));
    } catch {}
    return tls;
}

async function startWebsite(client) {
    const tls = await loadTls();
    const PORT = Number(process.env.PORT) || (tls && !tls.selfSigned ? 443 : 3000);
    const PUBLIC_URL = process.env.PUBLIC_URL || `${tls ? 'https' : 'http'}://localhost:${PORT}`;

    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', 1); // correct IPs/secure cookies behind a reverse proxy

    // Basic hardening headers — CSP allows inline styles + Discord CDN images.
    app.use((req, res, next) => {
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-Frame-Options': 'DENY',
            'Content-Security-Policy':
                "default-src 'self'; img-src 'self' https://cdn.discordapp.com https://i.imgur.com data:; style-src 'unsafe-inline'",
        });
        if (tls && !tls.selfSigned)
            res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        next();
    });

    app.use(express.urlencoded({ extended: false }));
    app.use(
        session({
            store: new KeyvSessionStore(db.sessions),
            secret: process.env.SESSION_SECRET || process.env.CLIENT_SECRET || 'kotan-insecure-dev',
            resave: false,
            saveUninitialized: false,
            cookie: {
                maxAge: 7 * 24 * 3600 * 1000, // 7 days
                httpOnly: true,
                sameSite: 'lax',
                secure: 'auto',
            },
        })
    );
    if (!process.env.SESSION_SECRET && !process.env.CLIENT_SECRET)
        logger.warn('Website: no SESSION_SECRET/CLIENT_SECRET set — using an insecure default');

    app.use('/', pagesRouter(client));
    app.use('/auth', authRouter(client, PUBLIC_URL));
    app.use('/dashboard', dashboardRouter(client));

    app.use((req, res) =>
        res.status(404).send(renderError({ user: req.session?.user, status: 404, message: 'Page not found.' }))
    );

    // Last-resort error handler — a throwing route must never take the bot down.
    app.use((err, req, res, next) => {
        logger.error('Website route error:', err);
        if (res.headersSent) return next(err);
        res.status(500).send(
            renderError({ user: req.session?.user, status: 500, message: 'Internal server error.' })
        );
    });

    const server = tls ? https.createServer(tls, app) : http.createServer(app);
    server.on('error', (err) =>
        logger.error(`Website failed to listen on ${HOST}:${PORT} —`, err.message)
    );
    server.listen(PORT, HOST, () => {
        const scheme = tls ? 'https' : 'http';
        logger.success(`Website listening on ${scheme}://${HOST}:${PORT}`);
        if (tls?.selfSigned)
            logger.warn('Dev mode: self-signed certificate — accept the browser warning once.');
        if (!tls && IS_PROD)
            logger.warn('No SSL_KEY/SSL_CERT — serving HTTP. Put a TLS proxy in front or set the env vars.');
        if (process.env.CLIENT_SECRET)
            logger.info(
                `OAuth2 redirect: ${process.env.OAUTH_REDIRECT || `${PUBLIC_URL}/auth/callback`} — ` +
                    'register this exact URI in the Dev Portal → OAuth2 → Redirects'
            );
    });
}

module.exports = { startWebsite };
