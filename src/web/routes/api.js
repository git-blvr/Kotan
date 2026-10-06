const { PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('../../utils/database');
const config = require('../../config');
const env = require('../env');
const { requireAuthApi } = require('../auth');
const { rateLimit } = require('../rateLimit');
const { manageableGuilds, checkGuildAccess, verifyMemberAccess, isDeveloper } = require('../permissions');
const blacklist = require('../blacklist');
const settings = require('../settings');
const guildData = require('../guildData');
const tickets = require('../../utils/tickets');
const captcha = require('../../utils/captcha');
const voicemaster = require('../../utils/voicemaster');
const { memberPayload } = require('../../utils/welcomeMsg');
const welcomeImg = require('../../utils/welcomeImg');
const { dominantColor, toHex, ALLOWED_IMAGE_HOSTS } = require('../../utils/dominantColor');
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
    // Session guild list is a login-time snapshot; re-verify live membership
    // (cached 10 min) so revoked MANAGE_GUILD can't ride a 30-day session.
    const ok = await verifyMemberAccess(req.guild, req.session.user.id);
    if (!ok) return reply.code(403).send({ ok: false, status: 403, error: 'You do not manage this server' });
}

// Route-level caps on top of the global 240/min — write and upload endpoints
// get tighter buckets since they're the expensive/abusable ones.
const mutLimit = rateLimit({ max: 60 });
const uploadLimit = rateLimit({ max: 15 });

// Matches the decoded buffer against the declared image type — the data-URL
// prefix is client-supplied and says nothing about the actual bytes.
const MAGIC = {
    png: [0x89, 0x50, 0x4e, 0x47],
    jpg: [0xff, 0xd8, 0xff],
    gif: [0x47, 0x49, 0x46, 0x38], // GIF8
};
const isWebp = (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
const magicOk = (ext, buf) => (ext === 'webp' ? isWebp(buf) : (MAGIC[ext] || []).every((v, i) => buf[i] === v));

// Dominant-color extraction is a server-side fetch — the host allowlist
// keeps it from becoming an open proxy (same hosts the dashboard CSP shows,
// enforced again inside dominantColor against redirect escape).
const DOM_COLOR_HOSTS = ALLOWED_IMAGE_HOSTS;

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
            bot: {
                id: req.client.user.id,
                username: req.client.user.username,
                avatar: req.client.user.avatar,
                // Guild-aware: member avatar/banner win over the global ones.
                avatarUrl: req.guild.members.me?.displayAvatarURL({ size: 256 }) || null,
                bannerUrl:
                    req.guild.members.me?.bannerURL?.({ size: 512 }) ||
                    req.client.user.bannerURL?.({ size: 512 }) ||
                    null,
            },
            settings: await settings.getSettings(req.guild.id),
            modules,
            commands,
        }));

        gg.get('/channels', (req, reply) =>
            reply.send({ channels: guildData.guildChannels(req.guild), categories: guildData.guildCategories(req.guild), voice: guildData.guildVoiceChannels(req.guild) }));

        // Posts the voicemaster control panel — same "Post panel" pattern
        // as tickets/captcha.
        gg.post('/voicemaster/panel', { preHandler: mutLimit }, async (req, reply) => {
            const ch = req.guild.channels.cache.get(String(req.body?.channel || ''));
            if (!ch || !ch.isTextBased()) return reply.code(400).send({ error: 'Unknown channel' });
            const v = (await settings.getSettings(req.guild.id)).voicemaster;
            if (!v?.enabled) return reply.code(400).send({ error: 'VoiceMaster is disabled — enable and save first' });
            if (!v.triggerId) return reply.code(400).send({ error: 'Pick a trigger channel first' });
            await ch.send(await voicemaster.panelPayload(req.guild, v)).catch(() => {});
            return reply.send({ ok: true });
        });

        // Posts the ticket panel into a channel — used by the dashboard's
        // "Post panel" button so setup is fully web-side.
        gg.post('/tickets/panel', { preHandler: mutLimit }, async (req, reply) => {
            const ch = req.guild.channels.cache.get(String(req.body?.channel || ''));
            if (!ch || !ch.isTextBased()) return reply.code(400).send({ error: 'Unknown channel' });
            const t = (await settings.getSettings(req.guild.id)).tickets;
            if (!t?.enabled) return reply.code(400).send({ error: 'Tickets are disabled — enable and save first' });
            await ch.send(await tickets.panelPayload(req.guild, t)).catch(() => {});
            return reply.send({ ok: true });
        });

        // Posts the CAPTCHA verify panel — same "Post panel" pattern as tickets.
        gg.post('/captcha/panel', { preHandler: mutLimit }, async (req, reply) => {
            const ch = req.guild.channels.cache.get(String(req.body?.channel || ''));
            if (!ch || !ch.isTextBased()) return reply.code(400).send({ error: 'Unknown channel' });
            const c = (await settings.getSettings(req.guild.id)).captcha;
            if (!c?.enabled) return reply.code(400).send({ error: 'CAPTCHA is disabled — enable and save first' });
            if (!c.roleId) return reply.code(400).send({ error: 'Pick a verified role first — nothing to grant otherwise' });
            await ch.send(await captcha.panelPayload(req.guild, c)).catch(() => {});
            return reply.send({ ok: true });
        });

        // Test-fire the welcome message — posts the draft from the editor
        // (card + canvas image + fallback text) to a chosen channel, so
        // unsaved designs can be checked without touching live config.
        gg.post('/welcome/test', { preHandler: mutLimit }, async (req, reply) => {
            const ch = req.guild.channels.cache.get(String(req.body?.channel || ''));
            if (!ch || !ch.isTextBased()) return reply.code(400).send({ error: 'Unknown channel' });
            const member = await req.guild.members.fetch(req.session.user.id).catch(() => null) || req.guild.members.me;
            if (!member) return reply.code(400).send({ error: 'Could not resolve you as a member' });
            const embed = {}; const embedErr = settings.SECTIONS.welcomeEmbed(embed, req.body?.embed || {});
            if (embedErr) return reply.code(400).send({ error: embedErr });
            const image = { elements: [] }; settings.SECTIONS.welcomeImage(image, req.body?.image || {});
            let payload = await memberPayload(member, embed, req.body?.message || 'Welcome {user}!');
            if (image.enabled) payload = await welcomeImg.attach(member, payload, image);
            await ch.send(payload).catch(() => {});
            return reply.send({ ok: true });
        });

        // Card editors' "dominant color" button — picks the accent matching
        // the card's thumbnail/icon so users don't have to eyeball a hex.
        gg.get('/dominant-color', { preHandler: rateLimit({ max: 30 }) }, async (req, reply) => {
            let u;
            try { u = new URL(String(req.query?.src || '')); }
            catch { return reply.code(400).send({ ok: false, error: 'Invalid URL' }); }
            if (u.protocol !== 'https:' || !DOM_COLOR_HOSTS.test(u.hostname))
                return reply.code(400).send({ ok: false, error: 'Discord CDN or i.imgur.com image URLs only' });
            const color = await dominantColor(u.href);
            if (color === null) return reply.code(422).send({ ok: false, error: 'Could not read that image' });
            return reply.send({ ok: true, color: toHex(color) });
        });
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

        // Activity page leaderboards — per-user message/voice totals and
        // per-channel message volume over the last `days` days. Member
        // info comes along so the page can filter by name/id/role without
        // a second round-trip per row.
        gg.get('/activity', { preHandler: rateLimit({ max: 30 }) }, async (req, reply) => {
            const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 90);
            const data = await db.getActivity(req.guild.id, days);
            const info = (m) => ({
                name: m.displayName,
                user: m.user?.username || '',
                avatar: m.displayAvatarURL({ size: 64 }),
                color: m.displayHexColor === '#000000' ? null : m.displayHexColor,
                roles: m.roles.cache.map((r) => r.id).filter((id) => id !== req.guild.id),
            });
            const members = {};
            const missing = [];
            for (const id of Object.keys(data.users)) {
                const m = req.guild.members.cache.get(id);
                if (m) members[id] = info(m);
                else missing.push(id);
            }
            // Resolve the rest — capped so a wide range can't turn one
            // page load into hundreds of member requests. Rows left
            // unresolved fall back to showing the raw ID client-side.
            if (missing.length) {
                const got = await req.guild.members
                    .fetch({ user: missing.slice(0, 300), time: 15_000 })
                    .catch(() => null);
                if (got?.values) for (const m of got.values()) members[m.id] = info(m);
            }
            return reply.send({ days, ...data, members });
        });

        gg.post('/settings', { preHandler: mutLimit }, async (req, reply) => {
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

        // Per-guild avatar/banner via the member profile (PATCH members/@me) —
        // the bot keeps its global identity elsewhere.
        const brandUpload = (key) => async (req, reply) => {
            const dataUrl = String(req.body?.[key] || '');
            if (!/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(dataUrl) || dataUrl.length > 4_500_000)
                return reply.code(400).send({ ok: false, error: 'Send a PNG/JPEG/WebP image under ~3MB' });
            try {
                await req.guild.members.editMe({ [key]: dataUrl });
                const me = req.guild.members.me;
                return reply.send({
                    ok: true,
                    avatarUrl: me?.displayAvatarURL({ size: 256 }) || null,
                    bannerUrl: me?.bannerURL?.({ size: 512 }) || null,
                });
            } catch (e) {
                return reply.code(500).send({ ok: false, error: e.message });
            }
        };
        const brandClear = (key) => async (req, reply) => {
            try {
                await req.guild.members.editMe({ [key]: null });
                const me = req.guild.members.me;
                return reply.send({
                    ok: true,
                    avatarUrl: me?.displayAvatarURL({ size: 256 }) || null,
                    bannerUrl: me?.bannerURL?.({ size: 512 }) || null,
                });
            } catch (e) {
                return reply.code(500).send({ ok: false, error: e.message });
            }
        };
        // Upload routes carry multi-MB base64 bodies — the global 256KB
        // bodyLimit would reject them, so they get their own caps. Keep the
        // global tight everywhere else.
        gg.post('/branding/avatar', { preHandler: uploadLimit, bodyLimit: 5_000_000 }, brandUpload('avatar'));
        gg.post('/branding/banner', { preHandler: uploadLimit, bodyLimit: 5_000_000 }, brandUpload('banner'));
        gg.delete('/branding/avatar', { preHandler: uploadLimit }, brandClear('avatar'));
        gg.delete('/branding/banner', { preHandler: uploadLimit }, brandClear('banner'));

        // Dashboard wallpaper upload — stored per-guild under data/bgs and
        // served back through /bg (kept out of src/web so uploads aren't source files).
        const BG_DIR = path.join(__dirname, '..', '..', '..', 'data', 'bgs');
        const bgFile = (gid) => (fs.existsSync(BG_DIR) ? fs.readdirSync(BG_DIR).find((f) => f.startsWith(`${gid}.`)) : null);
        gg.post('/appearance/bg', { preHandler: uploadLimit, bodyLimit: 9_000_000 }, async (req, reply) => {
            const dataUrl = String(req.body?.image || '');
            const m = /^data:image\/(png|jpe?g|webp|gif);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
            if (!m || dataUrl.length > 8_000_000)
                return reply.code(400).send({ ok: false, error: 'Send a PNG/JPEG/WebP/GIF under ~6MB' });
            const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
            const buf = Buffer.from(m[2], 'base64');
            if (!buf.length || buf.length > 6_000_000)
                return reply.code(400).send({ ok: false, error: 'Decoded image must be under 6MB' });
            if (!magicOk(ext, buf))
                return reply.code(400).send({ ok: false, error: `File is not a valid ${ext.toUpperCase()}` });
            const fsp = fs.promises;
            await fsp.mkdir(BG_DIR, { recursive: true });
            const old = bgFile(req.guild.id);
            if (old) await fsp.rm(path.join(BG_DIR, old), { force: true });
            await fsp.writeFile(path.join(BG_DIR, `${req.guild.id}.${ext}`), buf, { mode: 0o600 });
            return reply.send({ ok: true, url: `/api/guilds/${req.guild.id}/bg?v=${Date.now()}` });
        });
        gg.get('/bg', async (req, reply) => {
            const f = bgFile(req.guild.id);
            if (!f) return reply.code(404).send({ error: 'No wallpaper set' });
            const mime = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[path.extname(f).slice(1)] || 'image/png';
            return reply.type(mime).header('cache-control', 'public, max-age=3600').send(fs.createReadStream(path.join(BG_DIR, f)));
        });

        gg.get('/tags', async (req, reply) =>
            reply.send({ tags: await db.getTags(req.guild.id) }));

        gg.post('/tags', { preHandler: mutLimit }, async (req, reply) => {
            const { name, content, trigger } = req.body || {};
            const tag = await db.addTag(req.guild.id, String(name || '').toLowerCase(), String(content || ''), req.session.user.id, trigger === true);
            if (!tag) return reply.code(400).send({ ok: false, error: 'Invalid tag name (no spaces, slashes or leading prefix, max 32) or empty content' });
            return reply.send({ ok: true, tag });
        });

        gg.delete('/tags/:name', { preHandler: mutLimit }, async (req, reply) => {
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

        admin.post('/', { preHandler: mutLimit }, (req, reply) => {
            const { guildId, reason } = req.body || {};
            if (!/^\d{17,20}$/.test(String(guildId || ''))) return reply.code(400).send({ ok: false, error: 'Invalid guild ID' });
            blacklist.add(guildId, String(reason || 'No reason provided').slice(0, 200), req.session.user.id);
            const guild = req.client.guilds.cache.get(String(guildId));
            if (guild) guild.leave().catch(() => {});
            return reply.send({ ok: true });
        });

        admin.delete('/:guildId', { preHandler: mutLimit }, (req, reply) =>
            reply.send({ ok: blacklist.remove(req.params.guildId) }));
    }, { prefix: '/api/admin/blacklist' });

    // ---------- pages data ----------

    app.get('/api/meta/devtools', { preHandler: requireAuthApi }, (req, reply) =>
        reply.send({ developer: isDeveloper(req.session.user.id) }));
};
