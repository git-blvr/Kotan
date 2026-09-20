const { layout, esc } = require('./layout');
const { capitalize } = require('../../helpers/format');

// Documentation page — generated from the live command collection, so it can
// never drift out of sync with the actual bot.
function renderDocs({ user, commands, prefix }) {
    const byCategory = new Map();
    for (const cmd of commands.values()) {
        if (!byCategory.has(cmd.category)) byCategory.set(cmd.category, []);
        byCategory.get(cmd.category).push(cmd);
    }

    const sections = [...byCategory.entries()]
        .map(
            ([category, cmds]) => `
        <h2 style="margin-top:34px">${esc(capitalize(category))}</h2>
        <div class="card" style="padding:0;overflow:hidden"><table>
            <tr><th style="width:200px">Command</th><th>Description</th><th style="width:260px">Aliases / Triggers</th></tr>
            ${cmds
                .map(
                    (c) => `<tr>
                <td><code>${esc(prefix)}${esc(c.name)}${c.usage ? ` ${esc(c.usage)}` : ''}</code></td>
                <td class="muted">${esc(c.description || '—')}${c.userPermissions?.length ? `<br><span class="pill">${c.userPermissions.map(esc).join('</span> <span class="pill">')}</span>` : ''}</td>
                <td>${[
                    ...(c.aliases || []).map((a) => `<span class="pill">${esc(a)}</span>`),
                    ...(c.triggers || []).map((t) => `<span class="pill" title="trigger">${esc(t)}</span>`),
                ].join(' ') || '<span class="muted">—</span>'}</td>
            </tr>`
                )
                .join('')}
        </table></div>`
        )
        .join('');

    const content = `
        <h1>Documentation</h1>
        <p class="muted" style="margin:8px 0 6px">
            Default prefix: <code>${esc(prefix)}</code> — per-server prefix can be changed in the
            <a href="/dashboard">dashboard</a>. Aliases work after the prefix
            (<code>${esc(prefix)}bal</code>), triggers work as plain words (<code>net</code>).
        </p>
        ${sections}`;

    return layout({ title: 'Documentation', user, active: 'doc', content });
}

module.exports = { renderDocs };
