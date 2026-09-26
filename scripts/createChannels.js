require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

// Channel scaffolder — builds categories + channels from channelsc.json.
//
//   npm run createchannels -- <guildId> [--clearchannels] [--dryrun] [--file <path>] [--yes]
//
// Config format — each channel is { "t": type, "l": locked, "h": hidden }:
//   t = t|v|a|f|s (text/voice/announcement/forum/stage)
//   l = @everyone can't talk (SendMessages; Connect for voice/stage)
//   h = @everyone can't see it at all (ViewChannel denied)
// A category may carry a "~" entry with l/h options applied to the category
// itself (children with their own h/l get their own overwrites).
// The long keys "type"/"locked"/"hidden" are also accepted.

// guildId may also be passed as --guild <id> or a bare --<digits> flag.
// --clearchannels deletes every existing channel in the guild first (waits
// 5s unless --yes). --dryrun prints the plan without touching Discord.

// Discord quirks: announcement channels can't be created directly (type 5 is
// not accepted by the create endpoint) — create text then setType() to
// announcement. Stage + announcement both require the Community feature.
const TYPE_MAP = {
    t: ChannelType.GuildText,
    v: ChannelType.GuildVoice,
    a: ChannelType.GuildText, // converted to GuildAnnouncement after creation
    f: ChannelType.GuildForum,
    s: ChannelType.GuildStageVoice,
};
const NEEDS_COMMUNITY = new Set(['a', 's']);
const TYPE_LABEL = { t: 'text', v: 'voice', a: 'announcement', f: 'forum', s: 'stage' };

// "locked" = @everyone can't use it: text-like channels lose message perms;
// voice/stage lose Connect (and chat). Forum posting is SendMessages-gated.
const LOCK_DENY = {
    t: ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads'],
    a: ['SendMessages', 'SendMessagesInThreads'],
    f: ['SendMessages', 'SendMessagesInThreads'],
    v: ['Connect', 'SendMessages'],
    s: ['Connect', 'SendMessages'],
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- args ---
function parseArgs(argv) {
    const out = { guildId: null, clear: false, dryrun: false, yes: false, file: 'channelsc.json' };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--clearchannels') out.clear = true;
        else if (a === '--dryrun') out.dryrun = true;
        else if (a === '--yes' || a === '-y') out.yes = true;
        else if (a === '--file') out.file = argv[++i];
        else if (a === '--guild') out.guildId = argv[++i];
        else if (a.startsWith('--guild=')) out.guildId = a.slice(8);
        else if (/^--?\d{15,20}$/.test(a)) out.guildId = a.replace(/^-+/, '');
        else if (/^\d{15,20}$/.test(a)) out.guildId = a;
    }
    return out;
}

// The config file allows // comments — strip them outside string literals.
function parseJsonc(text) {
    let out = '', inStr = false, esc = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i], n = text[i + 1];
        if (inStr) {
            out += c;
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
        } else if (c === '"') { inStr = true; out += c; }
        else if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; }
        else out += c;
    }
    return JSON.parse(out);
}

// Discord accepts Unicode names (small caps, etc.) — only trim/length-cap;
// the API handles any further normalization itself (spaces → hyphens).
const cleanName = (n) => String(n).trim().slice(0, 100) || 'channel';

// Normalizes {t,l,h} shorthand or {type,locked,hidden} longhand into one shape.
const normOpt = (o) => ({ type: o.t ?? o.type, locked: !!(o.l ?? o.locked), hidden: !!(o.h ?? o.hidden) });

// Builds the @everyone overwrite for a channel, or null if unrestricted.
function overwritesFor(o, everyone) {
    const deny = [];
    if (o.hidden) deny.push('ViewChannel');
    if (o.locked) deny.push(...(LOCK_DENY[o.type] || ['SendMessages']));
    return deny.length ? [{ id: everyone, deny: deny.map((p) => PermissionFlagsBits[p]) }] : undefined;
}

function validate(plan) {
    const errors = [];
    for (const [cat, channels] of Object.entries(plan)) {
        if (!channels || typeof channels !== 'object' || Array.isArray(channels))
            errors.push(`"${cat}" must map to an object of channels`);
        else for (const [ch, o] of Object.entries(channels)) {
            if (ch === '~') continue; // category options, not a channel
            if (!o || typeof o !== 'object') errors.push(`${cat}/${ch}: must be an object`);
            else {
                const n = normOpt(o);
                if (!(n.type in TYPE_MAP)) errors.push(`${cat}/${ch}: unknown type "${n.type}" (t|v|a|f|s)`);
            }
        }
    }
    return errors;
}

function printPlan(plan, clear) {
    if (clear) console.log('  !! --clearchannels: ALL existing channels will be deleted first\n');
    for (const [cat, channels] of Object.entries(plan)) {
        const catO = normOpt(channels['~'] || {});
        const marks = [catO.hidden && '🚫', catO.locked && '🔒'].filter(Boolean).join('');
        console.log(`  📁 ${cat} ${marks}`);
        for (const [ch, raw] of Object.entries(channels)) {
            if (ch === '~') continue;
            const o = normOpt(raw);
            const flags = [o.locked && '🔒', o.hidden && '🚫'].filter(Boolean).join(' ');
            console.log(`     ${flags || '  '} ${cleanName(ch)}  (${TYPE_LABEL[o.type]})`);
        }
    }
}

// Interactive mode — `npm run createchannels` with no args prompts instead of
// erroring, so npm's "--" forwarding quirk is never in the way.
async function promptArgs(args) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));
    try {
        if (!args.guildId) {
            const id = await ask('Guild ID: ');
            if (!/^\d{15,20}$/.test(id)) { console.error('That is not a valid guild ID.'); process.exit(1); }
            args.guildId = id;
        }
        const file = await ask(`Config file [${args.file}]: `);
        if (file) args.file = file;
        if (!args.clear && !args.yes) {
            const c = await ask('Delete ALL existing channels first? (y/N): ');
            args.clear = /^y(es)?$/i.test(c);
            if (args.clear) args.yes = true; // explicit confirmation already given
        }
    } finally {
        rl.close();
    }
    return args;
}

async function main() {
    let args = parseArgs(process.argv.slice(2));
    if (!args.guildId) args = await promptArgs(args);
    if (!args.guildId) {
        console.log('Usage: npm run createchannels -- <guildId> [--clearchannels] [--dryrun] [--file <path>] [--yes]');
        process.exit(1);
    }

    const file = path.resolve(args.file);
    if (!fs.existsSync(file)) { console.error(`Config not found: ${file}`); process.exit(1); }
    const plan = parseJsonc(fs.readFileSync(file, 'utf8'));
    const errors = validate(plan);
    if (errors.length) { console.error('Invalid config:\n  ' + errors.join('\n  ')); process.exit(1); }

    console.log(`\nPlan for guild ${args.guildId} (${path.basename(file)}):\n`);
    printPlan(plan, args.clear);
    if (args.dryrun) { console.log('\n(dryrun — nothing was changed)'); return; }

    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(process.env.BOT_MAIN_TOKEN);
    const guild = await client.guilds.fetch(args.guildId).catch(() => null);
    if (!guild) { console.error(`\nBot is not in guild ${args.guildId}`); process.exit(1); }
    console.log(`\nExecuting on "${guild.name || guild.id}"…`);

    const existing = await guild.channels.fetch();
    if (args.clear) {
        if (!args.yes) {
            process.stdout.write('  --clearchannels in ');
            for (let i = 5; i > 0; i--) { process.stdout.write(`${i}… `); await sleep(1000); }
            console.log('');
        }
        for (const [, ch] of existing) {
            try { await ch.delete(); console.log(`  deleted ${ch.name}`); }
            catch (e) { console.error(`  could not delete ${ch.name}: ${e.message}`); }
            await sleep(350);
        }
        existing.clear();
    }

    const everyone = guild.roles.everyone.id;
    const lc = (s) => s.toLowerCase();
    for (const [catName, channels] of Object.entries(plan)) {
        // Reuse a same-named category; only create when absent.
        let category = existing.find((c) => c.type === ChannelType.GuildCategory && lc(c.name) === lc(cleanName(catName)));
        const catOpts = normOpt(channels['~'] || {});
        if (category) {
            console.log(`  📁 ${catName} → exists, keeping`);
        } else {
            try {
                const catCreate = { name: cleanName(catName), type: ChannelType.GuildCategory };
                const catOws = overwritesFor(catOpts, everyone);
                if (catOws) catCreate.permissionOverwrites = catOws;
                category = await guild.channels.create(catCreate);
                existing.set(category.id, category);
                console.log(`  📁 ${catName} → created`);
            } catch (e) { console.error(`  📁 ${catName} → FAILED: ${e.message}`); continue; }
            await sleep(350);
        }

        for (const [chName, raw] of Object.entries(channels)) {
            if (chName === '~') continue;
            const o = normOpt(raw);
            const want = lc(cleanName(chName));
            if (existing.some((c) => lc(c.name) === want && c.parentId === category.id)) {
                console.log(`     ${chName} → exists, keeping`);
                continue;
            }
            if (NEEDS_COMMUNITY.has(o.type) && !guild.features.includes('COMMUNITY')) {
                console.error(`     ${cleanName(chName)} → SKIPPED: ${TYPE_LABEL[o.type]} channels need Community enabled (Server Settings → Community)`);
                continue;
            }
            try {
                const opts = { name: cleanName(chName), type: TYPE_MAP[o.type], parent: category.id };
                const ows = overwritesFor(o, everyone);
                if (ows) opts.permissionOverwrites = ows;
                const ch = await guild.channels.create(opts);
                existing.set(ch.id, ch);
                if (o.type === 'a') await ch.setType(ChannelType.GuildAnnouncement);
                console.log(`     ${o.locked ? '🔒' : '  '} ${cleanName(chName)} → created`);
            } catch (e) {
                console.error(`     ${cleanName(chName)} → FAILED: ${e.message}`);
            }
            await sleep(350);
        }
    }

    console.log('\nDone.');
    client.destroy();
}

main().then((code) => { if (typeof code === 'number') process.exitCode = code; })
    .catch((e) => { console.error(e); process.exitCode = 1; });
