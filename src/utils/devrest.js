const http = require('http');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const db = require('./database');

// Developer REST API — ops endpoints for the running bot, completely separate
// from the public dashboard listener. Bound to localhost by default and gated
// by a bearer token; it never starts unless DEV_API_KEY is set.
//
//   DEV_API_KEY   bearer token (required — unset = server off)
//   DEV_API_PORT  listen port   (default 3210)
//   DEV_API_HOST  bind host     (default 127.0.0.1 — do not expose publicly)
//   DEV_API_EVAL  '1' enables POST /eval (arbitrary code — local dev only)
//
// Quick reference (`Authorization: Bearer <DEV_API_KEY>` on every route):
//   GET    /health                 status, uptime, ping, memory, counts
//   GET    /stats                  heap/cache/db sizes
//   GET    /commands               every loaded command + aliases + triggers
//   POST   /commands/reload        hot-reload all command files from disk
//   POST   /commands/deploy        push global slash commands to Discord
//   GET    /guilds                 guild list (id, name, members)
//   GET    /guilds/:id             guild detail + merged settings
//   POST   /guilds/:id/leave       leave a guild
//   GET    /settings/:guildId      merged settings
//   PATCH  /settings/:guildId/:s   apply one section ({fields...}) via the
//                                  same validator the dashboard uses
//   POST   /presence               {status, name, type} update presence
//   POST   /say                    {channelId, content} send a message
//   POST   /restart                graceful shutdown — pm2/systemd restarts it
//   POST   /close                  graceful shutdown (under pm2 it respawns!
//                                  use `pm2 stop kotan` for a real stop)
//   POST   /eval                   {code} — only when DEV_API_EVAL=1

const ACTIVITY_TYPES = { playing: 0, streaming: 1, listening: 2, watching: 3, custom: 4, competing: 5 };

module.exports = {
    startDevApi(client, shutdown) {
        const key = process.env.DEV_API_KEY;
        if (!key) return; // disabled — no token configured

        const port = parseInt(process.env.DEV_API_PORT || '3210', 10);
        const host = process.env.DEV_API_HOST || '127.0.0.1';
        const started = Date.now();

        const send = (res, code, obj) => {
            res.writeHead(code, { 'content-type': 'application/json' });
            res.end(JSON.stringify(obj));
        };

        const body = (req) => new Promise((resolve, reject) => {
            let data = '';
            req.on('data', (c) => {
                data += c;
                if (data.length > 262144) { reject(new Error('body too large')); req.destroy(); }
            });
            req.on('end', () => {
                if (!data) return resolve({});
                try { resolve(JSON.parse(data)); } catch { reject(new Error('invalid JSON')); }
            });
            req.on('error', reject);
        });

        const routes = {
            'GET /health': () => ({
                ok: true,
                ready: client.isReady(),
                user: client.user?.tag,
                uptime: Math.floor(process.uptime()),
                apiUptime: Math.floor((Date.now() - started) / 1000),
                ping: client.ws.ping,
                guilds: client.guilds.cache.size,
                users: client.users.cache.size,
                pid: process.pid,
                node: process.version,
                pm2: process.env.pm_id !== undefined,
            }),

            'GET /stats': () => {
                const mem = process.memoryUsage();
                let dbSize = null;
                try { dbSize = fs.statSync(path.join(__dirname, '..', '..', 'data', 'kotan.sqlite')).size; } catch {}
                return {
                    ok: true,
                    rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal,
                    guilds: client.guilds.cache.size, users: client.users.cache.size,
                    commands: client.commands.size, aliases: client.aliases.size, triggers: client.triggers.size,
                    cooldowns: client.cooldowns.size, dbBytes: dbSize,
                };
            },

            'GET /commands': () => ({
                ok: true,
                count: client.commands.size,
                commands: [...client.commands.values()].map((c) => ({
                    name: c.name, category: c.category, description: c.description,
                    aliases: c.aliases, triggers: c.triggers, cooldown: c.cooldown,
                    slash: !!c.executeSlash, guildOnly: c.guildOnly !== false,
                })),
            }),

            'POST /commands/reload': () => {
                const dir = path.join(__dirname, '..', 'commands');
                for (const k of Object.keys(require.cache)) {
                    if (k.startsWith(dir)) delete require.cache[k];
                }
                client.commands.clear(); client.aliases.clear(); client.triggers.clear();
                require('../handlers/commandHandler')(client);
                return { ok: true, commands: client.commands.size };
            },

            'POST /commands/deploy': async () => {
                const { toSlashJSON, isSlashReady } = require('../helpers/slash');
                const body = [...client.commands.values()].filter(isSlashReady).map(toSlashJSON);
                await client.application.commands.set(body);
                return { ok: true, deployed: body.length };
            },

            'GET /guilds': () => ({
                ok: true,
                count: client.guilds.cache.size,
                guilds: client.guilds.cache.map((g) => ({
                    id: g.id, name: g.name, members: g.memberCount,
                    owner: g.ownerId, joined: g.joinedTimestamp,
                })),
            }),

            'GET /settings/:guildId': async (p) => {
                const s = await db.getGuildSettings(p.guildId);
                return { ok: true, settings: s };
            },

            'PATCH /settings/:guildId/:section': async (p, b) => {
                const { applySection } = require('../web/settings');
                const r = await applySection(p.guildId, 'dev-api', p.section, b);
                if (r.status === 400) return { ok: false, status: 400, error: r.error };
                return { ok: true, status: r.status, settings: r.settings[p.section] };
            },

            'POST /presence': async (p, b) => {
                await client.user.setPresence({
                    status: ['online', 'idle', 'dnd', 'invisible'].includes(b.status) ? b.status : 'online',
                    activities: b.name ? [{ name: String(b.name).slice(0, 128), type: ACTIVITY_TYPES[b.type] ?? 3 }] : [],
                });
                return { ok: true };
            },

            'POST /say': async (p, b) => {
                const ch = await client.channels.fetch(String(b.channelId || '')).catch(() => null);
                if (!ch?.isTextBased()) return { ok: false, status: 400, error: 'channel not found or not text-based' };
                await ch.send(String(b.content || '').slice(0, 2000) || '…');
                return { ok: true };
            },

            'POST /restart': async () => {
                setTimeout(() => shutdown('dev-api restart'), 300);
                return { ok: true, pm2Respawn: process.env.pm_id !== undefined };
            },

            'POST /close': async () => {
                setTimeout(() => shutdown('dev-api close'), 300);
                return {
                    ok: true,
                    note: process.env.pm_id !== undefined
                        ? 'under pm2 this process will respawn — `pm2 stop kotan` for a real stop'
                        : 'process exited',
                };
            },
        };

        // Templated routes — matched after the exact table misses.
        const paramRoutes = [
            [/^GET \/guilds\/(\d{5,25})$/, (m) => routes['__guildDetail'](m[1])],
            [/^POST \/guilds\/(\d{5,25})\/leave$/, async (m) => {
                const g = client.guilds.cache.get(m[1]);
                if (!g) return { ok: false, status: 404, error: 'not in that guild' };
                await g.leave();
                return { ok: true, left: m[1] };
            }],
            [/^PATCH \/settings\/(\d{5,25})\/([a-z]+)$/, async (m, b) => routes['PATCH /settings/:guildId/:section']({ guildId: m[1], section: m[2] }, b)],
            [/^GET \/settings\/(\d{5,25})$/, (m) => routes['GET /settings/:guildId']({ guildId: m[1] })],
        ];
        routes['__guildDetail'] = async (id) => {
            const g = client.guilds.cache.get(id);
            if (!g) return { ok: false, status: 404, error: 'not in that guild' };
            return {
                ok: true,
                guild: {
                    id: g.id, name: g.name, members: g.memberCount, owner: g.ownerId,
                    channels: g.channels.cache.size, roles: g.roles.cache.size,
                    joined: g.joinedTimestamp, boostTier: g.premiumTier,
                },
                settings: await db.getGuildSettings(id),
            };
        };

        if (process.env.DEV_API_EVAL === '1') {
            routes['POST /eval'] = async (p, b) => {
                try {
                    const result = await eval(String(b.code || ''));
                    return { ok: true, result: typeof result === 'object' ? JSON.parse(JSON.stringify(result)) : String(result) };
                } catch (err) {
                    return { ok: false, status: 400, error: String(err.stack || err).slice(0, 1000) };
                }
            };
        }

        const server = http.createServer(async (req, res) => {
            try {
                const auth = req.headers.authorization || '';
                if (auth !== `Bearer ${key}`) return send(res, 401, { ok: false, error: 'unauthorized' });

                const url = req.url.split('?')[0];
                const routeKey = `${req.method} ${url}`;
                let handler = routes[routeKey];
                let match = null;
                if (!handler) {
                    for (const [re, fn] of paramRoutes) {
                        const m = `${req.method} ${url}`.match(re);
                        if (m) { handler = (mm, bb) => fn(mm, bb); match = m; break; }
                    }
                }
                if (!handler) return send(res, 404, { ok: false, error: 'not found' });

                const b = req.method === 'GET' ? {} : await body(req);
                const out = await handler(match, b);
                send(res, out.status && !out.ok ? out.status : 200, out);
            } catch (err) {
                logger.error('dev-api error:', err);
                send(res, 500, { ok: false, error: String(err.message || err) });
            }
        });

        server.listen(port, host, () => logger.success(`Dev API listening on http://${host}:${port} (bearer-gated)`));
        server.on('error', (err) => logger.error(`Dev API failed to bind ${host}:${port}:`, err));
        return server;
    },
};
