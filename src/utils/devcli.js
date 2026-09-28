const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const logger = require('./logger');
const db = require('./database');

// Interactive dev console — lives inside the bot process and opens after the
// client logs in (registered on ClientReady in bot.js). Talks to `client`/`db`
// directly; no HTTP, no auth — your terminal is the trust boundary.
//
// Skipped when stdin can't be typed into (pm2, daemons, devctl supervisor —
// those set pm_id or KOTAN_NO_CLI). Under `npm run` stdin is a pipe: still
// usable, we just echo keystrokes ourselves.

module.exports = {
    startDevConsole(client, { shutdown }) {
        if (process.env.pm_id !== undefined || process.env.KOTAN_NO_CLI) return;

        const say = (...a) => console.log(...a);
        const green = (s) => `\x1b[32m${s}\x1b[0m`;
        const red = (s) => `\x1b[31m${s}\x1b[0m`;
        const grey = (s) => `\x1b[90m${s}\x1b[0m`;

        const table = (rows, cols) => {
            const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
            say(cols.map((c, i) => c.padEnd(w[i])).join('  '));
            say(w.map((x) => '─'.repeat(x)).join('  '));
            rows.forEach((r) => say(cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  ')));
        };

        async function respawn() {
            if (process.env.pm_id !== undefined) return shutdown('cli restart'); // pm2 brings it back
            // Standalone run: spawn a fresh process on this terminal, then die.
            spawn(process.execPath, [path.resolve(process.argv[1])], {
                cwd: process.cwd(), env: process.env, stdio: 'inherit',
            }).unref();
            await shutdown('cli restart');
        }

        const cmds = {
            async help() {
                say(`
  restart                     respawn the bot on this terminal (pm2: just exits, pm2 restarts)
  close / exit                graceful shutdown
  status                      uptime, ping, guilds
  stats                       memory, caches, db size
  commands                    loaded commands (alias/trigger/slash/dm)
  guilds                      guilds the bot is in
  guild <id>                  guild detail + merged settings
  leave <guildId>             leave a guild
  reload                      hot-reload command files from disk
  deploy                      push global slash commands to Discord
  settings <gid> [section]    read merged settings (or one section)
  set <gid> <section> <json>  write a section (dashboard's validator)
  presence <status> [type] [name…]   e.g. presence dnd watching dev
  say <channelId> <text…>     send a message as the bot
  eval <code…>                run JS with client/db/require in scope
  clear / help`);
            },
            async restart() { await respawn(); },
            async close() { await shutdown('cli close'); },
            async exit() { await shutdown('cli exit'); },
            async quit() { await shutdown('cli quit'); },
            async status() {
                const m = process.memoryUsage();
                say(`${green('ready')} · ${client.user.tag} · up ${Math.floor(process.uptime())}s · ping ${client.ws.ping}ms · ${client.guilds.cache.size} guilds · rss ${(m.rss / 1048576).toFixed(1)}MB`);
            },
            async stats() {
                const fs = require('fs');
                let dbSize = null;
                try { dbSize = fs.statSync(path.join(__dirname, '..', '..', 'data', 'kotan.sqlite')).size; } catch {}
                const m = process.memoryUsage();
                say(`rss ${(m.rss / 1048576).toFixed(1)}MB · heap ${(m.heapUsed / 1048576).toFixed(1)}/${(m.heapTotal / 1048576).toFixed(1)}MB · cmds ${client.commands.size} · users ${client.users.cache.size} · db ${dbSize ? (dbSize / 1048576).toFixed(1) + 'MB' : '?'}`);
            },
            async commands() {
                table([...client.commands.values()].map((c) => ({
                    name: c.name, cat: c.category,
                    aliases: (c.aliases || []).join(','), triggers: (c.triggers || []).join(','),
                    slash: c.executeSlash ? '✓' : '', dm: c.guildOnly === false ? '✓' : '',
                })), ['name', 'cat', 'aliases', 'triggers', 'slash', 'dm']);
            },
            async guilds() {
                table(client.guilds.cache.map((g) => ({ id: g.id, name: g.name, members: g.memberCount })), ['id', 'name', 'members']);
            },
            async guild(id) {
                if (!id) return say(red('usage: guild <id>'));
                const g = client.guilds.cache.get(id);
                if (!g) return say(red('not in that guild'));
                table([{ id: g.id, name: g.name, members: g.memberCount, channels: g.channels.cache.size, roles: g.roles.cache.size, boost: g.premiumTier }], ['id', 'name', 'members', 'channels', 'roles', 'boost']);
                say(JSON.stringify(await db.getGuildSettings(id), null, 1).slice(0, 4000));
            },
            async leave(id) {
                if (!id) return say(red('usage: leave <guildId>'));
                const g = client.guilds.cache.get(id);
                if (!g) return say(red('not in that guild'));
                await g.leave();
                say(green(`left ${g.name}`));
            },
            async reload() {
                const dir = path.join(__dirname, '..', 'commands');
                for (const k of Object.keys(require.cache)) if (k.startsWith(dir)) delete require.cache[k];
                client.commands.clear(); client.aliases.clear(); client.triggers.clear();
                require('../handlers/commandHandler')(client);
                say(green(`reloaded — ${client.commands.size} commands`));
            },
            async deploy() {
                const { toSlashJSON, isSlashReady } = require('../helpers/slash');
                const body = [...client.commands.values()].filter(isSlashReady).map(toSlashJSON);
                await client.application.commands.set(body);
                say(green(`deployed ${body.length} slash commands`));
            },
            async settings(gid, section) {
                if (!gid) return say(red('usage: settings <guildId> [section]'));
                const s = await db.getGuildSettings(gid);
                say(JSON.stringify(section ? s[section] ?? '(no such section)' : s, null, 1).slice(0, 6000));
            },
            async set(gid, section, ...json) {
                if (!gid || !section || !json.length) return say(red('usage: set <guildId> <section> <json>'));
                const { applySection } = require('../web/settings');
                const r = await applySection(gid, 'cli', section, JSON.parse(json.join(' ')));
                if (r.status === 400) return say(red(r.error || 'rejected'));
                say(green(`saved ${section}`) + ' ' + grey(JSON.stringify(r.settings[section]).slice(0, 400)));
            },
            async presence(status, type, ...name) {
                if (!status) return say(red('usage: presence <online|idle|dnd|invisible> [playing|watching|listening|competing|custom] [name…]'));
                const TYPES = { playing: 0, streaming: 1, listening: 2, watching: 3, custom: 4, competing: 5 };
                await client.user.setPresence({
                    status: ['online', 'idle', 'dnd', 'invisible'].includes(status) ? status : 'online',
                    activities: name.length ? [{ name: name.join(' ').slice(0, 128), type: TYPES[type] ?? 3 }] : [],
                });
                say(green('presence updated'));
            },
            async say(channelId, ...text) {
                if (!channelId || !text.length) return say(red('usage: say <channelId> <text…>'));
                const ch = await client.channels.fetch(channelId).catch(() => null);
                if (!ch?.isTextBased()) return say(red('channel not found or not text-based'));
                await ch.send(text.join(' ').slice(0, 2000));
                say(green('sent'));
            },
            async eval(...code) {
                if (!code.length) return say(red('usage: eval <code…>'));
                try {
                    const result = await eval(code.join(' '));
                    say(green(typeof result === 'object' ? JSON.stringify(result, null, 1)?.slice(0, 3000) : String(result)));
                } catch (err) {
                    say(red(String(err.stack || err).slice(0, 1000)));
                }
            },
            async clear() { console.clear(); },
        };

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            prompt: 'kotan> ',
            terminal: process.stdin.isTTY === true,
        });
        // Piped stdin (npm run): readline won't echo — mirror keystrokes.
        if (!process.stdin.isTTY) process.stdin.on('data', (d) => process.stdout.write(d));

        rl.on('line', async (line) => {
            const [cmd, ...args] = line.trim().split(/\s+/).filter(Boolean);
            if (cmd) {
                const fn = cmds[cmd.toLowerCase()];
                if (!fn) say(red(`unknown command "${cmd}" — try help`));
                else { try { await fn(...args); } catch (e) { say(red(e.message)); } }
            }
            rl.prompt();
        });
        rl.on('close', () => logger.warn('stdin closed — dev console off (bot keeps running)'));
        rl.on('SIGINT', () => shutdown('SIGINT'));

        say(grey('dev console — type `help`'));
        rl.prompt();
        return rl;
    },
};
