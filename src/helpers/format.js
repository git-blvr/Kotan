const config = require('../config');
const { ms: ems } = require('enhanced-ms');

// Small formatting/parsing utilities shared by commands.

// Parses strings like "10m", "1h30m", "2d" into milliseconds — enhanced-ms
// also accepts decimals ("1.5h"), weeks/years and verbose input.
// Returns null when nothing valid could be parsed.
function parseDuration(input) {
    if (!input) return null;
    const n = ems(String(input).trim());
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

// 90000 -> "1 minute 30 seconds"
function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0 seconds';
    return ems(Math.round(ms)) ?? '0 seconds';
}

const formatNumber = (n) => Math.floor(n).toLocaleString('en-US');
// Per-guild currency name overrides the global one.
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
