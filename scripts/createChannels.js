require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require('discord.js');

// Channel scaffolder — builds categories + channels from channelsc.json.
//
//   npm run createchannels -- <guildId> [--clearchannels] [--dryrun] [--file <path>] [--yes]
//                                     [--edit] [--keep <names>] [--normal]
//
// Config format — each channel is { "t": type, "l": locked, "h": hidden }:
//   t = t|v|a|f|s (text/voice/announcement/forum/stage)
//   l = @everyone can't talk (SendMessages; Connect for voice/stage)
//   h = @everyone can't see it at all (ViewChannel denied)
// A category may carry a "~" entry with l/h options applied to the category
// itself — children synced to it inherit the deny, and the flags are also
// applied when the category already exists (per-channel overwrites untouched).
// The long keys "type"/"locked"/"hidden" are also accepted.
// A top-level "$" object holds global options: { "font": "normal" } strips
// small-caps unicode from names (same as --normal).
//
// --edit: reconcile in place — existing channels are renamed to the config
// name and get their l/h denies applied; nothing is deleted.
// --keep <a,b>: with --clearchannels, spare those channels from deletion;
// interactive mode asks the same as a numbered pick list.
// --normal: names are created/renamed in plain ascii instead of small caps.

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

// Reverse of smallify.js's map — strips unicode small caps back to ascii.
const UNSMALL = {};
for (const [a, s] of Object.entries({
    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ',
    j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ', n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ',
    s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', y: 'ʏ', z: 'ᴢ',
})) UNSMALL[s] = a;
const unsmallify = (s) => [...String(s)].map((c) => UNSMALL[c] || c).join('');
// Matching key — names compare font-insensitive so ᴋᴏᴛᴀɴ-ʟᴏɢꜱ ≡ kotan-logs.
const normName = (s) => unsmallify(String(s)).toLowerCase().trim();

// --- args ---
function parseArgs(argv) {
    const out = { guildId: null, clear: false, dryrun: false, yes: false, file: 'channelsc.json', edit: false, keep: null, normal: false };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--clearchannels') out.clear = true;
        else if (a === '--dryrun') out.dryrun = true;
        else if (a === '--yes' || a === '-y') out.yes = true;
        else if (a === '--edit') out.edit = true;
        else if (a === '--normal') out.normal = true;
        else if (a === '--keep') out.keep = argv[++i];
        else if (a.startsWith('--keep=')) out.keep = a.slice(7);
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

// Per-channel deny fields (for --edit patching of existing channels).
function chanOverwriteFields(o) {
    const deny = {};
    if (o.hidden) deny.ViewChannel = false;
    if (o.locked) for (const p of (LOCK_DENY[o.type] || ['SendMessages'])) deny[p] = false;
    return deny;
}

// Category-level "~" entry: hide/lock the whole category WITHOUT touching
// each channel's own overwrites — synced children inherit the category deny.
// A category has no channel type, so "locked" denies the superset of perms
// that matter (text send/thread + voice connect/speak).
const CAT_LOCK_DENY = ['SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads',
    'CreatePrivateThreads', 'Connect', 'Speak', 'Stream'];
function catOverwriteFields(o) {
    const deny = {};
    if (o.hidden) deny.ViewChannel = false;
    if (o.locked) for (const p of CAT_LOCK_DENY) deny[p] = false;
    return deny;
}

function validate(plan) {
    const errors = [];
    for (const [cat, channels] of Object.entries(plan)) {
        if (cat === '$') continue; // global options, not a category
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
        if (cat === '$') continue;
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
        if (!args.edit) {
            const e = await ask('Edit existing channels to match the config (rename + perms) instead of skipping? (y/N): ');
            args.edit = /^y(es)?$/i.test(e);
        }
        if (!args.normal) {
            const n = await ask('Use normal font instead of small caps? (y/N): ');
            args.normal = /^y(es)?$/i.test(n);
        }
    } finally {
        rl.close();
    }
    return args;
}

// --clearchannels keep-list: --keep <csv> matches by name; on a TTY with no
// flag, prints a numbered list and asks which to spare.
async function pickKeep(existing, args) {
    const keep = new Set();
    const byName = new Map([...existing.values()].map((c) => [normName(c.name), c]));
    const addByName = (name) => {
        const ch = byName.get(normName(name));
        if (ch) keep.add(ch.id);
        else console.error(`  keep: no channel named "${name}"`);
    };
    if (args.keep) {
        String(args.keep).split(',').map((s) => s.trim()).filter(Boolean).forEach(addByName);
        return keep;
    }
    if (!process.stdin.isTTY) return keep;
    const list = [...existing.values()].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    console.log('  Existing channels:');
    list.forEach((c, i) => console.log(`    ${String(i + 1).padStart(2)} ${c.type === ChannelType.GuildCategory ? '📁' : '  '} ${c.name}`));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise((r) => rl.question('  Keep which? (numbers or names, comma-separated; empty = delete all) ', r));
    rl.close();
    for (const tok of ans.split(',').map((s) => s.trim()).filter(Boolean)) {
        const n = parseInt(tok, 10);
        if (Number.isInteger(n) && list[n - 1]) keep.add(list[n - 1].id);
        else addByName(tok);
    }
    return keep;
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
    let plan = parseJsonc(fs.readFileSync(file, 'utf8'));
    if (!args.normal && plan.$?.font === 'normal') args.normal = true;
    if (args.normal) { // strip small-caps from every name in the plan
        const flat = {};
        for (const [cat, chs] of Object.entries(plan)) {
            if (cat === '$') continue;
            const nc = {};
            for (const [ch, o] of Object.entries(chs)) nc[ch === '~' ? '~' : unsmallify(ch)] = o;
            flat[unsmallify(cat)] = nc;
        }
        plan = flat;
    }
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
        const keep = await pickKeep(existing, args);
        if (!args.yes) {
            process.stdout.write('  --clearchannels in ');
            for (let i = 5; i > 0; i--) { process.stdout.write(`${i}… `); await sleep(1000); }
            console.log('');
        }
        for (const [, ch] of existing) {
            if (keep.has(ch.id)) { console.log(`  kept ${ch.name}`); continue; }
            try { await ch.delete(); console.log(`  deleted ${ch.name}`); }
            catch (e) { console.error(`  could not delete ${ch.name}: ${e.message}`); }
            await sleep(350);
        }
        for (const [, ch] of existing) if (keep.has(ch.id)) continue; else existing.delete(ch.id);
    }

    const everyone = guild.roles.everyone.id;
    for (const [catName, channels] of Object.entries(plan)) {
        if (catName === '$') continue;
        // Reuse a same-named category (font-insensitive); only create when absent.
        let category = existing.find((c) => c.type === ChannelType.GuildCategory && normName(c.name) === normName(cleanName(catName)));
        const catOpts = normOpt(channels['~'] || {});
        const catDeny = catOverwriteFields(catOpts);
        if (category) {
            console.log(`  📁 ${catName} → exists${args.edit ? ', editing' : ', keeping'}`);
            if (Object.keys(catDeny).length) {
                try {
                    await category.permissionOverwrites.edit(everyone, catDeny);
                    console.log(`        ~ flags applied to existing category (${Object.keys(catDeny).length} deny)`);
                } catch (e) { console.error(`        ~ flags FAILED: ${e.message}`); }
            }
            if (args.edit && category.name !== cleanName(catName)) {
                try { await category.setName(cleanName(catName)); console.log(`        renamed → ${cleanName(catName)}`); }
                catch (e) { console.error(`        rename FAILED: ${e.message}`); }
            }
        } else {
            try {
                const catCreate = { name: cleanName(catName), type: ChannelType.GuildCategory };
                if (Object.keys(catDeny).length)
                    catCreate.permissionOverwrites = [{ id: everyone, deny: Object.entries(catDeny).filter(([, v]) => v === false).map(([p]) => PermissionFlagsBits[p]) }];
                category = await guild.channels.create(catCreate);
                existing.set(category.id, category);
                console.log(`  📁 ${catName} → created`);
            } catch (e) { console.error(`  📁 ${catName} → FAILED: ${e.message}`); continue; }
            await sleep(350);
        }

        for (const [chName, raw] of Object.entries(channels)) {
            if (chName === '~') continue;
            const o = normOpt(raw);
            const want = normName(cleanName(chName));
            const found = existing.find((c) => normName(c.name) === want && c.parentId === category.id);
            if (found && !args.edit) {
                console.log(`     ${chName} → exists, keeping`);
                continue;
            }
            if (found) {
                // --edit: patch perms + rename in place, never delete
                try {
                    const deny = chanOverwriteFields(o);
                    if (Object.keys(deny).length) await found.permissionOverwrites.edit(everyone, deny);
                    if (o.type === 'a' && found.type !== ChannelType.GuildAnnouncement) await found.setType(ChannelType.GuildAnnouncement);
                    if (found.name !== cleanName(chName)) await found.setName(cleanName(chName));
                    console.log(`     ${o.locked ? '🔒' : '  '} ${cleanName(chName)} → edited`);
                } catch (e) { console.error(`     ${cleanName(chName)} → edit FAILED: ${e.message}`); }
                await sleep(350);
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
