const config = require('../config');

// Shop + inventory plumbing. Items carry their own `type`, so sections are
// purely cosmetic grouping — the dashboard's section editor only changes how
// /shop looks, not what items do:
//   item        -> stored in profile.inventory under the item's id
//   role        -> grants item.roleId on buy
//   multiplier  -> timed boost on profile.mults ({kind: {mult, until}})
//   crate       -> rolls one random token from item.pool (item ids or coins)
//
// Item ids are the shop's public API — dashboard-editable keys like 'cookie'
// or 'vip-pass' that buy commands, crate pools and external tooling
// (dev REST API) reference. Auto-generated from the name when left blank.

const ITEM_TYPES = ['item', 'role', 'multiplier', 'crate'];

const slug = (name) =>
    String(name || '').toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'item';

// Crate pool token: "50" | "50-200" (coins) | "cookie" (an item id).
const COIN_TOKEN = /^\d{1,9}(?:-\d{1,9})?$/;
const poolTokens = (pool) =>
    (Array.isArray(pool) ? pool : String(pool || '').split(','))
        .map((t) => String(t).trim())
        .filter((t) => COIN_TOKEN.test(t) || /^[a-z0-9][a-z0-9_-]{0,31}$/.test(t));

// Rolls one crate reward. Returns { kind:'coins', amount } | { kind:'item', itemId } | null.
function rollPool(pool) {
    const tokens = poolTokens(pool);
    if (!tokens.length) return null;
    const t = tokens[Math.floor(Math.random() * tokens.length)];
    if (!COIN_TOKEN.test(t)) return { kind: 'item', itemId: t };
    const [a, b] = t.split('-').map(Number);
    const lo = a, hi = b === undefined ? a : Math.max(a, b);
    return { kind: 'coins', amount: lo + Math.floor(Math.random() * (hi - lo + 1)) };
}

// Translates the old fixed categories shape into sections so data saved by
// older builds keeps working. New saves always write `sections`.
function normalizeShop(shop) {
    const s = shop && typeof shop === 'object' ? shop : {};
    const out = {
        enabled: s.enabled !== false,
        title: s.title || 'Shop',
        description: s.description || '',
        color: s.color || '',
    };
    // A merged doc can carry an empty default `sections` alongside legacy
    // `categories` — only trust the array when it's populated, or when no
    // categories exist to translate (new saves never write categories).
    const c = s.categories || {};
    const hasLegacy = ['dynamic', 'multipliers', 'roles'].some((k) => c[k]?.items?.length);
    if (Array.isArray(s.sections) && (s.sections.length || !hasLegacy)) {
        out.sections = s.sections
            .filter((c) => c && typeof c === 'object')
            .map((c, i) => ({
                id: slug(c.id || c.name || `section-${i + 1}`),
                name: String(c.name || 'Section').slice(0, 40),
                items: (Array.isArray(c.items) ? c.items : []).slice(0, 7),
            }));
        return out;
    }
    const secs = [];
    if (c.dynamic?.items?.length)
        secs.push({ id: 'items', name: c.dynamic.name || 'Items', items: c.dynamic.items.map((i) => ({ ...i, type: 'item' })) });
    if (c.multipliers?.items?.length)
        secs.push({ id: 'boosters', name: c.multipliers.name || 'Boosters', items: c.multipliers.items.map((i) => ({ ...i, type: 'multiplier' })) });
    if (c.roles?.items?.length)
        secs.push({
            id: 'rewards', name: c.roles.name || 'Roles & Crates',
            items: c.roles.items.map((i) => (i.type === 'crate'
                ? { ...i, type: 'crate', pool: [`${Math.max(0, +i.min || 0)}-${Math.max(0, +i.max || 0)}`] }
                : { ...i, type: 'role' })),
        });
    out.sections = secs;
    return out;
}

// Normalized catalog — sections keep editor order; every item gets `sec`
// (its section id) and a slugged `id`. When no section has items the legacy
// economy.shop list (or built-in config.shop) renders as a fallback
// "Items" section so old setups keep working.
function catalog(settings) {
    const shop = normalizeShop(settings?.shop);
    const cats = shop.sections
        .map((sec) => ({
            id: sec.id,
            name: sec.name,
            items: sec.items.map((it, i) => ({
                ...it,
                sec: sec.id,
                type: ITEM_TYPES.includes(it.type) ? it.type : 'item',
                id: slug(it.id || it.name || `${sec.id}-${i}`),
            })),
        }))
        .filter((c) => c.items.length);

    if (!cats.length) {
        const legacy = settings?.economy?.shop?.length ? settings.economy.shop : config.shop;
        const items = (legacy || []).slice(0, 7).map((it, i) => ({
            ...it,
            desc: it.description || it.desc || '',
            sec: 'items',
            type: 'item',
            id: slug(it.id || it.name || i),
        }));
        if (items.length) cats.push({ id: 'items', name: 'Items', items });
    }
    return cats;
}

const allItems = (cats) => cats.flatMap((c) => c.items);

function findItem(cats, query) {
    const q = String(query || '').toLowerCase();
    return allItems(cats).find(
        (i) =>
            i.id === q ||
            i.id.endsWith(`:${q}`) ||
            i.name.toLowerCase() === q ||
            i.name.toLowerCase().startsWith(q)
    );
}

// Live timed boost on a profile; expired entries read as no boost.
function multOf(profile, kind) {
    const m = profile?.mults?.[kind];
    return m && m.until > Date.now() ? m.mult : 1;
}

// Buying a booster while one runs keeps the stronger multiplier and
// extends the timer.
function activateMult(profile, kind, mult, mins) {
    profile.mults ||= {};
    const cur = profile.mults[kind];
    const live = cur?.until > Date.now();
    profile.mults[kind] = {
        mult: Math.max(+mult || 1, live ? cur.mult : 1),
        until: (live ? cur.until : Date.now()) + Math.round((+mins || 60) * 60000),
    };
    return profile.mults[kind];
}

const withCoinMult = (profile, amount) => Math.round(amount * multOf(profile, 'coins'));

const fmtLeft = (until) => {
    const s = Math.max(0, Math.round((until - Date.now()) / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.ceil((s % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
};

// Booster perk value for a member — `premiumSince` marks a real server
// booster. Multiplier kinds (games/coins/xp) read 1 when not boosting;
// 'shop' is a discount percent (0 when not boosting).
function boostPerk(member, settings, kind) {
    if (!member?.premiumSince) return kind === 'shop' ? 0 : 1;
    const v = settings?.boosts?.perks?.[kind];
    return v == null ? (kind === 'shop' ? 0 : 1) : +v;
}

// Game winnings: game perk × active coin booster.
const winAmount = (member, settings, profile, base) =>
    Math.round(withCoinMult(profile, base) * boostPerk(member, settings, 'games'));

module.exports = { ITEM_TYPES, slug, poolTokens, rollPool, normalizeShop, catalog, allItems, findItem, multOf, activateMult, withCoinMult, fmtLeft, boostPerk, winAmount };
