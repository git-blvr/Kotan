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
```

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
src/utils/               logger, database (Keyv), sqliteStore, tasks (tempbans)
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
