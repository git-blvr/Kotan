const { dashLayout } = require('./dashLayout');
const { esc } = require('./layout');
const { capitalize } = require('../../helpers/format');

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

    const content = `
        ${toast(saved)}
        <h1>Overview</h1>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr));margin:18px 0 26px">
            ${[
                ['Members', guild.memberCount ?? '?'],
                ['Commands', stats.commands],
                ['Stored warns', stats.warns],
                ['Active tempbans', stats.tempbans],
                ['Modules on', `${enabled}/${categories.length}`],
            ]
                .map(
                    ([k, v]) => `<div class="card" style="text-align:center">
                        <div style="font-size:24px;font-weight:700">${v}</div>
                        <div class="muted" style="font-size:13px">${k}</div></div>`
                )
                .join('')}
        </div>
        <div class="card">
            <h2>Quick status</h2>
            <p class="muted" style="margin-top:6px">
                Prefix: <code>${esc(settings.prefix || 'default')}</code> ·
                Mod log: ${settings.modlogChannel ? `<code>#${esc(stats.modlogName || 'set')}</code>` : '<code>off</code>'} ·
                Disabled commands: <code>${settings.disabledCommands?.length || 0}</code>
            </p>
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

function renderCommands({ user, guild, settings, csrf, saved, commands }) {
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
        <p class="muted" style="margin:6px 0 18px">Enable or disable individual commands in this server.</p>
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

function renderModeration({ user, guild, settings, csrf, saved, channels }) {
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

module.exports = {
    renderOverview,
    renderGeneral,
    renderModules,
    renderCommands,
    renderModeration,
};
