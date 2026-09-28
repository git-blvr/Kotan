const { PermissionFlagsBits } = require('discord.js');
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

const permName = (bit) => {
    const key = Object.entries(PermissionFlagsBits).find(([, v]) => v === bit)?.[0];
    return key ? key.replace(/([a-z])([A-Z])/g, '$1 $2') : null;
};

async function guildGate(req, reply) {
    const err = checkGuildAccess(req.client, req.session, req.params.id);
    if (err) return reply.code(err.status).send({ ok: false, ...err });
    req.guild = req.client.guilds.cache.get(req.params.id);
}

module.exports = async (app) => {
    app.addHook('preHandler', rateLimit({ max: 240 }));

    // ---------- public ----------

    app.get('/api/me', (req, reply) => reply.send({ user: req.session?.user || null }));

    app.get('/api/stats', { preHandler: rateLimit({ max: 30 }) }, (req, reply) => {
        const client = req.client;
        reply.send({
            guilds: client?.guilds.cache.size || 0,
            users: client ? client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0) : 0,
            commands: client?.commands.size || 0,
        });
    });

    app.get('/api/commands', { preHandler: rateLimit({ max: 30 }) }, (req, reply) => {
        const client = req.client;
        const live = new Map();
        if (client) for (const c of client.commands.values()) live.set(c.name, c);
        reply.send({
            prefix: config.prefix,
            commands: commands.map((c) => {
                const cmd = live.get(c.name) || {};
                return {
                    name: c.name,
                    description: c.description,
                    module: c.module,
                    usage: cmd.usage || '',
                    aliases: cmd.aliases || [],
                    cooldown: cmd.cooldown || 0,
                    permissions: (cmd.userPermissions || []).map(permName).filter(Boolean),
                };
            }),
            modules,
        });
    });

    // Real liveness: the website shares the bot process, so these are live
    // process reads — plus the minute-bucketed uptimeLog the bot persists.
    app.get('/api/uptime', { preHandler: rateLimit({ max: 60 }) }, async (req, reply) => {
        const client = req.client;
        const ready = !!client?.isReady();
        const { uptimeLog } = await db.getHeartbeat().catch(() => ({ uptimeLog: [] }));
        const now = Date.now();
        const dayStart = Math.floor((now - 86400_000) / 60000);
        const upMinutes = new Set((uptimeLog || []).filter((m) => m >= dayStart)).size;
        const ping = client?.ws.ping ?? -1;
        reply.send({
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

    app.get('/api/guilds', { preHandler: requireAuthApi }, (req, reply) =>
        reply.send({ guilds: manageableGuilds(req.client, req.session).filter((g) => !blacklist.isGuildBlacklisted(g.id)) }));

    // ---------- per-guild (all gated by checkGuildAccess) ----------

    await app.register(async (gg) => {
        gg.addHook('preHandler', requireAuthApi);
        gg.addHook('preHandler', guildGate);

        gg.get('/', async (req, reply) => reply.send({
            guild: { id: req.guild.id, name: req.guild.name, icon: req.guild.icon, memberCount: req.guild.memberCount },
            settings: await settings.getSettings(req.guild.id),
            modules,
            commands,
        }));

        gg.get('/channels', (req, reply) => reply.send({ channels: guildData.guildChannels(req.guild) }));
        gg.get('/roles', (req, reply) => reply.send({ roles: guildData.guildRoles(req.guild) }));

        gg.get('/messages', async (req, reply) => {
            const out = await guildData.guildMessages(req.guild, String(req.query.channel || ''));
            if (out.error) return reply.code(400).send(out);
            return reply.send(out);
        });

        gg.get('/stats', async (req, reply) => {
            const id = req.guild.id;
            // Overview range pills — retention caps at 45 days.
            const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 7), 45);
            const [usage, growth, mod, audit, recent] = await Promise.all([
                db.getCommandUsage(id, days),
                db.getMemberGrowth(id, days),
                db.getModActivity(id, days),
                db.getAudit(id, 15),
                db.getRecentModActions(id, 5),
            ]);
            return reply.send({ usage, growth, mod, audit, recent, ping: req.client?.ws.ping ?? -1 });
        });

        gg.post('/settings', async (req, reply) => {
            const { section, fields } = req.body || {};
            const result = await settings.applySection(req.guild.id, req.session.user.id, String(section || ''), fields);
            if (result.error) return reply.code(result.status).send({ ok: false, error: result.error });
            // Branding applies immediately — rename the bot inside this guild.
            if (section === 'branding' && req.guild) {
                const nick = result.settings.branding?.nickname || null;
                req.guild.members.me?.setNickname(nick).catch(() => {});
            }
            return reply.send({ ok: true, settings: result.settings });
        });

        // Global avatar change — affects the bot everywhere, not just this guild.
        gg.post('/branding/avatar', async (req, reply) => {
            const dataUrl = String(req.body?.avatar || '');
            if (!/^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(dataUrl) || dataUrl.length > 4_000_000)
                return reply.code(400).send({ ok: false, error: 'Send a PNG/JPEG/WebP image under ~3MB' });
            try {
                await req.client.user.setAvatar(dataUrl);
                return reply.send({ ok: true });
            } catch (e) {
                return reply.code(500).send({ ok: false, error: e.message });
            }
        });

        gg.get('/tags', async (req, reply) =>
            reply.send({ tags: await db.getTags(req.guild.id) }));

        gg.post('/tags', async (req, reply) => {
            const { name, content, trigger } = req.body || {};
            const tag = await db.addTag(req.guild.id, String(name || '').toLowerCase(), String(content || ''), req.session.user.id, trigger === true);
            if (!tag) return reply.code(400).send({ ok: false, error: 'Invalid tag name (a-z 0-9 _ -, max 32) or empty content' });
            return reply.send({ ok: true, tag });
        });

        gg.delete('/tags/:name', async (req, reply) => {
            const ok = await db.deleteTag(req.guild.id, req.params.name);
            return reply.code(ok ? 200 : 404).send({ ok });
        });
    }, { prefix: '/api/guilds/:id' });

    // ---------- developer-only admin ----------

    await app.register(async (admin) => {
        admin.addHook('preHandler', requireAuthApi);
        admin.addHook('preHandler', async (req, reply) => {
            if (!isDeveloper(req.session.user.id)) return reply.code(403).send({ ok: false, error: 'Developer only' });
        });

        admin.get('/', (req, reply) => reply.send({ entries: blacklist.list() }));

        admin.post('/', (req, reply) => {
            const { guildId, reason } = req.body || {};
            if (!/^\d{17,20}$/.test(String(guildId || ''))) return reply.code(400).send({ ok: false, error: 'Invalid guild ID' });
            blacklist.add(guildId, String(reason || 'No reason provided').slice(0, 200), req.session.user.id);
            const guild = req.client.guilds.cache.get(String(guildId));
            if (guild) guild.leave().catch(() => {});
            return reply.send({ ok: true });
        });

        admin.delete('/:guildId', (req, reply) =>
            reply.send({ ok: blacklist.remove(req.params.guildId) }));
    }, { prefix: '/api/admin/blacklist' });

    // ---------- pages data ----------

    app.get('/api/meta/devtools', { preHandler: requireAuthApi }, (req, reply) =>
        reply.send({ developer: isDeveloper(req.session.user.id) }));
};
