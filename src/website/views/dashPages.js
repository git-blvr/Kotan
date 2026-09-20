const { dashLayout } = require('./dashLayout');
const { esc } = require('./layout');
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

const toast = (saved) => (saved ? '<div class="toast">Settings saved.</div>' : '');

const qitem = (label, valueHtml) =>
    `<div class="qitem"><span class="qlabel">${esc(label)}</span>${valueHtml}</div>`;

const CATEGORY_INFO = {
    core: 'Essential commands (help). Disabling hides help.',
    tools: 'Utility commands — ping, avatar, banner, serverinfo, color.',
    moderation: 'Warns, timeouts, bans and tempbans.',
    economy: 'Wallet/bank, daily rewards, payments and the shop.',
    games: 'Games like coinflip.',
};

// ---------- Overview ----------

function renderOverview({ user, guild, settings, stats, commands, saved }) {
    const categories = [...new Set([...commands.values()].map((c) => c.category))];
    const enabled = categories.filter((c) => settings.modules?.[c] !== false).length;
    const { usage, mod, members, modlogName } = stats;

    // Stat card: big number + 14-day sparkline + week-over-week delta.
    // Zero-value cards are dimmed so real activity pops visually.
    const stat = (label, value, { series, badge, dim } = {}) => `
        <div class="card stat ${dim ? 'empty' : ''}">
            <div class="slabel">${label}</div>
            <div class="sval" style="font-size:26px;font-weight:700;line-height:1.25;margin-top:2px">${value}</div>
            <div style="margin-top:8px;min-height:36px">${series ? sparkline(series) : ''}</div>
            ${badge || ''}
        </div>`;

    const content = `
        ${toast(saved)}
        <h1>Overview</h1>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));margin:18px 0 26px">
            ${stat('Members', guild.memberCount ?? members?.latest ?? '?', {
                series: members?.series || [],
                badge: growth(members?.pct ?? null),
            })}
            ${stat('Commands used', usage.total, {
                series: usage.series.map((d) => d.count),
                badge: delta(usage.week, usage.prevWeek),
                dim: !usage.total,
            })}
            ${stat('Warns', mod.warnsTotal, {
                series: mod.days.map((d) => d.warns),
                badge: delta(mod.warnsWeek, mod.warnsPrevWeek, { invert: true }),
                dim: !mod.warnsTotal,
            })}
            ${stat('Tempbans', mod.tempbansTotal, {
                series: mod.days.map((d) => d.tempbans),
                badge: delta(mod.tempbansWeek, mod.tempbansPrevWeek, { invert: true }),
                dim: !mod.tempbansTotal,
            })}
        </div>
        <div class="card">
            <h2>Quick status</h2>
            <div class="qgrid">
                ${qitem('Prefix', `<code>${esc(settings.prefix || 'default')}</code>`)}
                ${qitem('Mod log', settings.modlogChannel ? `<code>#${esc(modlogName || 'set')}</code>` : '<span class="muted">off</span>')}
                ${qitem('Modules', `<code>${enabled}/${categories.length} on</code>`)}
                ${qitem('Disabled commands', `<code>${settings.disabledCommands?.length || 0}</code>`)}
            </div>
        </div>`;
    return dashLayout({ user, guild, active: '', title: 'Overview', content });
}

// ---------- General (prefix) ----------

function renderGeneral({ user, guild, settings, csrf, saved }) {
    const content = `
        ${toast(saved)}
        <h1>Settings</h1>
        <div class="card" style="margin-top:18px">
            <h2>Command prefix</h2>
            <form method="post" action="/dashboard/${esc(guild.id)}/settings" style="display:flex;align-items:center;gap:12px;margin-top:12px">
                ${saveBar('general', csrf)}
                <input type="text" name="prefix" value="${esc(settings.prefix || '')}" placeholder="default: ." maxlength="5">
                <button class="btn" type="submit">Save</button>
            </form>
            <p class="muted" style="font-size:13px;margin-top:10px">
                1–5 characters, no spaces. Empty resets to the global default.
                Triggers (plain words) keep working regardless of prefix.
            </p>
        </div>`;
    return dashLayout({ user, guild, active: 'general', title: 'Settings', content });
}

// ---------- Modules (category toggles) ----------

function renderModules({ user, guild, settings, csrf, saved, commands }) {
    const categories = [...new Set([...commands.values()].map((c) => c.category))];
    const rows = categories
        .map((cat) => {
            const count = [...commands.values()].filter((c) => c.category === cat).length;
            const on = settings.modules?.[cat] !== false;
            return `<div class="modrow">
                <div>
                    <strong>${esc(capitalize(cat))}</strong>
                    <span class="pill">${count} commands</span>
                    <div class="muted" style="font-size:13px;margin-top:4px">${esc(CATEGORY_INFO[cat] || '')}</div>
                </div>
                ${switch_(`mod_${cat}`, on)}
            </div>`;
        })
        .join('');

    const content = `
        ${toast(saved)}
        <h1>Modules</h1>
        <p class="muted" style="margin:6px 0 18px">Toggle whole command categories for this server.</p>
        <form method="post" action="/dashboard/${esc(guild.id)}/settings">
            <div class="grid">${rows}</div>
            ${saveBar('modules', csrf)}
        </form>`;
    return dashLayout({ user, guild, active: 'modules', title: 'Modules', content });
}

// ---------- Commands (per-command toggles) ----------

function renderCommands({ user, guild, settings, csrf, saved, commands, usage }) {
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
        <form method="post" action="/dashboard/${esc(guild.id)}/settings">
            <div class="card" style="padding:0;overflow:hidden"><table>
                <tr><th>Command</th><th>Module</th><th>Description</th><th>Enabled</th></tr>
                ${rows}
            </table></div>
            ${saveBar('commands', csrf)}
        </form>`;
    return dashLayout({ user, guild, active: 'commands', title: 'Commands', content });
}

// ---------- Moderation (modlog channel) ----------

function renderModeration({ user, guild, settings, csrf, saved, channels, mod }) {
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
    return dashLayout({ user, guild, active: 'moderation', title: 'Mod Log', content });
}

// ---------- Automod ----------

function renderAutomod({ user, guild, settings, csrf, saved }) {
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
    return dashLayout({ user, guild, active: 'automod', title: 'Automod', content });
}

// ---------- Logging ----------

function renderLogging({ user, guild, settings, csrf, saved, channels }) {
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
    return dashLayout({ user, guild, active: 'logging', title: 'Logging', content });
}

// ---------- Welcome / Goodbye ----------

function renderWelcome({ user, guild, settings, csrf, saved, channels }) {
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
            </div>
            <div class="card" style="margin-top:16px">
                <h2>Goodbye message</h2>
                <div style="display:flex;align-items:center;gap:12px;margin-top:12px">${sel('goodbyeChannel', w.goodbyeChannel)}
                    <input type="text" name="goodbyeMessage" value="${esc(w.goodbyeMessage)}" maxlength="500" style="flex:1;width:auto"></div>
            </div>
            ${saveBar('welcome', csrf)}
        </form>`;
    return dashLayout({ user, guild, active: 'welcome', title: 'Welcome', content });
}

// ---------- Roles ----------

function renderRoles({ user, guild, settings, csrf, saved, roles, channels }) {
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
                <td><form method="post" action="/dashboard/${esc(guild.id)}/settings">
                    <input type="hidden" name="section" value="rr-del">
                    <input type="hidden" name="csrf" value="${esc(csrf)}">
                    <input type="hidden" name="idx" value="${i}">
                    <button class="btn ghost" type="submit" style="padding:4px 12px;font-size:12px">Remove</button>
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
                <select name="rrChannel" style="min-width:160px">${chanOpts()}</select>
                <input type="text" name="rrMessage" placeholder="Message ID" style="width:200px">
                <input type="text" name="rrEmoji" placeholder="Emoji" style="width:80px">
                <select name="rrRole" style="min-width:160px">${roleOpts(null)}</select>
                <button class="btn" type="submit">Add</button>
            </form>
            <p class="hint">Enable Developer Mode in Discord to copy a message ID (right-click → Copy Message ID). Emoji accepts unicode or a custom emoji.</p>
        </div>`;
    return dashLayout({ user, guild, active: 'roles', title: 'Roles', content });
}

// ---------- Custom commands (tags) ----------

function renderTags({ user, guild, settings, csrf, saved, tags }) {
    const rows = Object.entries(tags)
        .sort((a, b) => b[1].uses - a[1].uses)
        .map(
            ([name, t]) => `<tr>
            <td><code>${esc(settings.prefix || '.')}${esc(name)}</code></td>
            <td class="muted" style="font-size:13px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.content)}</td>
            <td class="muted">${t.uses || 0}</td>
            <td><form method="post" action="/dashboard/${esc(guild.id)}/settings">
                <input type="hidden" name="section" value="tag-del">
                <input type="hidden" name="csrf" value="${esc(csrf)}">
                <input type="hidden" name="name" value="${esc(name)}">
                <button class="btn ghost" type="submit" style="padding:4px 12px;font-size:12px">Delete</button>
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
                <button class="btn" type="submit" style="margin-top:12px">Create</button>
            </form>
            <p class="hint">Lowercase letters, numbers, - and _ only. Tags can't mention roles or @everyone.</p>
        </div>`;
    return dashLayout({ user, guild, active: 'tags', title: 'Custom Commands', content });
}

// ---------- Economy ----------

function renderEconomy({ user, guild, settings, csrf, saved }) {
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
                    <input type="text" name="currency" value="${esc(ec.currency || '')}" placeholder="coins" maxlength="16">
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
    return dashLayout({ user, guild, active: 'economy', title: 'Economy', content });
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
};
