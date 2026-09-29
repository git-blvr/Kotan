const db = require('../utils/database');
const { TYPES: LOG_TYPES } = require('../utils/eventlog');

// Mirrors DEFAULT_SETTINGS in src/utils/database.js — merged key-by-key so
// docs written before a sub-key existed keep their defaults.

const DEFAULTS = {
    prefix: null,
    modules: {},
    disabledCommands: [],
    modlogChannel: null,
    automod: {
        antiInvite: false, blacklist: [], spamMax: 0, spamWindow: 5,
        raidMax: 0, raidWindow: 10, raidAction: 'alert',
        exemptRoles: [], exemptChannels: [],
    },
    logging: { channel: null, channels: {}, events: {}, messageDelete: false, messageEdit: false, joinLeave: false, channelEvents: false },
    welcome: {
        channel: null,
        message: 'Welcome {user} to {server}! You are member #{members}.',
        embed: { enabled: false, style: 'embed', title: '', description: '', color: '', footer: '', thumbnail: true, components: [] },
        goodbyeChannel: null,
        goodbyeMessage: '**{username}** left {server}.',
        goodbyeEmbed: { enabled: false, style: 'embed', title: '', description: '', color: '', footer: '', thumbnail: true, components: [] },
    },
    roles: { autorole: null, reactionRoles: [] },
    economy: { currency: null, dailyBase: null, dailyStreak: null, dailyMaxStreak: null, startBalance: null, shop: [] },
    games: { guessReward: 150, scrambleReward: 200, winMultiplier: 1, maxBet: 0, per: {} },
    boosts: { channel: null, message: '{user} just boosted {server}! 🚀', roleId: null, perks: { games: 1, coins: 1, xp: 1, shop: 0 } },
    appearance: { accent: '', background: '', theme: '' },
    branding: { nickname: '' },
    leveling: {
        enabled: false, xpMin: 15, xpMax: 25, cooldown: 60, multiplier: 1,
        announce: true, channel: null, message: 'GG {user} — you reached **level {level}**!', rewards: [],
    },
    access: { modRoles: [], adminRoles: [], sections: {} },
    moduleRoles: {},
    moduleChannels: {},
    commandRules: [],
    overview: { cards: ['members', 'commands', 'warns', 'tempbans'] },
    shop: {
        enabled: true, title: 'Shop',
        description: 'Spend your coins on boosts and goodies.', color: '',
        categories: {
            dynamic: { name: 'Items', items: [] },
            multipliers: { name: 'Boosters', items: [] },
            roles: { name: 'Roles & Crates', items: [] },
        },
    },
    tickets: {
        enabled: false, categoryId: null, logChannel: null, supportRoles: [],
        maxOpen: 1, naming: 'ticket-{user}', topics: [],
        panel: { enabled: true, style: 'cv2', title: 'Support', description: 'Pick a topic below to open a ticket.', color: '', footer: '', thumbnail: false, thumb: '', components: [] },
    },
};

const NESTED = ['automod', 'logging', 'welcome', 'roles', 'economy', 'leveling', 'access', 'overview', 'games', 'boosts', 'appearance', 'branding', 'shop', 'tickets'];

async function getSettings(guildId) {
    const s = await db.getGuildSettings(guildId);
    const merged = { ...DEFAULTS, ...s };
    for (const k of NESTED) merged[k] = { ...DEFAULTS[k], ...(s[k] || {}) };
    // Second level — the embed payloads inside `welcome` are objects too.
    merged.welcome.embed = { ...DEFAULTS.welcome.embed, ...(s.welcome?.embed || {}) };
    merged.welcome.goodbyeEmbed = { ...DEFAULTS.welcome.goodbyeEmbed, ...(s.welcome?.goodbyeEmbed || {}) };
    return merged;
}

// --- field helpers ---
const snowflake = (v) => /^\d{17,20}$/.test(String(v || ''));
const optSnowflake = (v) => v === null || v === '' || v === undefined ? null : (snowflake(v) ? String(v) : undefined);
const str = (v, max = 2000) => (v === null || v === undefined ? null : String(v).slice(0, max));
const num = (v, min, max, dflt = null) => {
    if (v === null || v === undefined || v === '') return dflt;
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const bool = (v) => v === true || v === 'true' || v === 'on';
const arr = (v) => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const idArr = (v) => arr(v).map(String).filter(snowflake).slice(0, 50);
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// CV2 card components — ordered building blocks the dashboard lets users
// drag around. Validated per type; anything unrecognized is dropped.
const COMP_TYPES = ['text', 'heading', 'separator', 'image', 'section', 'link'];
function f_components(e) {
    if (!Array.isArray(e.components)) return null;
    const list = e.components.slice(0, 10).map((c) => {
        if (!c || !COMP_TYPES.includes(c.type)) return null;
        switch (c.type) {
            case 'text': case 'heading':
                return { type: c.type, text: str(c.text, 1000) || '' };
            case 'separator':
                return { type: 'separator', size: c.size === 'large' ? 'large' : 'small' };
            case 'image':
                return { type: 'image', url: str(c.url, 500) || '' };
            case 'section':
                return { type: 'section', text: str(c.text, 1000) || '', image: str(c.image, 500) || '' };
            case 'link':
                return { type: 'link', label: str(c.label, 80) || '', url: str(c.url, 500) || '' };
            default: return null;
        }
    }).filter((c) =>
        c &&
        (c.type === 'separator' ||
            (c.type === 'text' || c.type === 'heading' ? c.text :
            c.type === 'section' ? c.text :
            c.type === 'image' ? c.url :
            c.type === 'link' ? c.label && c.url : false)));
    return list;
}

// Section appliers — each validates the submitted fields and mutates the
// settings object. Returns an error string or null.
const SECTIONS = {
    general(s, f) {
        const prefix = str(f.prefix, 10);
        if (prefix !== null && prefix !== undefined && prefix.length > 10) return 'Prefix too long';
        s.prefix = prefix || null;
    },
    overview(s, f) {
        const valid = ['members', 'commands', 'warns', 'tempbans', 'ping'];
        s.overview.cards = arr(f.cards).filter((c) => valid.includes(c));
        if (!s.overview.cards.length) s.overview.cards = valid;
    },
    modules(s, f) {
        const mods = f.modules && typeof f.modules === 'object' ? f.modules : {};
        for (const [k, v] of Object.entries(mods)) if (/^[a-z]+$/.test(k)) s.modules[k] = bool(v);
        if (f.moduleRoles && typeof f.moduleRoles === 'object')
            for (const [k, v] of Object.entries(f.moduleRoles)) if (/^[a-z]+$/.test(k)) s.moduleRoles[k] = idArr(v);
        if (f.moduleChannels && typeof f.moduleChannels === 'object')
            for (const [k, v] of Object.entries(f.moduleChannels)) if (/^[a-z]+$/.test(k)) s.moduleChannels[k] = idArr(v);
    },
    commands(s, f) {
        if (f.disabledCommands !== undefined)
            s.disabledCommands = arr(f.disabledCommands).map(String).filter((n) => /^[a-z0-9-]{1,32}$/i.test(n)).slice(0, 100);
        if (f.commandRules !== undefined) {
            const rules = arr(f.commandRules).filter((r) => r && typeof r === 'object').slice(0, 100);
            s.commandRules = rules.map((r) => ({
                command: String(r.command || '').slice(0, 32),
                channelId: optSnowflake(r.channelId),
                start: TIME.test(r.start) ? r.start : null,
                end: TIME.test(r.end) ? r.end : null,
            })).filter((r) => r.command && (r.channelId || r.start || r.end));
        }
    },
    automod(s, f) {
        s.automod.antiInvite = bool(f.antiInvite);
        s.automod.blacklist = arr(f.blacklist).map((w) => String(w).trim().slice(0, 100)).filter(Boolean).slice(0, 100);
        s.automod.spamMax = num(f.spamMax, 0, 50, 0);
        s.automod.spamWindow = num(f.spamWindow, 2, 60, 5);
        s.automod.raidMax = num(f.raidMax, 0, 100, 0);
        s.automod.raidWindow = num(f.raidWindow, 2, 120, 10);
        s.automod.raidAction = ['alert', 'kick'].includes(f.raidAction) ? f.raidAction : 'alert';
        if (f.exemptRoles !== undefined) s.automod.exemptRoles = idArr(f.exemptRoles);
        if (f.exemptChannels !== undefined) s.automod.exemptChannels = idArr(f.exemptChannels);
    },
    modlog(s, f) {
        const ch = optSnowflake(f.modlogChannel);
        if (ch === undefined) return 'Invalid channel';
        s.modlogChannel = ch;
    },
    logging(s, f) {
        const ch = optSnowflake(f.channel);
        if (ch === undefined) return 'Invalid channel';
        s.logging.channel = ch;
        // Per-event flags — submitted as a complete map; legacy grouped
        // flags are kept roughly in sync for docs read by older builds.
        if (f.events && typeof f.events === 'object') {
            for (const k of Object.keys(LOG_TYPES))
                if (f.events[k] !== undefined) s.logging.events[k] = bool(f.events[k]);
            s.logging.messageDelete = !!s.logging.events.messageDelete;
            s.logging.messageEdit = !!s.logging.events.messageEdit;
            s.logging.joinLeave = !!(s.logging.events.memberJoin || s.logging.events.memberLeave);
            s.logging.channelEvents = !!(
                s.logging.events.channelCreate || s.logging.events.channelDelete || s.logging.events.channelUpdate
            );
        } else {
            s.logging.messageDelete = bool(f.messageDelete);
            s.logging.messageEdit = bool(f.messageEdit);
            s.logging.joinLeave = bool(f.joinLeave);
            s.logging.channelEvents = bool(f.channelEvents);
        }
        // Log-per-channel: per-event overrides, fall back to the main channel.
        if (f.channels && typeof f.channels === 'object') {
            for (const k of Object.keys(LOG_TYPES)) {
                if (f.channels[k] === undefined) continue;
                const v = optSnowflake(f.channels[k]);
                if (v === undefined) return `Invalid channel for ${k}`;
                if (v) s.logging.channels[k] = v;
                else delete s.logging.channels[k];
            }
        }
        // Mod-log lives on this page too (the standalone section was merged in).
        if (f.modlogChannel !== undefined) {
            const mc = optSnowflake(f.modlogChannel);
            if (mc === undefined) return 'Invalid modlog channel';
            s.modlogChannel = mc;
        }
    },
    // Validates one embed payload object; returns an error string or null.
    // allowEmpty: the tickets panel has built-in fallback text, so a card
    // with no components/description is valid there.
    welcomeEmbed(target, e, allowEmpty) {
        if (!e || typeof e !== 'object') return;
        target.enabled = bool(e.enabled);
        target.style = ['embed', 'cv2'].includes(e.style) ? e.style : 'embed';
        target.title = str(e.title, 256) ?? '';
        target.description = str(e.description, 1000) ?? '';
        target.footer = str(e.footer, 256) ?? '';
        target.thumbnail = e.thumbnail === undefined ? true : bool(e.thumbnail);
        target.thumb = str(e.thumb, 500) ?? ''; // custom thumbnail source — {avatar}/{icon}/URL
        const c = String(e.color || '').trim();
        target.color = /^#?[0-9a-fA-F]{6}$/.test(c) ? c.replace('#', '') : '';
        if (f_components(e)) target.components = f_components(e);
        if (allowEmpty) return;
        if (target.enabled && target.style === 'embed' && !target.title && !target.description)
            return 'Embed needs a title or description';
        if (target.enabled && target.style === 'cv2' && !target.components?.length)
            return 'CV2 card needs at least one component';
    },
    welcome(s, f) {
        const ch = optSnowflake(f.channel);
        const gch = optSnowflake(f.goodbyeChannel);
        if (ch === undefined || gch === undefined) return 'Invalid channel';
        s.welcome.channel = ch;
        s.welcome.goodbyeChannel = gch;
        s.welcome.message = str(f.message, 500) ?? DEFAULTS.welcome.message;
        s.welcome.goodbyeMessage = str(f.goodbyeMessage, 500) ?? DEFAULTS.welcome.goodbyeMessage;
        if (f.embed) {
            const err = SECTIONS.welcomeEmbed(s.welcome.embed, f.embed);
            if (err) return err;
        }
        if (f.goodbyeEmbed) {
            const err = SECTIONS.welcomeEmbed(s.welcome.goodbyeEmbed, f.goodbyeEmbed);
            if (err) return err;
        }
    },
    roles(s, f) {
        const ar = optSnowflake(f.autorole);
        if (ar === undefined) return 'Invalid autorole';
        s.roles.autorole = ar;
        if (f.reactionRoles !== undefined) {
            s.roles.reactionRoles = arr(f.reactionRoles).filter((r) => r && typeof r === 'object').slice(0, 25)
                .map((r) => ({
                    channelId: optSnowflake(r.channelId), messageId: optSnowflake(r.messageId),
                    emoji: str(r.emoji, 64), roleId: optSnowflake(r.roleId),
                }))
                .filter((r) => r.channelId && r.messageId && r.emoji && r.roleId);
        }
    },
    economy(s, f) {
        if (f.currency !== undefined) s.economy.currency = str(f.currency, 32) || null;
        if (f.dailyBase !== undefined) s.economy.dailyBase = num(f.dailyBase, 0, 1_000_000, null);
        if (f.dailyStreak !== undefined) s.economy.dailyStreak = num(f.dailyStreak, 0, 1_000_000, null);
        if (f.dailyMaxStreak !== undefined) s.economy.dailyMaxStreak = num(f.dailyMaxStreak, 0, 10_000_000, null);
        if (f.startBalance !== undefined) s.economy.startBalance = num(f.startBalance, 0, 10_000_000, null);
        if (f.shop !== undefined) {
            s.economy.shop = arr(f.shop).filter((i) => i && typeof i === 'object').slice(0, 25)
                .map((i) => ({
                    name: String(i.name || '').trim().slice(0, 60),
                    price: num(i.price, 1, 100_000_000),
                    description: str(i.description, 200) || '',
                }))
                .filter((i) => i.name && i.price)
                .map((i) => ({ ...i, id: i.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }))
                .filter((i) => i.id);
        }
    },
    shop(s, f) {
        if (f.enabled !== undefined) s.shop.enabled = bool(f.enabled);
        if (f.title !== undefined) s.shop.title = str(f.title, 80) || 'Shop';
        if (f.description !== undefined) s.shop.description = str(f.description, 500) ?? '';
        if (f.color !== undefined) s.shop.color = str(f.color, 20) ?? '';
        const cats = f.categories;
        if (!cats || typeof cats !== 'object') return;
        const itemBase = (i) => ({
            name: str(i.name, 40) || '',
            desc: str(i.desc ?? i.description, 140) || '',
            price: num(i.price, 0, 100_000_000, 0) ?? 0,
        });
        const out = {};
        for (const id of ['dynamic', 'multipliers', 'roles']) {
            const c = cats[id] || {};
            const items = arr(c.items).filter((i) => i && typeof i === 'object').slice(0, 7)
                .map((i) => {
                    const it = itemBase(i);
                    if (!it.name) return null;
                    if (id === 'multipliers') {
                        it.kind = i.kind === 'xp' ? 'xp' : 'coins';
                        it.mult = num(i.mult, 1.1, 25, 2);
                        it.mins = num(i.mins, 1, 43200, 60);
                    } else if (id === 'roles') {
                        it.type = i.type === 'crate' ? 'crate' : 'role';
                        if (it.type === 'role') {
                            it.roleId = optSnowflake(i.roleId);
                            if (!it.roleId) return null; // role items need a valid role
                        } else {
                            it.min = num(i.min, 0, 100_000_000, 100) ?? 100;
                            it.max = Math.max(it.min, num(i.max, 0, 100_000_000, 500) ?? 500);
                        }
                    }
                    return it;
                })
                .filter(Boolean);
            out[id] = { name: str(c.name, 40) || null, items };
        }
        s.shop.categories = out;
    },
    games(s, f) {
        if (f.guessReward !== undefined) s.games.guessReward = num(f.guessReward, 0, 10_000_000, 150);
        if (f.scrambleReward !== undefined) s.games.scrambleReward = num(f.scrambleReward, 0, 10_000_000, 200);
        if (f.winMultiplier !== undefined) s.games.winMultiplier = num(f.winMultiplier, 0, 100, 1);
        if (f.maxBet !== undefined) s.games.maxBet = num(f.maxBet, 0, 100_000_000, 0);
        // Per-game overrides — null/empty fields inherit the globals.
        if (f.per && typeof f.per === 'object') {
            const known = ['coinflip', 'slots', 'rps', 'roll', 'hilo', 'guess', 'scramble'];
            for (const k of known) {
                const p = f.per[k];
                if (!p || typeof p !== 'object') continue;
                const entry = {
                    reward: p.reward === '' || p.reward === null || p.reward === undefined ? null : num(p.reward, 0, 10_000_000),
                    maxBet: p.maxBet === '' || p.maxBet === null || p.maxBet === undefined ? null : num(p.maxBet, 0, 100_000_000),
                    winMultiplier: p.winMultiplier === '' || p.winMultiplier === null || p.winMultiplier === undefined ? null : num(p.winMultiplier, 0, 100),
                };
                if (Object.values(entry).every((v) => v === null)) delete s.games.per[k];
                else s.games.per[k] = entry;
            }
        }
    },
    tickets(s, f) {
        if (f.enabled !== undefined) s.tickets.enabled = bool(f.enabled);
        if (f.categoryId !== undefined) {
            const v = optSnowflake(f.categoryId);
            if (v === undefined) return 'Invalid category';
            s.tickets.categoryId = v;
        }
        if (f.logChannel !== undefined) {
            const v = optSnowflake(f.logChannel);
            if (v === undefined) return 'Invalid channel';
            s.tickets.logChannel = v;
        }
        if (f.supportRoles !== undefined) s.tickets.supportRoles = idArr(f.supportRoles).slice(0, 10);
        if (f.maxOpen !== undefined) s.tickets.maxOpen = num(f.maxOpen, 1, 10, 1) ?? 1;
        if (f.naming !== undefined) s.tickets.naming = str(f.naming, 60) || 'ticket-{user}';
        if (f.topics !== undefined)
            s.tickets.topics = arr(f.topics)
                .filter((t) => t && typeof t === 'object')
                .slice(0, 10)
                .map((t) => ({ name: str(t.name, 80), desc: str(t.desc, 100) || '' }))
                .filter((t) => t.name);
        if (f.panel) {
            const err = SECTIONS.welcomeEmbed(s.tickets.panel, f.panel, true);
            if (err) return err;
        }
    },
    boosts(s, f) {
        const ch = optSnowflake(f.channel);
        if (ch === undefined) return 'Invalid channel';
        s.boosts.channel = ch;
        s.boosts.message = str(f.message, 500) ?? DEFAULTS.boosts.message;
        const role = optSnowflake(f.roleId);
        if (role === undefined) return 'Invalid role';
        s.boosts.roleId = role;
        // Booster perks — multipliers clamped 1–10, shop discount 0–90%.
        const p = s.boosts.perks ||= {};
        p.games = Math.min(Math.max(parseFloat(f.perkGames) || 1, 1), 10);
        p.coins = Math.min(Math.max(parseFloat(f.perkCoins) || 1, 1), 10);
        p.xp = Math.min(Math.max(parseFloat(f.perkXp) || 1, 1), 10);
        p.shop = Math.min(Math.max(parseFloat(f.perkShop) || 0, 0), 90);
    },
    appearance(s, f) {
        const c = String(f.accent || '').trim();
        s.appearance.accent = /^#?[0-9a-fA-F]{6}$/.test(c) ? `#${c.replace('#', '')}` : '';
        s.appearance.background = str(f.background, 500) || '';
        s.appearance.theme = f.theme === 'glass' ? 'glass' : '';
    },
    branding(s, f) {
        s.branding.nickname = str(f.nickname, 32) ?? '';
    },
    leveling(s, f) {
        s.leveling.enabled = bool(f.enabled);
        s.leveling.xpMin = num(f.xpMin, 1, 1000, 15);
        s.leveling.xpMax = num(f.xpMax, 1, 1000, 25);
        if (s.leveling.xpMax < s.leveling.xpMin) s.leveling.xpMax = s.leveling.xpMin;
        s.leveling.cooldown = num(f.cooldown, 0, 3600, 60);
        s.leveling.multiplier = num(f.multiplier, 0.1, 10, 1);
        s.leveling.announce = bool(f.announce);
        const ch = optSnowflake(f.channel);
        if (ch === undefined) return 'Invalid channel';
        s.leveling.channel = ch;
        s.leveling.message = str(f.message, 500) ?? DEFAULTS.leveling.message;
        if (f.rewards !== undefined) {
            s.leveling.rewards = arr(f.rewards).filter((r) => r && typeof r === 'object').slice(0, 50)
                .map((r) => ({ level: num(r.level, 1, 1000), roleId: optSnowflake(r.roleId) }))
                .filter((r) => r.level && r.roleId);
        }
    },
    access(s, f) {
        s.access.modRoles = idArr(f.modRoles);
        s.access.adminRoles = idArr(f.adminRoles);
        if (f.sections && typeof f.sections === 'object')
            for (const [k, v] of Object.entries(f.sections))
                if (/^[a-z-]{1,32}$/.test(k) && ['member', 'mod', 'admin', 'manager'].includes(v))
                    s.access.sections[k] = v;
    },
};

// Applies a section's fields, persists, and audits. Returns {ok, settings|error}.
async function applySection(guildId, userId, section, fields) {
    const apply = SECTIONS[section];
    if (!apply) return { status: 404, error: 'Unknown section' };
    const settings = await getSettings(guildId);
    const err = apply(settings, fields || {});
    if (err) return { status: 400, error: err };
    await db.saveGuildSettings(guildId, settings);
    await db.logAudit(guildId, userId, section);
    return { status: 200, settings };
}

module.exports = { DEFAULTS, SECTIONS, getSettings, applySection };
