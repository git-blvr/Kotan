#!/usr/bin/env node
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const readline = require('readline');

// Kotan dev console — `npm run cli`.
// Spawns the bot as a child process, injects a throwaway DEV_API_KEY so the
// dev REST layer (src/utils/devrest.js) is live only inside this supervised
// session, and exposes everything as terminal commands. The console survives
// bot crashes/exits — `restart` and `close` are real process control here.

const ROOT = path.join(__dirname, '..');
const PORT = process.env.DEV_API_PORT || '3210';
const HOST = `127.0.0.1:${PORT}`;
const KEY = crypto.randomBytes(24).toString('hex');

let child = null;
let childAlive = false;
let ready = false;

const grey = (s) => `\x1b[90m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const say = (...a) => console.log(...a);

async function api(route, { method = 'GET', body } = {}) {
    const r = await fetch(`http://${HOST}${route}`, {
        method,
        headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => null);
    if (!r) throw new Error('bot offline or dev API not reachable');
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
}

async function waitReady(timeoutMs = 20000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        if (!childAlive) throw new Error('bot process exited');
        try { const h = await api('/health'); if (h.ready) { ready = true; return h; } } catch {}
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error('timed out waiting for the bot to come up');
}

function startBot() {
    if (childAlive) return say(red('already running — `restart` instead'));
    ready = false;
    child = spawn(process.execPath, [path.join(ROOT, 'src', 'bot.js')], {
        cwd: ROOT,
        env: { ...process.env, DEV_API_KEY: KEY, DEV_API_PORT: PORT, DEV_API_EVAL: '1', KOTAN_NO_CLI: '1' },
        stdio: ['ignore', 'inherit', 'inherit'],
    });
    childAlive = true;
    say(grey(`bot spawned (pid ${child.pid}) — waiting for ready…`));
    child.once('exit', (code) => {
        childAlive = false; ready = false;
        say(grey(`bot exited (code ${code}) — 'start' to bring it back`));
        rl.prompt();
    });
    waitReady().then((h) => say(green(`up — ${h.user} · ${h.guilds} guilds · ping ${h.ping}ms`))).then(() => rl.prompt())
        .catch((e) => { say(red(e.message)); rl.prompt(); });
}

async function stopBot(signal = 'SIGTERM') {
    if (!childAlive) return say(red('not running'));
    const exited = new Promise((r) => child.once('exit', r));
    child.kill(signal);
    const timeout = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 8000);
    await exited;
    clearTimeout(timeout);
    say(green('stopped'));
}

const table = (rows, cols) => {
    const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? '').length)));
    say(cols.map((c, i) => c.padEnd(w[i])).join('  '));
    say(w.map((x) => '─'.repeat(x)).join('  '));
    rows.forEach((r) => say(cols.map((c, i) => String(r[c] ?? '').padEnd(w[i])).join('  ')));
};

const cmds = {
    async help() {
        say(`
  start                       spawn the bot if it isn't running
  restart                     graceful shutdown + respawn
  close / stop                kill the bot, stay in this console
  status                      health line (uptime, ping, guilds)
  stats                       memory, caches, db size
  commands                    loaded commands (alias/trigger/slash)
  guilds                      guilds the bot is in
  guild <id>                  one guild's detail + merged settings
  leave <guildId>             leave a guild
  reload                      hot-reload command files from disk
  deploy                      push global slash commands to Discord
  settings <gid> [section]    read merged settings (or one section)
  set <gid> <section> <json>  write a section (same rules as dashboard)
  presence <status> [type] [name…]   e.g. presence dnd watching dev
  say <channelId> <text…>     send a message as the bot
  eval <code…>                run JS with client/db in scope
  clear                       clear the screen
  exit / quit                 kill the bot and leave`);
    },
    async start() { startBot(); },
    async restart() {
        if (childAlive) await stopBot();
        startBot();
    },
    async close() { await stopBot(); },
    async stop() { await stopBot(); },
    async status() { const h = await api('/health'); say(`${h.ready ? green('ready') : red('connecting')} · ${h.user} · up ${h.uptime}s · ping ${h.ping}ms · ${h.guilds} guilds · pid ${h.pid}${h.pm2 ? ' · pm2' : ''}`); },
    async stats() { const s = await api('/stats'); say(`rss ${(s.rss / 1048576).toFixed(1)}MB · heap ${(s.heapUsed / 1048576).toFixed(1)}/${(s.heapTotal / 1048576).toFixed(1)}MB · cmds ${s.commands} · users ${s.users} · db ${s.dbBytes ? (s.dbBytes / 1048576).toFixed(1) + 'MB' : '?'}`); },
    async commands() {
        const { commands } = await api('/commands');
        table(commands.map((c) => ({ name: c.name, cat: c.category, aliases: (c.aliases || []).join(','), triggers: (c.triggers || []).join(','), slash: c.slash ? '✓' : '', dm: c.guildOnly ? '' : '✓' })), ['name', 'cat', 'aliases', 'triggers', 'slash', 'dm']);
    },
    async guilds() {
        const { guilds } = await api('/guilds');
        table(guilds.map((g) => ({ id: g.id, name: g.name, members: g.members })), ['id', 'name', 'members']);
    },
    async guild(id) {
        if (!id) return say(red('usage: guild <id>'));
        const { guild, settings } = await api(`/guilds/${id}`);
        table([{ id: guild.id, name: guild.name, members: guild.members, channels: guild.channels, roles: guild.roles, boost: guild.boostTier }], ['id', 'name', 'members', 'channels', 'roles', 'boost']);
        say(JSON.stringify(settings, null, 1).slice(0, 4000));
    },
    async leave(id) {
        if (!id) return say(red('usage: leave <guildId>'));
        const r = await api(`/guilds/${id}/leave`, { method: 'POST' });
        say(green(`left ${r.left}`));
    },
    async reload() { const r = await api('/commands/reload', { method: 'POST' }); say(green(`reloaded — ${r.commands} commands`)); },
    async deploy() { const r = await api('/commands/deploy', { method: 'POST' }); say(green(`deployed ${r.deployed} slash commands`)); },
    async settings(gid, section) {
        if (!gid) return say(red('usage: settings <guildId> [section]'));
        const { settings } = await api(`/settings/${gid}`);
        say(JSON.stringify(section ? settings[section] ?? '(no such section)' : settings, null, 1).slice(0, 6000));
    },
    async set(gid, section, ...json) {
        if (!gid || !section || !json.length) return say(red('usage: set <guildId> <section> <json>'));
        const r = await api(`/settings/${gid}/${section}`, { method: 'PATCH', body: JSON.parse(json.join(' ')) });
        say(green(`saved ${section}`) + ' ' + grey(JSON.stringify(r.settings).slice(0, 400)));
    },
    async presence(status, type, ...name) {
        if (!status) return say(red('usage: presence <online|idle|dnd|invisible> [playing|watching|listening|competing|custom] [name…]'));
        await api('/presence', { method: 'POST', body: { status, type: type || 'watching', name: name.join(' ') || undefined } });
        say(green('presence updated'));
    },
    async saycmd(channelId, ...text) {
        if (!channelId || !text.length) return say(red('usage: say <channelId> <text…>'));
        await api('/say', { method: 'POST', body: { channelId, content: text.join(' ') } });
        say(green('sent'));
    },
    async eval(...code) {
        if (!code.length) return say(red('usage: eval <code…>'));
        const r = await api('/eval', { method: 'POST', body: { code: code.join(' ') } });
        say(r.ok ? green(r.result ?? '(no return)') : red(r.error));
    },
    async clear() { console.clear(); },
    async exit() { await quit(); },
    async quit() { await quit(); },
};
cmds['say'] = cmds.saycmd; // friendly alias without shadowing the local helper

async function quit() {
    rl.close();
    if (childAlive) await stopBot();
    process.exit(0);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'kotan> ',
    // Raw mode only exists on real terminals — under `npm run` on Windows
    // stdin arrives as a pipe, so stay in line-mode there.
    terminal: process.stdin.isTTY === true,
});
// Piped stdin: readline won't echo keystrokes — mirror them so typing is visible.
if (!process.stdin.isTTY) process.stdin.on('data', (d) => process.stdout.write(d));
rl.on('line', async (line) => {
    const [cmd, ...args] = line.trim().split(/\s+/).filter(Boolean);
    if (!cmd) return rl.prompt();
    const fn = cmds[cmd.toLowerCase()];
    if (!fn) { say(red(`unknown command "${cmd}" — try help`)); return rl.prompt(); }
    try { await fn(...args); } catch (e) { say(red(e.message)); }
    rl.prompt();
});
rl.on('SIGINT', () => { say(''); quit(); });
process.on('exit', () => { if (childAlive) { try { child.kill('SIGKILL'); } catch {} } });

say(grey('kotan dev console — the bot runs as a child of this session'));
say(grey('type `help` for commands'));
startBot();
rl.prompt();
