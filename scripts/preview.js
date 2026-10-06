const path = require('node:path');
const fs = require('node:fs');
const { exec } = require('node:child_process');
const fastify = require('fastify');

// Standalone dashboard preview — `npm run preview` (or node scripts/preview.js).
//
// Serves the real pages/styles/scripts from src/web plus a stubbed API over
// fake guild data, so the dashboard can be clicked through without the bot,
// Discord login, or touching the real database. Settings saves run through
// the real settings.js validators against an in-memory doc — validation
// matches production, nothing persists between runs.
//
//   --port N   listen port (default 3939, or PREVIEW_PORT)
//   --no-open  don't open the browser automatically

const settings = require('../src/web/settings');
const modules = require('../src/web/config/modules');
const commands = require('../src/web/config/commands');

const WEB = path.join(__dirname, '..', 'src', 'web');
const MIME = {
    '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json',
    '.map': 'application/json', '.txt': 'text/plain',
};

const arg = (name) => {
    const i = process.argv.indexOf(name);
    return i === -1 ? null : process.argv[i + 1];
};
const PORT = Number(arg('--port') || process.env.PREVIEW_PORT || 3939);

// ---------- fake guild ----------

const DAY = 86_400_000;
const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
// 18-digit snowflakes built as strings — beyond MAX_SAFE_INTEGER, so
// `200_000_… + n` arithmetic would collapse every id to the same value.
const RID = (n) => `2${String(n).padStart(17, '0')}`;

const USER = { id: '300000000000000000', username: 'preview', global_name: 'Preview Tester', avatar: null };
const GUILD = { id: '111111111111111111', name: 'Preview Server', icon: null, memberCount: 1284 };

const categories = [
    { id: RID(1), name: 'INFO' },
    { id: RID(2), name: 'CHAT' },
    { id: RID(3), name: 'VOICE' },
];
const channels = [
    { id: RID(10), name: 'rules', type: 0, parent: RID(1) },
    { id: RID(11), name: 'announcements', type: 5, parent: RID(1) },
    { id: RID(12), name: 'general', type: 0, parent: RID(2) },
    { id: RID(13), name: 'memes', type: 0, parent: RID(2) },
    { id: RID(14), name: 'bot-commands', type: 0, parent: RID(2) },
    { id: RID(15), name: 'support', type: 0, parent: RID(2) },
];
const voiceChannels = [
    { id: RID(20), name: 'Join to create', type: 2, parent: RID(3) },
    { id: RID(21), name: 'Lounge', type: 2, parent: RID(3) },
    { id: RID(22), name: 'Gaming', type: 2, parent: RID(3) },
];
const roles = [
    { id: RID(30), name: 'Admin', color: '#e74c3c' },
    { id: RID(31), name: 'Moderator', color: '#3498db' },
    { id: RID(32), name: 'VIP', color: '#f1c40f' },
    { id: RID(33), name: 'Booster', color: '#e91e63' },
    { id: RID(34), name: 'Member', color: '#95a5a6' },
    { id: RID(35), name: 'Muted', color: '#7f8c8d' },
];
const members = [
    { name: 'Kato', user: 'kato', color: '#e74c3c', roles: [RID(30)] },
    { name: 'Mira', user: 'mira', color: '#3498db', roles: [RID(31)] },
    { name: 'Jun', user: 'jun', color: '#2ecc71', roles: [RID(32)] },
    { name: 'Sable', user: 'sable', color: '#9b59b6', roles: [RID(34)] },
    { name: 'Rin', user: 'rin', color: '#f1c40f', roles: [RID(33)] },
    { name: 'Otto', user: 'otto', color: '#e67e22', roles: [RID(34)] },
    { name: 'Nyx', user: 'nyx', color: '#1abc9c', roles: [RID(34)] },
    { name: 'Eli', user: 'eli', color: '#e91e63', roles: [RID(32), RID(33)] },
].map((m, i) => ({ ...m, id: RID(100 + i) }));

// In-memory guild state — settings start from the real defaults, tags from
// a small seed. Both mutate freely; restarting the script resets them.
const doc = structuredClone(settings.DEFAULTS);
doc.welcome.enabled = undefined; // unset fields stay default
doc.welcome.channel = channels[2].id;
doc.leveling.enabled = true;
doc.voicemaster.enabled = true;
doc.voicemaster.triggerId = voiceChannels[0].id;
doc.voicemaster.categoryId = categories[2].id;
const tagDoc = {
    rules: { content: 'Read #rules first!', authorId: USER.id, uses: 12, at: Date.now() - 5 * DAY },
    pingme: { content: 'ping @someone', authorId: USER.id, uses: 3, at: Date.now() - DAY, trigger: true },
};
const auditTrail = [
    { userId: USER.id, section: 'voicemaster', at: Date.now() - 3_600_000 },
    { userId: USER.id, section: 'tickets', at: Date.now() - 2 * DAY },
];

// Deterministic numbers so charts don't jitter between refreshes.
const rng = (seed) => () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

function fakeStats(days) {
    const r = rng(7);
    const series = [];
    const modDays = [];
    const growth = [];
    for (let i = days - 1; i >= 0; i--) {
        const date = dayKey(Date.now() - i * DAY);
        series.push({ date, count: 20 + Math.floor(r() * 60) });
        modDays.push({ date, warns: Math.floor(r() * 3), tempbans: r() < 0.15 ? 1 : 0 });
        growth.push(1150 + Math.floor((days - i) * 3.5 + r() * 8));
    }
    return {
        usage: {
            total: 12_480,
            top: commands.slice(0, 8).map((c, i) => ({ name: c.name, count: 900 - i * 97 })),
            series,
            recent: [
                { cmd: 'voicemaster', userId: members[0].id, at: Date.now() - 60_000 },
                { cmd: 'rank', userId: members[1].id, at: Date.now() - 300_000 },
            ],
            week: 380, prevWeek: 322,
        },
        growth: { series: growth, latest: 1284, pct: 4.2 },
        mod: { days: modDays, warnsTotal: 24, tempbansTotal: 3, warnsWeek: 4, warnsPrevWeek: 2, tempbansWeek: 1, tempbansPrevWeek: 0 },
        audit: auditTrail.slice(0, 15),
        recent: [
            { type: 'warn', userId: members[3].id, moderatorId: members[1].id, reason: 'Spam in #general', at: Date.now() - 7_200_000 },
            { type: 'tempban', userId: members[6].id, moderatorId: members[0].id, reason: 'Raid suspicion', at: Date.now() - DAY },
        ],
        ping: 42,
    };
}

function fakeActivity(days) {
    const r = rng(13);
    const users = {};
    const chans = {};
    const info = {};
    members.forEach((m, i) => {
        users[m.id] = { msg: 420 - i * 43 + Math.floor(r() * 20), voice: 1_800 - i * 187 };
        info[m.id] = { name: m.name, user: m.user, avatar: null, color: m.color, roles: m.roles };
    });
    channels.forEach((c, i) => { chans[c.id] = 380 - i * 53; });
    return { days, users, channels: chans, joins: 34, leaves: 19, members: info };
}

// ---------- server ----------

async function main() {
    const app = fastify({ routerOptions: { ignoreTrailingSlash: true } });

    // Same CSP as production so the preview stays faithful.
    app.addHook('onSend', async (req, reply) => {
        reply.headers({
            'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https://cdn.discordapp.com https://i.imgur.com data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'same-origin',
        });
    });

    // Pages — real files, read per request so edits show on refresh.
    const html = (file) => (req, reply) => reply.type('text/html').send(fs.readFileSync(path.join(WEB, 'pages', file)));
    app.get('/dashboard', html('dashboard.html'));
    app.get('/dashboard/:id', html('dashboard.html'));
    app.get('/dashboard/admin/blacklist', html('admin.html'));
    for (const [route, file] of [['/', 'index.html'], ['/doc', 'doc.html'], ['/tos', 'tos.html'],
        ['/privacy', 'privacy.html'], ['/uptime', 'uptime.html'], ['/login', 'login.html']])
        app.get(route, html(file));

    // Auth round-trip — "log in" just lands on the picker.
    app.get('/auth/discord', (req, reply) => reply.redirect('/dashboard'));
    app.get('/auth/logout', (req, reply) => reply.redirect('/'));
    app.get('/favicon.ico', (req, reply) => reply.redirect('/assets/icon.png'));

    // Static assets — real files, no cache.
    for (const [prefix, dir] of [['/script', 'script'], ['/stylesheets', 'stylesheets'], ['/assets', 'assets']])
        app.get(`${prefix}/:file`, (req, reply) => {
            const file = String(req.params.file);
            if (!/^[\w.-]+$/.test(file) || file.startsWith('.')) return reply.code(404).send({ ok: false });
            let buf;
            try { buf = fs.readFileSync(path.join(WEB, dir, file)); }
            catch { return reply.code(404).send({ ok: false }); }
            return reply.header('Cache-Control', 'no-store').type(MIME[path.extname(file).toLowerCase()] || 'application/octet-stream').send(buf);
        });

    // ---------- stubbed API ----------
    app.get('/api/me', (req, reply) => reply.send({ user: USER }));
    app.get('/api/guilds', (req, reply) =>
        reply.send({ guilds: [{ ...GUILD, owner: true }, { id: '222222222222222222', name: 'Second Server', icon: null, owner: false }] }));
    app.get('/api/meta/devtools', (req, reply) => reply.send({ developer: true }));
    app.get('/api/admin/blacklist', (req, reply) => reply.send({ entries: [] }));
    app.get('/api/stats', (req, reply) => reply.send({ guilds: 12, users: 8941, commands: commands.length }));
    app.get('/api/commands', (req, reply) => reply.send({
        prefix: '.',
        commands: commands.map((c) => ({ name: c.name, description: c.description, module: c.module, usage: '', aliases: [], cooldown: 0, permissions: [] })),
        modules,
    }));
    app.get('/api/uptime', (req, reply) => reply.send({
        status: 'operational', uptimeSeconds: 5_400_123, uptimePercent24h: 100, ping: 42,
        guilds: 12, users: 8941, memoryMB: 148, heapMB: 96, node: process.version,
        components: { gateway: 'ok', api: 'ok', database: 'ok', memory: 'ok' }, now: Date.now(),
    }));

    app.get('/api/guilds/:id', (req, reply) => reply.send({
        guild: GUILD,
        bot: { id: '999999999999999999', username: 'Kotan', avatar: null, avatarUrl: null, bannerUrl: null },
        settings: doc,
        modules,
        commands,
    }));
    app.get('/api/guilds/:id/channels', (req, reply) =>
        reply.send({ channels, categories, voice: voiceChannels }));
    app.get('/api/guilds/:id/roles', (req, reply) => reply.send({ roles }));
    app.get('/api/guilds/:id/messages', (req, reply) => reply.send({
        messages: [
            { id: RID(50), preview: 'React with ✅ to get the Member role!', author: 'Kotan', at: Date.now() - DAY },
            { id: RID(51), preview: 'Welcome to the server — grab roles below.', author: 'kato', at: Date.now() - 2 * DAY },
        ],
    }));
    app.get('/api/guilds/:id/stats', (req, reply) => reply.send(fakeStats(req.query?.days)));
    app.get('/api/guilds/:id/activity', (req, reply) => reply.send(fakeActivity(Math.min(Math.max(parseInt(req.query?.days, 10) || 30, 1), 90))));

    // Save — the real validators mutate the in-memory doc, so errors and
    // normalization match production exactly.
    app.post('/api/guilds/:id/settings', async (req, reply) => {
        const { section, fields } = req.body || {};
        const apply = settings.SECTIONS[String(section || '')];
        if (!apply) return reply.code(404).send({ ok: false, error: 'Unknown section' });
        const err = apply(doc, fields || {});
        if (err) return reply.code(400).send({ ok: false, error: err });
        auditTrail.unshift({ userId: USER.id, section: String(section), at: Date.now() });
        return reply.send({ ok: true, settings: doc });
    });

    // Panel posts + uploads — acknowledge without doing anything.
    for (const p of ['tickets', 'captcha', 'voicemaster'])
        app.post(`/api/guilds/:id/${p}/panel`, (req, reply) => reply.send({ ok: true }));
    app.post('/api/guilds/:id/welcome/test', (req, reply) => reply.send({ ok: true }));
    app.get('/api/guilds/:id/dominant-color', (req, reply) => reply.send({ ok: true, color: '#5865f2' }));
    app.post('/api/guilds/:id/branding/avatar', (req, reply) => reply.send({ ok: true, avatarUrl: null }));
    app.post('/api/guilds/:id/branding/banner', (req, reply) => reply.send({ ok: true, bannerUrl: null }));
    app.delete('/api/guilds/:id/branding/avatar', (req, reply) => reply.send({ ok: true }));
    app.delete('/api/guilds/:id/branding/banner', (req, reply) => reply.send({ ok: true }));
    app.post('/api/guilds/:id/appearance/bg', (req, reply) => reply.send({ ok: true, url: '' }));
    app.get('/api/guilds/:id/bg', (req, reply) => reply.code(404).send({ error: 'No wallpaper set' }));

    app.get('/api/guilds/:id/tags', (req, reply) => reply.send({ tags: tagDoc }));
    app.post('/api/guilds/:id/tags', (req, reply) => {
        const { name, content, trigger } = req.body || {};
        const n = String(name || '').toLowerCase();
        if (!/^[a-z0-9_-]{1,32}$/.test(n) || !content) return reply.code(400).send({ ok: false, error: 'Invalid tag name or empty content' });
        tagDoc[n] = { content: String(content), authorId: USER.id, uses: 0, at: Date.now(), trigger: trigger === true };
        return reply.send({ ok: true, tag: tagDoc[n] });
    });
    app.delete('/api/guilds/:id/tags/:name', (req, reply) => {
        const ok = delete tagDoc[req.params.name];
        return reply.code(ok ? 200 : 404).send({ ok });
    });

    app.setNotFoundHandler((req, reply) =>
        req.url.startsWith('/api/')
            ? reply.code(404).send({ ok: false, error: `Preview stub: no handler for ${req.method} ${req.url}` })
            : reply.code(404).type('text/html').send(fs.readFileSync(path.join(WEB, 'pages', 'error.html'))));

    await app.listen({ port: PORT, host: '127.0.0.1' });
    const url = `http://localhost:${PORT}`;
    console.log(`Dashboard preview → ${url}/dashboard/${GUILD.id}`);
    console.log(`Landing page      → ${url}/`);
    if (process.argv.includes('--no-open')) return;
    exec(`start "" "${url}/dashboard/${GUILD.id}"`).unref?.();
}

main().catch((err) => {
    console.error('Preview failed to start:', err);
    process.exit(1);
});
