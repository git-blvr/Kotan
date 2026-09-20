const { layout, esc } = require('./layout');

// Server picker — shown after Discord login. Splits the user's manageable
// guilds into "bot is here" (Manage) and "bot is missing" (Invite).
function renderPicker({ user, guilds, inviteUrl }) {
    const card = (g) => `
        <div class="card" style="display:flex;align-items:center;gap:14px">
            ${g.icon ? `<img src="${esc(g.icon)}" width="48" height="48" style="border-radius:12px" alt="">` : `<div style="width:48px;height:48px;border-radius:12px;background:var(--panel2);display:flex;align-items:center;justify-content:center;font-weight:700">${esc(g.name[0] || '?')}</div>`}
            <div style="flex:1;min-width:0">
                <strong>${esc(g.name)}</strong>
                ${g.memberCount ? `<div class="muted" style="font-size:13px">${g.memberCount} members</div>` : ''}
            </div>
            ${
                g.botIn
                    ? `<a class="btn" href="/dashboard/${esc(g.id)}">Manage</a>`
                    : `<a class="btn ghost" href="${esc(inviteUrl(g.id))}">Invite</a>`
            }
        </div>`;

    const inBot = guilds.filter((g) => g.botIn);
    const notInBot = guilds.filter((g) => !g.botIn);

    const content = `
        <h1>Your servers</h1>
        <p class="muted" style="margin:6px 0 20px">Servers where you are owner or have Manage Server / Administrator.</p>
        ${
            guilds.length === 0
                ? '<div class="card muted">No manageable servers found on your account.</div>'
                : ''
        }
        ${
            inBot.length
                ? `<h2>Kotan is in these</h2>
                   <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${inBot.map(card).join('')}</div>`
                : ''
        }
        ${
            notInBot.length
                ? `<h2 style="margin-top:30px">Add Kotan to these</h2>
                   <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">${notInBot.map(card).join('')}</div>`
                : ''
        }`;

    return layout({ title: 'Dashboard', user, active: 'dashboard', content, withBg: true });
}

module.exports = { renderPicker };
