# Kotan

A modular prefix-command Discord bot built on `discord.js` v14 with
`discord-hybrid-sharding` clusters, Keyv storage (Redis or local SQLite), aliases
and **triggers** — plain words that run a command with no prefix at all.

## Running

```bash
npm start      # clustered mode (index.js -> ClusterManager -> src/bot.js)
npm run dev    # single process, no sharding — best for debugging
```

### .env

```ini
BOT_MAIN_TOKEN=your_token        # required
PREFIX=.                         # optional, default "."
OWNER_IDS=123,456                # optional, comma separated — bypasses cooldowns/ownerOnly
REDIS_URL=redis://localhost:6379 # optional — without it, data goes to data/kotan.sqlite
SHARDS_PER_CLUSTER=2             # optional, default 2

# website / dashboard
NODE_ENV=production              # prod binds 0.0.0.0; dev binds 127.0.0.1
PORT=3000                        # optional — default 3000 (443 when real certs)
HOST=0.0.0.0                     # optional — bind a specific public IP if needed
PUBLIC_URL=https://kotan.example.com # optional — used for OAuth redirects
CLIENT_SECRET=from_dev_portal    # required for /dashboard login (OAuth2)
OAUTH_REDIRECT=https://kotan.example.com/auth/callback # must match a Dev Portal redirect
SESSION_SECRET=random_string     # optional, defaults to CLIENT_SECRET

# TLS (production HTTPS without a proxy)
SSL_KEY=/path/to/privkey.pem     # optional — with SSL_CERT the site serves HTTPS directly
SSL_CERT=/path/to/fullchain.pem
SSL_CA=/path/to/chain.pem        # optional intermediate chain
```

TLS behavior: certs set → real HTTPS on `HOST:PORT` (443 by default). No certs
in dev → auto-generated self-signed cert on `https://127.0.0.1:3000` (cached in
`data/dev-cert.json`, accept the browser warning once). No certs in prod →
plain HTTP on `0.0.0.0` — terminate TLS at your reverse proxy in that case.

For the dashboard: in the Dev Portal → OAuth2 → add `OAUTH_REDIRECT` to the
redirects list, then put `CLIENT_SECRET` in `.env`. The client id is the bot's
own user id — no separate config needed.

Enable **Message Content** and **Server Members** intents in the Discord
Developer Portal, or commands and name-based member lookups will not work.

## How a message becomes a command

`src/events/messageCreate.js` resolves commands in two ways:

1. **Prefix** — `.ping`, `.bal @user` (aliases resolve to the real command).
2. **Trigger** — the first word of the message maps straight to a command.
   Typing `net` runs `ping`; `flip heads 100` runs `coinflip` with args.
   Triggers live in `client.triggers`, registered per command. Pick distinctive
   words — anything matching the first word fires the command.

After resolving, the handler checks (in order): `guildOnly` → `ownerOnly` →
`userPermissions` → `botPermissions` → cooldown → `execute()`.

## Project layout

```
index.js                 ClusterManager — spawns clusters that each host shards
src/bot.js               Client setup, collections, handler loading, login
src/config.js            Token, prefix, colors, economy tuning, shop items
src/handlers/            commandHandler (recursive loader) + eventHandler
src/events/              ready, messageCreate, guildCreate/Delete, shardError
src/helpers/             embeds, format (durations/amounts), resolve, checks
src/utils/               logger, database (Keyv), sqliteStore, tasks (tempbans), dominantColor
src/website/             express app — server.js + routes/ + views/ + oauth/guilds/sessionStore
src/commands/            files here = "core" category
src/commands/<dir>/      each subfolder = a category with its name
data/                    kotan.sqlite (auto-created, only when no Redis)
```

## Writing a command

Drop a file into `src/commands/` (core) or any subfolder (category = folder
name). Everything except `name` and `execute` is optional:

```js
const { success } = require('../../helpers/embeds'); // one ".." less from core

module.exports = {
    name: 'ping',                          // required
    description: 'Shows latency',          // shown in .help
    usage: '[@user]',                      // shown in .help / error hints
    aliases: ['pong'],                     // .pong == .ping
    triggers: ['net'],                     // "net" runs this with no prefix
    cooldown: 3,                           // seconds per user (default 3)
    guildOnly: true,                       // default true
    ownerOnly: false,                      // OWNER_IDS only
    userPermissions: ['BanMembers'],       // member must have these
    botPermissions: ['BanMembers'],        // bot must have these
    async execute(message, args, client) {
        await message.reply({ embeds: [success('Pong!')] });
    },
};
```

### Toolbox cheatsheet

| Helper | What it does |
| --- | --- |
| `embeds.base/info/success/error/warning` | Consistent embed builders |
| `embeds.sendError(message, text)` | Reply with an error embed |
| `resolve.resolveMember(message, arg)` | Mention/id/name -> GuildMember |
| `resolve.resolveUser(client, arg)` | Mention/id -> User (any user) |
| `resolve.extractId(arg)` | Pull a snowflake out of a mention |
| `checks.canModerate(message, target)` | Hierarchy checks for moderation |
| `format.parseDuration('1h30m')` | String -> ms (null when invalid) |
| `format.formatDuration(ms)` | ms -> "1 hour, 30 minutes" |
| `format.parseAmount('1k'/'all', max)` | Bet/amount parsing |
| `format.formatCoins/formatNumber/timestamp` | Output formatting |
| `db.getProfile / saveProfile` | Economy data per guild+user |
| `db.addWarn / getWarns / deleteWarn / clearWarns` | Warn storage |
| `db.setTempban / removeTempban / iterateTempbans` | Tempban storage |
| `dominantColor(urlOrBuffer)` | Dominant image color -> int for `setColor`/`accent_color` (null on failure) |

Events work the same way — a file in `src/events/` exporting
`{ name: Events.X, once?, execute: (...args, client) => {} }`.

## Data & sharding notes

- Without `REDIS_URL`, all Keyv namespaces share `data/kotan.sqlite` via
  `SqliteStore` — a `node:sqlite` adapter (built into Node 22+, no native deps).
  With Redis, all namespaces share one connection instead.
- `src/utils/tasks.js` sweeps expired tempbans every 60s. Each cluster only
  unbans guilds in its own cache, so multi-cluster setups never double-unban.
- Cooldowns are intentionally in-memory per process.

## Website

Started from `ready.js` on cluster 0 only (or always when unsharded):

| Route | Access | What it does |
| --- | --- | --- |
| `/` | public | Hero, live bot stats (summed across clusters), invite link |
| `/doc` | public | Command docs generated from the loaded command collection |
| `/privacy`, `/tos` | public | Legal pages |
| `/dashboard` | OAuth2 | Server picker — guilds where you're owner/admin/manage-server |
| `/dashboard/:id` | OAuth2 + manager | Guild dashboard (sidebar layout) |
| `/:id/overview` | " | Stats card: members, warns, tempbans, active modules |
| `/:id/general` | " | Per-guild prefix |
| `/:id/modules` | " | Enable/disable whole categories (tools, economy, …) |
| `/:id/commands` | " | Enable/disable individual commands |
| `/:id/moderation` | " | Mod-log channel picker (channels the bot can write to) |

OAuth flow: `/auth/login` → Discord authorize (`identify guilds` + signed
`state`) → `/auth/callback` → session. Sessions persist in the `sessions`
Keyv namespace via `KeyvSessionStore`. Guild data crosses clusters through
`client.cluster.broadcastEval`, so the picker knows where Kotan lives.

### Guild settings

All dashboard options persist in the `guilds` Keyv namespace and are read by
`messageCreate` on every message (30s TTL cache, safe across clusters):

- `prefix` — replaces the global `PREFIX` for that guild; `message.prefix`
  is shown in commands' usage hints.
- `modules` — disabled categories reject commands with a short notice.
- `disabledCommands` — individual commands rejected the same way.
- `modlogChannel` — moderation commands (`warn`, `delwarn`, `mute`,
  `unmute`, `ban`, `unban`, `tempban`) post an embed there via
  `utils/modlog.js`.

## Production hardening

- **Crash safety** — `unhandledRejection`/`uncaughtException` handlers in both
  `index.js` (manager) and `src/bot.js`. Bot process flushes storage and exits
  on uncaught exceptions; the manager respawns the cluster automatically.
- **RAM** — `cacheWithLimits` caps messages/members/users, zeroes every unused
  manager, plus periodic `sweepers` for stale messages/users.
- **DB resilience** — SQLite runs WAL + `busy_timeout`; store errors are logged
  not thrown; `@keyv/redis` auto-reconnects when REDIS_URL is used.
- **Graceful shutdown** — `SIGINT`/`SIGTERM` on the manager kills clusters;
  in bot.js it destroys the client and WAL-checkpoints the database.
- **Anti-spam** — per-command cooldowns + a global bucket of 5 commands/10s per
  user (warned once, then dropped). Owners bypass both.
- **HTTP resilience** — `utils/http.js` retries fetches with exponential
  backoff and honors `Retry-After` (used by OAuth + dominantColor).
- **Monitoring** — `GET /status` returns uptime/guilds/cluster for external
  monitors; set `SENTRY_DSN` (+`npm i @sentry/node`) for crash reporting.
- **PM2** — `pm2 start ecosystem.config.js` supervises the manager
  (instances:1 — hybrid-sharding does the clustering itself).
