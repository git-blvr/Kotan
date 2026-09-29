const config = require('../config');

// Shop + inventory plumbing. Item effects are driven by the fixed category
// ids — the dashboard may rename categories but effects follow the id:
//   dynamic     -> stored in profile.inventory (no effect yet, "use later")
//   multipliers -> timed boosts on profile.mults ({kind: {mult, until}})
//   roles       -> role grants or crates (random coin payout)
const SHOP_CATS = [
    ['dynamic', 'Items'],
    ['multipliers', 'Boosters'],
    ['roles', 'Roles & Crates'],
];

const slug = (name) =>
    String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';

// Normalized catalog — every item gets a stable "cat:slug" id. When no
// category has items the legacy economy.shop list (or built-in config.shop)
// renders as a fallback "Items" category so old shops keep working.
function catalog(settings) {
    const cats = SHOP_CATS.map(([id, defName]) => {
        const c = settings?.shop?.categories?.[id] || {};
        const items = (c.items || []).slice(0, 7).map((it, i) => ({
            ...it,
            cat: id,
            id: `${id}:${slug(it.name) || i}`,
        }));
        return { id, name: c.name || defName, items };
    }).filter((c) => c.items.length);

    if (!cats.length) {
        const legacy = settings?.economy?.shop?.length ? settings.economy.shop : config.shop;
        const items = (legacy || []).slice(0, 7).map((it, i) => ({
            ...it,
            desc: it.description || it.desc || '',
            cat: 'items',
            id: `items:${slug(it.name) || i}`,
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

module.exports = { SHOP_CATS, catalog, allItems, findItem, multOf, activateMult, withCoinMult, fmtLeft, boostPerk, winAmount };
