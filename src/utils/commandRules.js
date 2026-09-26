// Scoped command rules — block a command in a specific channel, during a
// daily time window, or both. Stored on guild settings.commandRules:
//   { command: 'ping', channelId: '…'|null, start: '22:00'|null, end: '06:00'|null, tz: 'UTC' }
// A rule blocks when the command matches AND (no channelId OR the message is
// in that channel — threads count via parentId) AND (no window OR the current
// time in `tz` falls inside it).

// 'HH:MM' -> minutes since midnight, or null when malformed.
const parseHM = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    const h = +m[1];
    const min = +m[2];
    return h < 24 && min < 60 ? h * 60 + min : null;
};

// Current minutes-since-midnight in a timezone (IANA name; bad value -> UTC).
function tzMinutes(tz, date = new Date()) {
    try {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone: tz || 'UTC',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).formatToParts(date);
        const h = +parts.find((p) => p.type === 'hour').value;
        const m = +parts.find((p) => p.type === 'minute').value;
        return (h % 24) * 60 + m;
    } catch {
        return tzMinutes('UTC', date);
    }
}

const validTz = (tz) => {
    try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
    } catch {
        return false;
    }
};

// Is `min` inside the [start, end) daily window? Equal bounds = all day;
// start > end = window wraps midnight (e.g. 22:00–06:00).
const inWindow = (min, start, end) =>
    start === end ? true : start < end ? min >= start && min < end : min >= start || min < end;

// Does this rule block `commandName` used in `channel` right now?
function ruleBlocks(rule, commandName, channel) {
    if (rule.command !== commandName) return false;
    if (rule.channelId && channel.id !== rule.channelId && channel.parentId !== rule.channelId)
        return false;
    if (rule.start && rule.end) {
        const s = parseHM(rule.start);
        const e = parseHM(rule.end);
        if (s == null || e == null || !inWindow(tzMinutes(rule.tz), s, e)) return false;
    }
    return true;
}

const isBlocked = (rules, commandName, channel) =>
    Array.isArray(rules) && rules.some((r) => ruleBlocks(r, commandName, channel));

// Human-readable scope for lists — '#general · 22:00–06:00 UTC'.
function describeRule(rule, channelName) {
    const scope = rule.channelId ? `#${channelName || 'deleted-channel'}` : 'all channels';
    const when = rule.start && rule.end ? ` · ${rule.start}–${rule.end} ${rule.tz || 'UTC'}` : '';
    return `${scope}${when}`;
}

module.exports = { parseHM, tzMinutes, validTz, inWindow, ruleBlocks, isBlocked, describeRule };
