const express = require('express');
const path = require('node:path');
const db = require('../../utils/database');
const config = require('../../config');
const env = require('../env');
const { requireAuthApi } = require('../auth');
const { rateLimit } = require('../rateLimit');
const { manageableGuilds, checkGuildAccess, isDeveloper } = require('../permissions');
const blacklist = require('../blacklist');
const settings = require('../settings');
const guildData = require('../guildData');
const commands = require('../config/commands');
const modules = require('../config/modules');

const router = express.Router();
router.use(express.json({ limit: '256kb' }));
router.use(rateLimit({ max: 240 }));

// ---------- public ----------

router.get('/api/me', (req, res) => {
    res.json({ user: req.session?.user || null });
});

router.get('/api/stats', rateLimit({ max: 30 }), async (req, res) => {
    const client = req.app.locals.client;
    res.json({
        guilds: client?.guilds.cache.size || 0,
        users: client ? client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0) : 0,
        commands: client?.commands.size || 0,
    });
});

router.get('/api/commands', rateLimit({ max: 30 }), (req, res) => {
    res.json({
        prefix: config.prefix,
        commands: commands.map((c) => ({ name: c.name, description: c.description, module: c.module })),
        modules,
    });
});

// Real liveness: the website shares the bot process, so these are live
// process reads — plus the minute-bucketed uptimeLog the bot persists.
router.get('/api/uptime', rateLimit({ max: 60 }), async (req, res) => {
    const client = req.app.locals.client;
    const ready = !!client?.isReady();
    const { uptimeLog } = await db.getHeartbeat().catch(() => ({ uptimeLog: [] }));
    const now = Date.now();
    const dayStart = Math.floor((now - 86400_000) / 60000);
    const upMinutes = new Set((uptimeLog || []).filter((m) => m >= dayStart)).size;
    const ping = client?.ws.ping ?? -1;
    res.json({
        status: !ready ? 'down' : ping >= 0 && ping < 500 ? 'operational' : 'degraded',
        uptimeSeconds: client?.uptime ? Math.floor(client.uptime / 1000) : 0,
        uptimePercent24h: Math.round((upMinutes / 1440) * 1000) / 10,
        ping,
        guilds: client?.guilds.cache.size || 0,
        users: client ? client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0) : 0,
        memoryMB: Math.round(process.memoryUsage().rss / 1048576),
        heapMB: Math.round(process.memoryUsage().heapUsed / 1048576),
        node: process.version,
        components: {
            gateway: !ready ? 'down' : ping >= 0 && ping < 250 ? 'ok' : ping >= 0 ? 'warn' : 'warn',
            api: 'ok',
            database: 'ok',
            memory: process.memoryUsage().rss < 512 * 1048576 ? 'ok' : 'warn',
        },
        now,
    });
});

// ---------- session-scoped ----------

router.get('/api/guilds', requireAuthApi, (req, res) => {
    const client = req.app.locals.client;
    res.json({ guilds: manageableGuilds(client, req.session).filter((g) => !blacklist.isGuildBlacklisted(g.id)) });
});

// ---------- per-guild (all gated by checkGuildAccess) ----------

function guildGate(req, res, next) {
    const err = checkGuildAccess(req.app.locals.client, req.session, req.params.id);
    if (err) return res.status(err.status).json({ ok: false, ...err });
    req.guild = req.app.locals.client.guilds.cache.get(req.params.id);
    next();
}

const gg = express.Router({ mergeParams: true });
gg.use(requireAuthApi, guildGate);

gg.get('/', async (req, res) => {
    res.json({
        guild: { id: req.guild.id, name: req.guild.name, icon: req.guild.icon, memberCount: req.guild.memberCount },
        settings: await settings.getSettings(req.guild.id),
        modules,
        commands,
    });
});

gg.get('/channels', (req, res) => res.json({ channels: guildData.guildChannels(req.guild) }));
gg.get('/roles', (req, res) => res.json({ roles: guildData.guildRoles(req.guild) }));

gg.get('/messages', async (req, res) => {
    const out = await guildData.guildMessages(req.guild, String(req.query.channel || ''));
    if (out.error) return res.status(400).json(out);
    res.json(out);
});

gg.get('/stats', async (req, res) => {
    const id = req.guild.id;
    const [usage, growth, mod, audit, recent] = await Promise.all([
        db.getCommandUsage(id, 14),
        db.getMemberGrowth(id, 14),
        db.getModActivity(id, 14),
        db.getAudit(id, 15),
        db.getRecentModActions(id, 5),
    ]);
    res.json({ usage, growth, mod, audit, recent });
});

gg.post('/settings', async (req, res) => {
    const { section, fields } = req.body || {};
    const result = await settings.applySection(req.guild.id, req.session.user.id, String(section || ''), fields);
    if (result.error) return res.status(result.status).json({ ok: false, error: result.error });
    res.json({ ok: true, settings: result.settings });
});

gg.get('/tags', async (req, res) => {
    res.json({ tags: await db.getTags(req.guild.id) });
});

gg.post('/tags', async (req, res) => {
    const { name, content } = req.body || {};
    const tag = await db.addTag(req.guild.id, String(name || '').toLowerCase(), String(content || ''), req.session.user.id);
    if (!tag) return res.status(400).json({ ok: false, error: 'Invalid tag name (a-z 0-9 _ -, max 32) or empty content' });
    res.json({ ok: true, tag });
});

gg.delete('/tags/:name', async (req, res) => {
    const ok = await db.deleteTag(req.guild.id, req.params.name);
    res.status(ok ? 200 : 404).json({ ok });
});

router.use('/api/guilds/:id', gg);

// ---------- developer-only admin ----------

const admin = express.Router();
admin.use(requireAuthApi, (req, res, next) => {
    if (!isDeveloper(req.session.user.id)) return res.status(403).json({ ok: false, error: 'Developer only' });
    next();
});

admin.get('/', (req, res) => res.json({ entries: blacklist.list() }));

admin.post('/', (req, res) => {
    const { guildId, reason } = req.body || {};
    if (!/^\d{17,20}$/.test(String(guildId || ''))) return res.status(400).json({ ok: false, error: 'Invalid guild ID' });
    blacklist.add(guildId, String(reason || 'No reason provided').slice(0, 200), req.session.user.id);
    const guild = req.app.locals.client.guilds.cache.get(String(guildId));
    if (guild) guild.leave().catch(() => {});
    res.json({ ok: true });
});

admin.delete('/:guildId', (req, res) => {
    res.json({ ok: blacklist.remove(req.params.guildId) });
});

router.use('/api/admin/blacklist', admin);

// ---------- pages data (html shells are static; these just gate them) ----------

router.get('/api/meta/devtools', requireAuthApi, (req, res) => {
    res.json({ developer: isDeveloper(req.session.user.id) });
});

module.exports = router;
