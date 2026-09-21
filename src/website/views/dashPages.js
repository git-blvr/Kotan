const { dashLayout, SECTIONS } = require('./dashLayout');
const { esc, layout } = require('./layout');
const { capitalize } = require('../../helpers/format');
const { sparkline, delta, growth, modActivityChart, topCommandBars } = require('./charts');

// The five per-guild dashboard pages. Each receives { user, guild, settings,
// csrf, saved, ... } and returns a full page through dashLayout.

const switch_ = (name, on) =>
    `<label class="switch"><input type="checkbox" name="${esc(name)}" ${on ? 'checked' : ''}>
    <span class="slider"></span></label>`;

const saveBar = (section, csrf) =>
    `<input type="hidden" name="section" value="${section}">
     <input type="hidden" name="csrf" value="${esc(csrf)}">
     <button class="btn" type="submit" style="margin-top:14px">Save changes</button>`;

const toast = (saved) =>
    saved
        ? '<div class="toast" role="status">Settings saved.<button class="tx" aria-label="Dismiss" onclick="this.parentElement.style.display=\'none\'">×</button><span class="tprog"></span></div>'
        : '';

const qitem = (label, valueHtml) =>
    `<div class="qitem"><span class="qlabel">${esc(label)}</span>${valueHtml}</div>`;

const CATEGORY_INFO = {
    core: 'Essential commands (help). Disabling hides help.',
    tools: 'Utility commands — ping, avatar, banner, serverinfo, color.',
    moderation: 'Warns, timeouts, bans and tempbans.',
    economy: 'Wallet, daily rewards, payments and the shop.',
    games: 'Coinflip, slots, rps, 8ball and friends.',
    leveling: 'XP, ranks, leaderboards and level rewards.',
};

// Stat card semantic accents — top-edge tint + sparkline color.
const STAT_ACCENTS = {
    members: '#4f8fd8',
    commands: '#8b5cf6',
    warns: '#f0a44a',
    tempbans: '#e05555',
};

const relTime = (ts) => {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
};

// ---------- Overview ----------

function renderOverview({ user, guild, theme, allowed, settings, stats, commands, saved }) {
    const categories = [...new Set([...commands.values()].map((c) => c.category))];
    const enabled = categories.filter((c) => settings.modules?.[c] !== false).length;
    const { usage, mod, members, modlogName, modRecent = [], names = {} } = stats;
    const uname = (id) => names[id] || 'unknown';

    // Stat card: big number + 14-day sparkline + week-over-week delta.
    // Zero-value cards are dimmed so real activity pops visually.
    const stat = (key, label, value, { series, badge, dim } = {}) => `
        <div class="card stat ${dim ? 'empty' : ''}" style="--sa:${STAT_ACCENTS[key]}">
            <div class="slabel">${label}</div>
            <div class="sval" style="font-size:26px;font-weight:700;line-height:1.25;margin-top:2px"${typeof value === 'number' ? ` data-count="${value}"` : ''}>${value}</div>
            <div style="margin-top:8px;min-height:36px">${series ? sparkline(series, { color: STAT_ACCENTS[key] }) : ''}</div>
            ${badge || ''}
        </div>`;

    const CARDS = {
        members: () => stat('members', 'Members', guild.memberCount ?? members?.latest ?? '?', {
            series: members?.series || [],
            badge: growth(members?.pct ?? null),
        }),
        commands: () => stat('commands', 'Commands used', usage.total, {
            series: usage.series.map((d) => d.count),
            badge: delta(usage.week, usage.prevWeek),
            dim: !usage.total,
        }),
        warns: () => stat('warns', 'Warns', mod.warnsTotal, {
            series: mod.days.map((d) => d.warns),
            badge: delta(mod.warnsWeek, mod.warnsPrevWeek, { invert: true }),
            dim: !mod.warnsTotal,
        }),
        tempbans: () => stat('tempbans', 'Tempbans', mod.tempbansTotal, {
            series: mod.days.map((d) => d.tempbans),
            badge: delta(mod.tempbansWeek, mod.tempbansPrevWeek, { invert: true }),
            dim: !mod.tempbansTotal,
        }),
    };
    const order = (settings.overview?.cards || []).filter((k) => CARDS[k]);
    const cards = (order.length ? order : ['members', 'commands', 'warns', 'tempbans'])
        .map((k) => CARDS[k]())
        .join('');

    const cmdRows = (usage.recent || []).slice(0, 5)
        .map((r) => `<div class="act"><span><code>${esc(r.cmd)}</code> by ${esc(uname(r.userId))}</span><span class="muted">${relTime(r.at)}</span></div>`)
        .join('');
    const modRows = modRecent.slice(0, 5)
        .map((r) => `<div class="act"><span><strong>${esc(r.type)}</strong> ${esc(uname(r.userId))}${r.reason ? ` — ${esc(r.reason)}` : ''}</span><span class="muted">${relTime(r.at)}</span></div>`)
        .join('');

    const content = `
        ${toast(saved)}
        <h1>Overview</h1>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin:18px 0 26px">
            ${cards}
        </div>
        <div class="grid" style="grid-template-columns:1fr 1fr;margin-bottom:26px">
            <div class="card">
                <h2>Quick status</h2>
                <div class="qgrid" style="grid-template-columns:1fr">
                    <a class="qitem" href="/dashboard/${esc(guild.id)}/general"><span class="qgo">→</span><span class="qlabel">Prefix</span><code>${esc(settings.prefix || 'default')}</code></a>
                    <a class="qitem" href="/dashboard/${esc(guild.id)}/moderation"><span class="qgo">→</span><span class="qlabel">Mod log</span>${settings.modlogChannel ? `<code>#${esc(modlogName || 'set')}</code>` : '<span class="muted">off</span>'}</a>
                    <a class="qitem" href="/dashboard/${esc(guild.id)}/modules"><span class="qgo">→</span><span class="qlabel">Modules</span><code>${enabled}/${categories.length} on</code></a>
                    <a class="qitem" href="/dashboard/${esc(guild.id)}/commands"><span class="qgo">→</span><span class="qlabel">Disabled commands</span><code>${settings.disabledCommands?.length || 0}</code></a>
                </div>
            </div>
            <div class="card">
                <h2>Recent activity</h2>
                ${cmdRows || '<p class="muted" style="font-size:13.5px">No commands run yet.</p>'}
                <h2 style="margin-top:16px">Recent mod actions</h2>
                ${modRows || '<p class="muted" style="font-size:13.5px">No warns or tempbans recorded.</p>'}
            </div>
        </div>`;
    return dashLayout({ user, guild, theme, allowed, active: '', title: 'Overview', content });
}

// ---------- General (prefix) ----------

function renderGeneral({ user, guild, theme, allowed, settings, csrf, saved }) {
    const cardOrder = ['members', 'commands', 'warns', 'tempbans'];
    const picked = (settings.overview?.cards || []).filter((k) => cardOrder.includes(k));
    const order = picked.length ? picked : cardOrder;
    const cardRow = (key) => {
        const label = { members: 'Members', commands: 'Commands used', warns: 'Warns', tempbans: 'Tempbans' }[key];
        const on = order.includes(key);
        return `<div class="check" style="justify-content:space-between">
            <span style="display:flex;align-items:center;gap:10px">
                <input type="checkbox" name="ov_${key}" ${on ? 'checked' : ''}>
                <span>${label}</span>
            </span>
            <input type="number" name="ord_${key}" value="${on ? order.indexOf(key) + 1 : ''}" min="1" max="4" style="width:60px" title="Position">
        </div>`;
    };

    const content = `
        ${toast(saved)}
        <h1>Settings</h1>
        <div class="card" style="margin-top:18px">
            <h2>Command prefix</h2>
            <form method="post" action="/dashboard/${esc(guild.id)}/settings" style="margin-top:12px">
                ${saveBar('general', csrf)}
                <div style="display:flex;align-items:center;gap:12px">
                    <span class="ifield">
                        <input type="text" name="prefix" value="${esc(settings.prefix || '')}" placeholder="default: ." maxlength="5" pattern="\\S{1,5}">
                        <span class="ok-ic">✓</span>
                    </span>
                    <button class="btn" type="submit">Save</button>
                </div>
                <div class="err-msg">Prefix must be 1–5 characters with no spaces.</div>
            </form>
            <p class="muted" style="font-size:13px;margin-top:10px">
                1–5 characters, no spaces. Empty resets to the global default.
                Triggers (plain words) keep working regardless of prefix.
            </p>
        </div>
        <div class="card" style="margin-top:16px">
            <h2>Overview cards</h2>
            <p class="muted" style="font-size:13px;margin:4px 0 10px">
                Pick which stat cards show on the Overview and their order (1–4).
            </p>
            <form method="post" action="/dashboard/${esc(guild.id)}/settings">
                ${saveBar('overview', csrf)}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;max-width:480px">
                    ${cardOrder.map(cardRow).join('')}
                </div>
            </form>
        </div>`;
    return dashLayout({ user, guild, theme, allowed, active: 'general', title: 'Settings', content });
}

// ---------- Modules (category toggles) ----------

function renderModules({ user, guild, theme, allowed, settings, csrf, saved, commands, roles = [] }) {
    const categories = [...new Set([...commands.values()].map((c) => c.category))];
    const roleSelect = (cat) => {
        const sel = settings.moduleRoles?.[cat] || [];
        const opts = roles
            .map((r) => `<option value="${esc(r.id)}" ${sel.includes(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`)
            .join('');
        return `<select name="mroles_${cat}" multiple size="3" style="min-width:170px" title="Ctrl/Cmd-click to pick several">${opts}</select>`;
    };
    const rows = categories
        .map((cat) => {
            const count = [...commands.values()].filter((c) => c.category === cat).length;
            const on = settings.modules?.[cat] !== false;
            const restricted = (settings.moduleRoles?.[cat] || []).length > 0;
            return `<div class="modrow">
                <div style="flex:1">
                    <strong>${esc(capitalize(cat))}</strong>
                    <span class="pill">${count} commands</span>
                    ${restricted ? '<span class="pill">restricted</span>' : ''}
                    <div class="muted" style="font-size:13px;margin-top:4px">${esc(CATEGORY_INFO[cat] || '')}</div>
                    <div style="margin-top:8px;font-size:12px;color:var(--muted)">Allowed roles — empty means everyone</div>
                    <div style="margin-top:4px">${roleSelect(cat)}</div>
                </div>
                ${switch_(`mod_${cat}`, on)}
            </div>`;
        })
        .join('');

    const content = `
        ${toast(saved)}
        <h1>Modules</h1>
        <p class="muted" style="margin:6px 0 18px">
            Toggle whole command categories, or restrict a module to specific Discord roles.
            Members with Manage Server always bypass role restrictions.
        </p>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings" data-confirm-unchecked="This will disable a module — commands in it stop working for everyone. Continue?">
            <div class="grid">${rows}</div>
            ${saveBar('modules', csrf)}
        </form>`;
    return dashLayout({ user, guild, theme, allowed, active: 'modules', title: 'Modules', content });
}

// ---------- Commands (per-command toggles) ----------

function renderCommands({ user, guild, theme, allowed, settings, csrf, saved, commands, usage }) {
    const rows = [...commands.values()]
        .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
        .map(
            (c) => `<tr>
            <td><code>${esc(c.name)}</code>${c.usage ? ` <span class="muted">${esc(c.usage)}</span>` : ''}</td>
            <td><span class="pill">${esc(c.category)}</span></td>
            <td class="muted" style="font-size:13px">${esc(c.description || '—')}</td>
            <td>${switch_(`cmd_${c.name}`, !settings.disabledCommands?.includes(c.name))}</td>
        </tr>`
        )
        .join('');

    const content = `
        ${toast(saved)}
        <h1>Commands</h1>
        <p class="muted" style="margin:6px 0 18px">Toggle Kotan's <strong>built-in</strong> commands for this server. For your own text-reply commands, see <a href="/dashboard/${esc(guild.id)}/tags">Custom Commands</a>.</p>
        <div class="card" style="margin-bottom:18px">
            <h2>Top commands</h2>
            ${usage ? topCommandBars(usage.top) : '<p class="muted" style="font-size:14px">No data.</p>'}
            ${usage?.total ? `<p class="muted" style="font-size:12px;margin-top:8px">${usage.total} runs recorded · ${usage.week} this week</p>` : ''}
        </div>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings" data-confirm-unchecked="This will disable built-in commands for everyone in this server. Continue?">
            <div class="card" style="padding:0;overflow:hidden"><table>
                <tr><th>Command</th><th>Module</th><th>Description</th><th>Enabled</th></tr>
                ${rows}
            </table></div>
            ${saveBar('commands', csrf)}
        </form>`;
    return dashLayout({ user, guild, theme, allowed, active: 'commands', title: 'Commands', content });
}

// ---------- Moderation (modlog channel) ----------

function renderModeration({ user, guild, theme, allowed, settings, csrf, saved, channels, mod }) {
    const options = [
        `<option value="">— Disabled —</option>`,
        ...channels.map(
            (ch) =>
                `<option value="${esc(ch.id)}" ${settings.modlogChannel === ch.id ? 'selected' : ''}>#${esc(ch.name)}</option>`
        ),
    ].join('');

    const content = `
        ${toast(saved)}
        <h1>Mod Log</h1>
        <div class="card" style="margin-top:18px">
            <h2>Activity — last 14 days</h2>
            <div style="margin-top:10px">${mod ? modActivityChart(mod.days) : '<p class="muted" style="font-size:14px">No data.</p>'}</div>
        </div>
        <div class="card" style="margin-top:18px">
            <h2>Moderation log channel</h2>
            <p class="muted" style="font-size:14px;margin:6px 0 14px">
                Warns, mutes, bans, tempbans and warn removals are posted here.
            </p>
            <form method="post" action="/dashboard/${esc(guild.id)}/settings" style="display:flex;align-items:center;gap:12px">
                ${saveBar('moderation', csrf)}
                <select name="modlogChannel">${options}</select>
                <button class="btn" type="submit">Save</button>
            </form>
        </div>`;
    return dashLayout({ user, guild, theme, allowed, active: 'moderation', title: 'Mod Log', content });
}

// ---------- Automod ----------

function renderAutomod({ user, guild, theme, allowed, settings, csrf, saved }) {
    const am = settings.automod;
    const content = `
        ${toast(saved)}
        <h1>Automod</h1>
        <p class="muted" style="margin:6px 0 18px">
            Filters run on every message. Members who can manage messages or the server are exempt.
        </p>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings">
            <div class="grid">
                <div class="modrow">
                    <div><strong>Anti-invite</strong>
                        <div class="muted" style="font-size:13px">Delete messages containing Discord invite links.</div></div>
                    ${switch_('antiInvite', am.antiInvite)}
                </div>
                <div class="modrow">
                    <div><strong>Spam filter</strong>
                        <div class="muted" style="font-size:13px">Delete messages when a user floods. 0 disables.</div></div>
                    <div class="muted" style="font-size:13px">max
                        <input type="number" name="spamMax" value="${am.spamMax}" min="0" max="50"> msgs /
                        <input type="number" name="spamWindow" value="${am.spamWindow}" min="2" max="60">s
                    </div>
                </div>
                <div class="modrow">
                    <div><strong>Raid filter</strong>
                        <div class="muted" style="font-size:13px">Detect join bursts. 0 disables.</div></div>
                    <div class="muted" style="font-size:13px">trigger at
                        <input type="number" name="raidMax" value="${am.raidMax}" min="0" max="50"> joins /
                        <input type="number" name="raidWindow" value="${am.raidWindow}" min="2" max="120">s ·
                        <select name="raidAction" style="min-width:0">
                            <option value="alert" ${am.raidAction !== 'kick' ? 'selected' : ''}>alert mod log</option>
                            <option value="kick" ${am.raidAction === 'kick' ? 'selected' : ''}>kick joiner</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="card" style="margin-top:16px">
                <h2>Word blacklist</h2>
                <p class="muted" style="font-size:13px;margin:4px 0 10px">One word or phrase per line — any match deletes the message.</p>
                <textarea name="blacklist" placeholder="badword\nanother phrase">${esc((am.blacklist || []).join('\n'))}</textarea>
            </div>
            ${saveBar('automod', csrf)}
        </form>`;
    return dashLayout({ user, guild, theme, allowed, active: 'automod', title: 'Automod', content });
}

// ---------- Logging ----------

function renderLogging({ user, guild, theme, allowed, settings, csrf, saved, channels }) {
    const log = settings.logging;
    const options = [
        `<option value="">— Disabled —</option>`,
        ...channels.map(
            (ch) =>
                `<option value="${esc(ch.id)}" ${log.channel === ch.id ? 'selected' : ''}>#${esc(ch.name)}</option>`
        ),
    ].join('');
    const flag = (name, label, desc) =>
        `<label class="check"><input type="checkbox" name="${name}" ${log[name] ? 'checked' : ''}>
        <span><strong>${label}</strong><br><span class="muted" style="font-size:13px">${desc}</span></span></label>`;

    const content = `
        ${toast(saved)}
        <h1>Logging</h1>
        <p class="muted" style="margin:6px 0 18px">Server event log — separate from the Mod Log (punishments).</p>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings">
            <div class="card">
                <h2>Log channel</h2>
                <select name="logChannel" style="margin-top:10px">${options}</select>
                <div style="margin-top:14px">
                    ${flag('messageDelete', 'Message deletions', 'Log deleted message content and author.')}
                    ${flag('messageEdit', 'Message edits', 'Log before/after when a message is edited.')}
                    ${flag('joinLeave', 'Member join & leave', 'Log member arrivals and departures.')}
                    ${flag('channelEvents', 'Channel create & delete', 'Log when channels are added or removed.')}
                </div>
            </div>
            ${saveBar('logging', csrf)}
        </form>`;
    return dashLayout({ user, guild, theme, allowed, active: 'logging', title: 'Logging', content });
}

// ---------- Welcome / Goodbye ----------

function renderWelcome({ user, guild, theme, allowed, settings, csrf, saved, channels }) {
    const w = settings.welcome;
    const sel = (name, current) =>
        `<select name="${name}"><option value="">— Disabled —</option>${channels
            .map((ch) => `<option value="${esc(ch.id)}" ${current === ch.id ? 'selected' : ''}>#${esc(ch.name)}</option>`)
            .join('')}</select>`;

    const content = `
        ${toast(saved)}
        <h1>Welcome &amp; Goodbye</h1>
        <p class="muted" style="margin:6px 0 18px">
            Placeholders: <code>{user}</code> mention, <code>{username}</code>, <code>{server}</code>, <code>{members}</code> count.
        </p>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings">
            <div class="card">
                <h2>Welcome message</h2>
                <div style="display:flex;align-items:center;gap:12px;margin-top:12px">${sel('welcomeChannel', w.channel)}
                    <input type="text" name="welcomeMessage" value="${esc(w.message)}" maxlength="500" style="flex:1;width:auto"></div>
                <span class="pvlabel" style="margin-top:12px">Preview</span>
                <div class="pv" data-src="welcomeMessage" data-user="${esc(user.username)}" data-guild="${esc(guild.name)}" data-empty="No message set — falls back to the default."></div>
            </div>
            <div class="card" style="margin-top:16px">
                <h2>Goodbye message</h2>
                <div style="display:flex;align-items:center;gap:12px;margin-top:12px">${sel('goodbyeChannel', w.goodbyeChannel)}
                    <input type="text" name="goodbyeMessage" value="${esc(w.goodbyeMessage)}" maxlength="500" style="flex:1;width:auto"></div>
                <span class="pvlabel" style="margin-top:12px">Preview</span>
                <div class="pv" data-src="goodbyeMessage" data-user="${esc(user.username)}" data-guild="${esc(guild.name)}" data-empty="No message set — falls back to the default."></div>
            </div>
            ${saveBar('welcome', csrf)}
        </form>`;
    return dashLayout({ user, guild, theme, allowed, active: 'welcome', title: 'Welcome', content });
}

// ---------- Roles ----------

function renderRoles({ user, guild, theme, allowed, settings, csrf, saved, roles, channels, emojis = [] }) {
    const r = settings.roles;
    const roleName = (id) => roles.find((x) => x.id === id)?.name || 'deleted role';
    const chanName = (id) => channels.find((x) => x.id === id)?.name || 'deleted channel';
    const roleOpts = (cur) =>
        `<option value="">— None —</option>` +
        roles.map((x) => `<option value="${esc(x.id)}" ${cur === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const chanOpts = () =>
        channels.map((x) => `<option value="${esc(x.id)}">#${esc(x.name)}</option>`).join('');

    const rrRows = (r.reactionRoles || [])
        .map(
            (rr, i) => `<tr>
                <td>#${esc(chanName(rr.channelId))}</td>
                <td><code>${esc(rr.messageId)}</code></td>
                <td>${esc(rr.emoji)}</td>
                <td>${esc(roleName(rr.roleId))}</td>
                <td><form method="post" action="/dashboard/${esc(guild.id)}/settings" data-confirm="Remove this reaction-role mapping?">
                    <input type="hidden" name="section" value="rr-del">
                    <input type="hidden" name="csrf" value="${esc(csrf)}">
                    <input type="hidden" name="idx" value="${i}">
                    <button class="btn-danger btn-sm" type="submit">Remove</button>
                </form></td>
            </tr>`
        )
        .join('');

    const content = `
        ${toast(saved)}
        <h1>Roles</h1>
        <div class="card" style="margin-top:18px">
            <h2>Autorole</h2>
            <p class="muted" style="font-size:13px;margin:4px 0 12px">Granted to every new member on join.</p>
            <form method="post" action="/dashboard/${esc(guild.id)}/settings" style="display:flex;gap:12px;align-items:center">
                <input type="hidden" name="section" value="roles">
                <input type="hidden" name="csrf" value="${esc(csrf)}">
                <select name="autorole">${roleOpts(r.autorole)}</select>
                <button class="btn" type="submit">Save</button>
            </form>
        </div>
        <div class="card" style="margin-top:16px">
            <h2>Reaction roles</h2>
            <p class="muted" style="font-size:13px;margin:4px 0 12px">
                Members who add the emoji to the message get the role; removing the reaction removes it.
            </p>
            ${rrRows ? `<table><tr><th>Channel</th><th>Message ID</th><th>Emoji</th><th>Role</th><th></th></tr>${rrRows}</table>`
                     : '<p class="muted" style="font-size:14px">No reaction roles configured.</p>'}
            <h2 style="margin-top:18px">Add mapping</h2>
            <form method="post" action="/dashboard/${esc(guild.id)}/settings" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
                <input type="hidden" name="section" value="rr-add">
                <input type="hidden" name="csrf" value="${esc(csrf)}">
                <select name="rrChannel" data-msgsrc style="min-width:160px">${chanOpts()}</select>
                <select name="rrMessage" data-msgs disabled style="min-width:220px"><option value="">— pick a channel —</option></select>
                <input type="text" name="rrEmoji" placeholder="Emoji" list="emojilist" style="width:110px">
                <datalist id="emojilist">
                    ${emojis.map((e) => `<option value="${esc(e.fmt)}" label=":${esc(e.name)}:"></option>`).join('')}
                </datalist>
                <select name="rrRole" style="min-width:160px">${roleOpts(null)}</select>
                <button class="btn" type="submit">Add</button>
            </form>
            <p class="hint">The message list loads the channel's 50 most recent messages. Emoji accepts unicode or a server emoji from the suggestions.</p>
        </div>`;
    return dashLayout({ user, guild, theme, allowed, active: 'roles', title: 'Roles', content });
}

// ---------- Custom commands (tags) ----------

function renderTags({ user, guild, theme, allowed, settings, csrf, saved, tags }) {
    const rows = Object.entries(tags)
        .sort((a, b) => b[1].uses - a[1].uses)
        .map(
            ([name, t]) => `<tr>
            <td><code>${esc(settings.prefix || '.')}${esc(name)}</code></td>
            <td class="muted" style="font-size:13px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.content)}</td>
            <td class="muted">${t.uses || 0}</td>
            <td><form method="post" action="/dashboard/${esc(guild.id)}/settings" data-confirm="Delete tag '${esc(name)}'?">
                <input type="hidden" name="section" value="tag-del">
                <input type="hidden" name="csrf" value="${esc(csrf)}">
                <input type="hidden" name="name" value="${esc(name)}">
                <button class="btn-danger btn-sm" type="submit">Delete</button>
            </form></td>
        </tr>`
        )
        .join('');

    const content = `
        ${toast(saved)}
        <h1>Custom Commands</h1>
        <p class="muted" style="margin:6px 0 18px">
            <strong>Your server's own</strong> text-reply commands — <code>${esc(settings.prefix || '.')}name</code> responds with the saved text.
            Separate from <a href="/dashboard/${esc(guild.id)}/commands">built-in Commands</a>; builtins always win on name conflicts.
        </p>
        <div class="card" style="padding:0;overflow:hidden;margin-bottom:18px">
            ${rows ? `<table><tr><th>Tag</th><th>Response</th><th>Uses</th><th></th></tr>${rows}</table>`
                   : '<p class="muted" style="padding:18px;font-size:14px">No tags yet.</p>'}
        </div>
        <div class="card">
            <h2>New tag</h2>
            <form method="post" action="/dashboard/${esc(guild.id)}/settings" style="margin-top:10px">
                <input type="hidden" name="section" value="tag-add">
                <input type="hidden" name="csrf" value="${esc(csrf)}">
                <div style="display:flex;gap:10px;margin-bottom:10px">
                    <input type="text" name="name" placeholder="name" maxlength="32" style="width:200px">
                </div>
                <textarea name="content" placeholder="Response text…" maxlength="1000" style="min-height:70px"></textarea>
                <span class="pvlabel" style="margin-top:10px">Preview</span>
                <div class="pv" data-src="content" data-user="${esc(user.username)}" data-guild="${esc(guild.name)}" data-empty="Start typing to preview the response…"></div>
                <button class="btn" type="submit" style="margin-top:12px">Create</button>
            </form>
            <p class="hint">Lowercase letters, numbers, - and _ only. Tags can't mention roles or @everyone.</p>
        </div>`;
    return dashLayout({ user, guild, theme, allowed, active: 'tags', title: 'Custom Commands', content });
}

// ---------- Economy ----------

function renderEconomy({ user, guild, theme, allowed, settings, csrf, saved }) {
    const ec = settings.economy;
    const content = `
        ${toast(saved)}
        <h1>Economy</h1>
        <p class="muted" style="margin:6px 0 18px">
            Per-server currency settings. The economy module itself is toggled on the Modules page.
        </p>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings">
            <div class="card">
                <h2>Currency name</h2>
                <div style="display:flex;align-items:center;gap:12px;margin-top:12px">
                    <span class="ifield">
                        <input type="text" name="currency" value="${esc(ec.currency || '')}" placeholder="coins" maxlength="16">
                        <span class="ok-ic">✓</span>
                    </span>
                </div>
                <p class="hint">Shown after amounts — e.g. "500 <strong>coins</strong>". Empty uses the global default.</p>
            </div>
            <div class="card" style="margin-top:16px">
                <h2>Daily reward</h2>
                <div style="display:flex;align-items:center;gap:12px;margin-top:12px">
                    <input type="number" name="dailyBase" value="${ec.dailyBase ?? ''}" placeholder="500" min="1" max="1000000">
                </div>
                <p class="hint">Base amount granted by the daily command (streak bonus still applies). Empty uses the global default.</p>
            </div>
            ${saveBar('economy', csrf)}
        </form>`;
    return dashLayout({ user, guild, theme, allowed, active: 'economy', title: 'Economy', content });
}

// ---------- Leveling ----------

function renderLeveling({ user, guild, theme, allowed, settings, csrf, saved, roles, channels }) {
    const lv = settings.leveling;
    const chanOpts = (cur) =>
        `<option value="">Same channel</option>` +
        channels
            .map((ch) => `<option value="${esc(ch.id)}" ${cur === ch.id ? 'selected' : ''}>#${esc(ch.name)}</option>`)
            .join('');
    const roleOpts = () =>
        roles.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
    const roleName = (id) => roles.find((x) => x.id === id)?.name || 'deleted role';

    const rewardRows = (lv.rewards || [])
        .map(
            (r, i) => `<tr>
            <td><code>${esc(r.level)}</code></td>
            <td>${esc(roleName(r.roleId))}</td>
            <td><form method="post" action="/dashboard/${esc(guild.id)}/settings" data-confirm="Remove the level ${esc(r.level)} reward?">
                <input type="hidden" name="section" value="lr-del">
                <input type="hidden" name="csrf" value="${esc(csrf)}">
                <input type="hidden" name="idx" value="${i}">
                <button class="btn-danger btn-sm" type="submit">Remove</button>
            </form></td>
        </tr>`
        )
        .join('');

    const content = `
        ${toast(saved)}
        <h1>Leveling</h1>
        <p class="muted" style="margin:6px 0 18px">
            Members earn XP for chatting. Placeholders: <code>{user}</code> mention, <code>{username}</code>,
            <code>{level}</code>, <code>{server}</code>.
        </p>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings">
            <div class="card">
                <div class="modrow"><div><strong>Enable leveling</strong><br>
                    <span class="muted" style="font-size:13px">Grant XP on every message (commands included).</span></div>
                    ${switch_('lv_enabled', lv.enabled)}</div>
            </div>
            <div class="card" style="margin-top:16px">
                <h2>XP rate</h2>
                <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-top:10px">
                    <label class="muted" style="font-size:13px">Min XP
                        <input type="number" name="xpMin" value="${lv.xpMin}" min="1" max="500" style="display:block;width:100px;margin-top:4px"></label>
                    <label class="muted" style="font-size:13px">Max XP
                        <input type="number" name="xpMax" value="${lv.xpMax}" min="1" max="500" style="display:block;width:100px;margin-top:4px"></label>
                    <label class="muted" style="font-size:13px">Cooldown (s)
                        <input type="number" name="cooldown" value="${lv.cooldown}" min="0" max="600" style="display:block;width:100px;margin-top:4px"></label>
                    <label class="muted" style="font-size:13px">Multiplier
                        <input type="number" name="multiplier" value="${lv.multiplier}" min="0.1" max="10" step="0.1" style="display:block;width:100px;margin-top:4px"></label>
                </div>
                <p class="hint">Each message grants a random amount between min and max, times the multiplier — at most once per cooldown.</p>
            </div>
            <div class="card" style="margin-top:16px">
                <h2>Level-up messages</h2>
                <div class="modrow" style="margin:10px 0"><div><strong>Announce level-ups</strong></div>
                    ${switch_('lv_announce', lv.announce)}</div>
                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
                    <select name="channel">${chanOpts(lv.channel)}</select>
                    <input type="text" name="message" value="${esc(lv.message)}" maxlength="300" style="flex:1;min-width:260px;width:auto">
                </div>
                <span class="pvlabel" style="margin-top:10px">Preview</span>
                <div class="pv" data-src="message" data-user="${esc(user.username)}" data-guild="${esc(guild.name)}"></div>
                <p class="hint">"Same channel" announces where they leveled; pick a channel to collect all level-ups in one place.</p>
            </div>
            ${saveBar('leveling', csrf)}
        </form>
        <div class="card" style="margin-top:16px">
            <h2>Level role rewards</h2>
            <p class="muted" style="font-size:13px;margin:4px 0 12px">Granted automatically when a member reaches the level.</p>
            ${rewardRows ? `<table><tr><th>Level</th><th>Role</th><th></th></tr>${rewardRows}</table>`
                         : '<p class="muted" style="font-size:14px">No rewards configured.</p>'}
            <h2 style="margin-top:18px">Add reward</h2>
            <form method="post" action="/dashboard/${esc(guild.id)}/settings" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px">
                <input type="hidden" name="section" value="lr-add">
                <input type="hidden" name="csrf" value="${esc(csrf)}">
                <input type="number" name="lvLevel" placeholder="Level" min="1" max="1000" style="width:90px">
                <select name="lvRole" style="min-width:160px">${roleOpts()}</select>
                <button class="btn" type="submit">Add</button>
            </form>
        </div>`;
    return dashLayout({ user, guild, theme, allowed, active: 'leveling', title: 'Leveling', content });
}

// ---------- Access (dashboard permissions + audit trail) ----------

function renderAccess({ user, guild, theme, allowed, settings, csrf, saved, roles, auditLog = [], names = {} }) {
    const a = settings.access || {};
    const TIER_OPTS = ['member', 'mod', 'admin', 'manager'];
    const TIER_NAMES = { member: 'Members', mod: 'Mods', admin: 'Admins', manager: 'Managers only' };
    const roleMulti = (name, picked) =>
        `<select name="${name}" multiple size="4" style="min-width:220px">` +
        roles
            .map((r) => `<option value="${esc(r.id)}" ${(picked || []).includes(r.id) ? 'selected' : ''}>${esc(r.name)}</option>`)
            .join('') +
        `</select>`;

    const sectionRows = SECTIONS.filter(([slug]) => slug !== 'access')
        .map(([slug, label]) => {
            const cur = a.sections?.[slug] ?? 'manager';
            const opts = TIER_OPTS.map(
                (t) => `<option value="${t}" ${cur === t ? 'selected' : ''}>${TIER_NAMES[t]}</option>`
            ).join('');
            return `<tr>
                <td>${esc(label)}</td>
                <td><select name="sec_${esc(slug || 'overview')}" style="min-width:170px">${opts}</select></td>
            </tr>`;
        })
        .join('');

    const auditRows = auditLog
        .map(
            (e) => `<div class="act"><span><strong>${esc(names[e.userId] || e.userId)}</strong> edited <code>${esc(e.section)}</code></span><span class="muted">${relTime(e.at)}</span></div>`
        )
        .join('');

    const content = `
        ${toast(saved)}
        <h1>Access</h1>
        <p class="muted" style="margin:6px 0 18px">
            Who can see and edit each dashboard section. <strong>Managers</strong> (Discord Manage Server / owner)
            always have full access. Members holding an <strong>Admin</strong> or <strong>Mod</strong> role below
            get the matching tier; everyone else counts as a Member.
        </p>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings" data-confirm="Update dashboard access? This takes effect immediately.">
            <div class="grid" style="grid-template-columns:1fr 1fr">
                <div class="card">
                    <h2>Admin roles</h2>
                    ${roleMulti('adminRoles', a.adminRoles)}
                    <p class="hint">Full access to every section except this page.</p>
                </div>
                <div class="card">
                    <h2>Mod roles</h2>
                    ${roleMulti('modRoles', a.modRoles)}
                    <p class="hint">Use for moderators — grant them Mod Log/Warns below.</p>
                </div>
            </div>
            <div class="card" style="margin-top:16px;padding:0;overflow:hidden">
                <table>
                    <tr><th style="padding-left:26px">Section</th><th>Minimum tier</th></tr>
                    ${sectionRows}
                </table>
                <p class="hint" style="padding:12px 26px">"Managers only" restores the original behavior. This Access page is always manager-only.</p>
            </div>
            ${saveBar('access', csrf)}
        </form>
        <div class="card" style="margin-top:16px">
            <h2>Audit trail</h2>
            ${auditRows || '<p class="muted" style="font-size:13.5px">No changes recorded yet.</p>'}
        </div>`;
    return dashLayout({ user, guild, theme, allowed, active: 'access', title: 'Access', content });
}

// ---------- Theme (per-user appearance, no guild) ----------

function renderTheme({ user, theme = {}, saved, csrf }) {
    const t = { accent: '#5865f2', mode: 'dark', sidebar: 'comfortable', font: 'normal', motion: 'on', ...theme };
    const radio = (name, value, cur, label) =>
        `<label class="check"><input type="radio" name="${name}" value="${value}" ${cur === value ? 'checked' : ''}><span>${label}</span></label>`;

    const content = `
        <style>
            .check{display:flex;align-items:center;gap:10px;padding:8px 10px;cursor:pointer;border-radius:10px;transition:background .15s ease-out}
            .check:hover{background:rgba(255,255,255,.04)}
            .check input{width:16px;height:16px;accent-color:var(--accent)}
            input[type=color]{width:52px;height:40px;padding:4px;background:var(--panel2);border:1px solid var(--line);border-radius:10px;cursor:pointer}
            .hint{font-size:12px;color:var(--muted);margin-top:4px}
        </style>
        ${toast(saved)}
        <div style="max-width:560px;margin:40px auto">
            <h1>Appearance</h1>
            <p class="muted" style="margin:6px 0 18px">Personal dashboard preferences — saved to your session, apply to every server.</p>
            <form method="post" action="/dashboard/theme">
                <input type="hidden" name="csrf" value="${esc(csrf)}">
                <div class="card">
                    <h2>Accent color</h2>
                    <div style="display:flex;align-items:center;gap:12px;margin-top:8px">
                        <input type="color" name="accent" value="${esc(t.accent)}">
                        <code>${esc(t.accent)}</code>
                    </div>
                </div>
                <div class="card" style="margin-top:16px">
                    <h2>Theme</h2>
                    ${radio('mode', 'dark', t.mode, 'Dark')}
                    ${radio('mode', 'light', t.mode, 'Light')}
                    ${radio('mode', 'auto', t.mode, 'Auto — follows your system')}
                </div>
                <div class="card" style="margin-top:16px">
                    <h2>Sidebar</h2>
                    ${radio('sidebar', 'comfortable', t.sidebar, 'Comfortable (248px)')}
                    ${radio('sidebar', 'compact', t.sidebar, 'Compact (200px)')}
                </div>
                <div class="card" style="margin-top:16px">
                    <h2>Font size</h2>
                    ${radio('font', 'normal', t.font, 'Normal')}
                    ${radio('font', 'large', t.font, 'Large')}
                    ${radio('font', 'larger', t.font, 'Larger')}
                </div>
                <div class="card" style="margin-top:16px">
                    <h2>Motion</h2>
                    ${radio('motion', 'on', t.motion, 'Animations on')}
                    ${radio('motion', 'reduced', t.motion, 'Reduced — disables count-up and transitions')}
                </div>
                <div style="display:flex;gap:12px;align-items:center;margin-top:18px">
                    <button class="btn" type="submit">Save appearance</button>
                    <a href="/dashboard">‹ Back to servers</a>
                </div>
            </form>
        </div>`;
    return layout({ title: 'Appearance', user, content, withBg: true });
}

module.exports = {
    renderOverview,
    renderGeneral,
    renderModules,
    renderCommands,
    renderModeration,
    renderAutomod,
    renderLogging,
    renderWelcome,
    renderRoles,
    renderTags,
    renderEconomy,
    renderLeveling,
    renderAccess,
    renderTheme,
};
