const { esc, BG } = require('./layout');

// Dashboard shell — Discord-style sidebar + topbar + content area, with the
// bg1 artwork dimmed behind everything. Every dashboard page renders inside
// this so navigation stays consistent.

const DASH_CSS = `
:root { --bg:#0d1117; --panel:#161b22; --panel2:#1c2330; --line:#2a3240;
       --text:#e8ebf0; --muted:#9aa4b0; --accent:#5865f2; --accent2:#7983f5; }
* { box-sizing:border-box; margin:0; padding:0 }
body { color:var(--text); font:15px/1.6 'Segoe UI',system-ui,sans-serif; min-height:100vh;
       ${BG ? `background:linear-gradient(rgba(13,17,23,.82),rgba(13,17,23,.92)),url('${BG}') center/cover fixed;` : 'background:var(--bg);'} }
a { color:var(--accent2); text-decoration:none }
.dwrap { display:flex; min-height:100vh }
.dside { width:248px; flex-shrink:0; background:rgba(13,17,23,.78); backdrop-filter:blur(12px);
         border-right:1px solid var(--line); padding:18px 12px; display:flex; flex-direction:column;
         position:sticky; top:0; height:100vh }
.dbrand { font-size:19px; font-weight:800; color:var(--text); padding:6px 10px 14px }
.dguild { display:flex; align-items:center; gap:10px; padding:10px; margin-bottom:8px;
          background:var(--panel2); border:1px solid var(--line); border-radius:10px }
.dguild img { width:36px; height:36px; border-radius:9px }
.dguild .name { font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dguild .sub { font-size:11px; color:var(--muted) }
.dgroup { font-size:11px; letter-spacing:1.2px; color:var(--muted); margin:16px 8px 4px; text-transform:uppercase }
.dlink { display:block; padding:9px 12px; border-radius:8px; color:var(--muted); font-weight:500; font-size:14px }
.dlink:hover { background:var(--panel2); color:var(--text) }
.dlink.active { background:var(--accent); color:#fff }
.dmain { flex:1; padding:28px 36px; max-width:1060px }
.dtop { display:flex; align-items:center; justify-content:space-between; margin-bottom:22px }
.dtop .crumb { color:var(--muted); font-size:13px }
.dtop .user { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:14px }
.dtop .user img { width:30px; height:30px; border-radius:50% }
.dfoot { margin-top:auto; padding-top:16px }
.card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:22px }
.grid { display:grid; gap:16px }
h1 { font-size:26px } h2 { font-size:19px; margin-bottom:10px }
.muted { color:var(--muted) }
.pill { display:inline-block; background:var(--panel2); border:1px solid var(--line);
        border-radius:999px; padding:2px 10px; font-size:12px; color:var(--muted); margin:2px }
.btn { display:inline-block; background:var(--accent); color:#fff; padding:9px 20px;
       border-radius:8px; font-weight:600; border:0; cursor:pointer; font-size:14px }
.btn:hover { background:var(--accent2) }
.btn.ghost { background:transparent; border:1px solid var(--line); color:var(--text) }
input[type=text],select { background:var(--panel2); border:1px solid var(--line); color:var(--text);
       border-radius:8px; padding:9px 12px; font-size:15px }
input[type=text] { width:140px } select { min-width:260px }
input:focus,select:focus { outline:1px solid var(--accent) }
table { width:100%; border-collapse:collapse }
th,td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:middle }
th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.5px }
code { background:var(--panel2); padding:2px 6px; border-radius:6px; font-size:13px }
.toast { background:#1d2b1d; border:1px solid #2d4a2d; color:#8fd68f; padding:10px 16px;
         border-radius:8px; margin-bottom:18px }
.switch { position:relative; display:inline-block; width:46px; height:25px; flex-shrink:0 }
.switch input { display:none }
.slider { position:absolute; inset:0; background:var(--panel2); border:1px solid var(--line);
          border-radius:999px; transition:.15s; cursor:pointer }
.slider::before { content:''; position:absolute; width:17px; height:17px; border-radius:50%;
          background:#9aa4b0; top:3px; left:4px; transition:.15s }
.switch input:checked + .slider { background:var(--accent); border-color:var(--accent) }
.switch input:checked + .slider::before { transform:translateX(20px); background:#fff }
.modrow { display:flex; align-items:center; justify-content:space-between; gap:14px;
          padding:14px 16px; border:1px solid var(--line); border-radius:10px; background:var(--panel) }
`;

const NAV = [
    { label: 'General', items: [['', 'Overview'], ['general', 'Settings']] },
    { label: 'Modules', items: [['modules', 'Modules'], ['commands', 'Commands']] },
    { label: 'Moderation', items: [['moderation', 'Mod Log']] },
];

function dashLayout({ user, guild, active, title, content }) {
    const base = `/dashboard/${guild.id}`;
    const nav = NAV.map(
        (group) => `
        <div class="dgroup">${esc(group.label)}</div>
        ${group.items
            .map(
                ([slug, label]) =>
                    `<a class="dlink ${active === slug ? 'active' : ''}" href="${base}${slug ? `/${slug}` : ''}">${esc(label)}</a>`
            )
            .join('')}`
    ).join('');

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(guild.name)} · Kotan</title>
<style>${DASH_CSS}</style>
</head><body>
<div class="dwrap">
    <aside class="dside">
        <a class="dbrand" href="/">Kotan</a>
        <div class="dguild">
            ${guild.icon ? `<img src="${esc(guild.icon)}" alt="">` : `<div style="width:36px;height:36px;border-radius:9px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700">${esc(guild.name[0] || '?')}</div>`}
            <div><div class="name">${esc(guild.name)}</div><div class="sub">${guild.memberCount ?? '?'} members</div></div>
        </div>
        ${nav}
        <div class="dfoot">
            <a class="dlink" href="/dashboard">‹ All servers</a>
        </div>
    </aside>
    <div class="dmain">
        <div class="dtop">
            <span class="crumb">Dashboard / ${esc(guild.name)} / ${esc(title)}</span>
            <span class="user"><img src="${esc(user.avatarUrl)}" alt="">${esc(user.username)} · <a href="/auth/logout">Logout</a></span>
        </div>
        ${content}
    </div>
</div>
</body></html>`;
}

module.exports = { dashLayout };
