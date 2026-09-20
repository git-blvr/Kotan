const config = require('../config');

// Small formatting/parsing utilities shared by commands.

const DURATION_UNITS = {
    w: 604_800_000,
    d: 86_400_000,
    h: 3_600_000,
    m: 60_000,
    s: 1_000,
};

// Parses strings like "10m", "1h30m", "2d" into milliseconds.
// Returns null when nothing valid could be parsed.
function parseDuration(input) {
    if (!input) return null;
    const matches = String(input).toLowerCase().matchAll(/(\d+)\s*([wdhms])/g);
    let total = 0;
    for (const match of matches) {
        total += Number(match[1]) * DURATION_UNITS[match[2]];
    }
    return total > 0 ? total : null;
}

// 90000 -> "1 minute, 30 seconds"
function formatDuration(ms) {
    if (ms <= 0) return '0 seconds';
    const parts = [];
    const units = [
        ['week', 604_800_000],
        ['day', 86_400_000],
        ['hour', 3_600_000],
        ['minute', 60_000],
        ['second', 1_000],
    ];
    let rest = ms;
    for (const [name, unit] of units) {
        const amount = Math.floor(rest / unit);
        if (amount > 0) {
            parts.push(`${amount} ${name}${amount === 1 ? '' : 's'}`);
            rest %= unit;
        }
    }
    return parts.slice(0, 3).join(', ');
}

const formatNumber = (n) => Math.floor(n).toLocaleString('en-US');
// Per-guild currency name (dashboard Economy page) overrides the global one.
// Nullish-coalesce rather than a default param — callers pass the guild
// setting, which is null (not undefined) when unset.
const formatCoins = (n, currency) => `**${formatNumber(n)}** ${currency ?? config.economy.currency}`;

// Discord-relative timestamp, e.g. <t:1695000000:R> renders "2 hours ago".
const timestamp = (ms, style = 'R') => `<t:${Math.floor(ms / 1000)}:${style}>`;

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Parses "250", "1k" style amounts or the literal "all"/"half"/"max" against
// a balance. Returns an integer or null when invalid.
function parseAmount(input, max) {
    if (!input) return null;
    const raw = String(input).toLowerCase();
    if (['all', 'max'].includes(raw)) return max;
    if (raw === 'half') return Math.floor(max / 2) || null;
    const match = raw.match(/^(\d+)(k?)$/);
    if (!match) return null;
    const amount = Number(match[1]) * (match[2] === 'k' ? 1_000 : 1);
    return amount > 0 && Number.isSafeInteger(amount) ? amount : null;
}

module.exports = {
    parseDuration,
    formatDuration,
    formatNumber,
    formatCoins,
    timestamp,
    capitalize,
    parseAmount,
};
