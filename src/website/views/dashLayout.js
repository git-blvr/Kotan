const { esc, BG } = require('./layout');

// Dashboard shell — Discord-style sidebar + topbar + content area, with the
// bg1 artwork dimmed behind everything. Every dashboard page renders inside
// this so navigation stays consistent.

const DASH_CSS = `
:root { --bg:#0a0a0f; --panel:#121218; --panel2:#1b1b24; --card:#16161e; --line:#26262f;
       --text:#eceef3; --muted:#848b9a; --accent:#5865f2; --accent2:#7983f5;
       --shadow:0 1px 2px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.035);
       --shadow-lift:0 4px 14px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.045) }
* { box-sizing:border-box; margin:0; padding:0 }
body { color:var(--text); font:15px/1.6 'Segoe UI',system-ui,sans-serif; height:100vh; overflow:hidden;
       ${BG ? `background:linear-gradient(rgba(10,10,15,.86),rgba(10,10,15,.94)),url('${BG}') center/cover fixed;` : 'background:var(--bg);'} }
a { color:var(--accent2); text-decoration:none }
.dwrap { display:flex; flex-direction:row; height:100vh; overflow:hidden }
.dside { width:248px; flex-shrink:0; display:flex; flex-direction:column; padding:18px 12px;
         background:rgba(11,11,16,.82); backdrop-filter:blur(14px);
         border-right:1px solid rgba(255,255,255,.05); border-radius:0 20px 20px 0;
         box-shadow:4px 0 18px rgba(0,0,0,.35); overflow-y:auto }
.dbrand { font-size:19px; font-weight:700; letter-spacing:.3px; color:var(--text); padding:6px 10px 14px }
.dguild { display:flex; align-items:center; gap:10px; padding:10px; margin-bottom:8px;
          background:var(--panel2); border:1px solid rgba(255,255,255,.05); border-radius:14px;
          color:var(--text); box-shadow:var(--shadow);
          transition:border-color .12s, transform .12s }
.dguild:hover { border-color:rgba(88,101,242,.5); transform:translateY(-1px) }
.dguild img { width:36px; height:36px; border-radius:10px }
.dguild .name { font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dguild .sub { font-size:11px; color:var(--muted) }
.dgroup { font-size:10.5px; letter-spacing:1.4px; color:#5f6674; margin:22px 8px 6px; padding-top:16px;
          border-top:1px solid rgba(255,255,255,.05); text-transform:uppercase }
.dgroup:first-of-type { border-top:0; padding-top:0; margin-top:12px }
.dlink { display:block; padding:9px 12px; border-radius:9px; color:var(--muted); font-weight:500; font-size:14px;
         transition:background .12s, color .12s, transform .12s }
.dlink:hover { background:rgba(255,255,255,.045); color:var(--text); transform:translateX(2px) }
.dlink.active { background:rgba(88,101,242,.16); color:#cdd1ff; font-weight:600;
         box-shadow:0 0 14px rgba(88,101,242,.2), inset 0 0 0 1px rgba(88,101,242,.32) }
.dmain { flex:1; min-width:0; display:flex; flex-direction:column; gap:16px;
         padding:20px 24px; overflow:hidden }
.dtop { flex-shrink:0; height:64px; display:flex; align-items:center; justify-content:space-between;
        padding:0 22px; background:var(--panel); border-radius:20px; box-shadow:var(--shadow) }
.dtop .crumb { color:var(--muted); font-size:12.5px; letter-spacing:.3px }
.dtop .user { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:14px }
.dtop .user img { width:30px; height:30px; border-radius:50% }
.dcontent { flex:1; min-height:0; overflow-y:auto; padding:28px 32px;
            background:var(--panel); border-radius:20px; box-shadow:var(--shadow) }
.dfoot { margin-top:auto; padding-top:16px }
.card { background:var(--card); border-radius:16px; padding:26px; box-shadow:var(--shadow) }
.grid { display:grid; gap:16px }
h1 { font-size:22px; font-weight:650; letter-spacing:.2px }
h2 { font-size:13px; font-weight:600; letter-spacing:.9px; text-transform:uppercase;
     color:#aeb5c2; margin-bottom:12px }
.muted { color:var(--muted) }
.pill { display:inline-block; background:var(--panel2); border:1px solid var(--line);
        border-radius:999px; padding:2px 10px; font-size:12px; color:var(--muted); margin:2px }
.btn { display:inline-block; background:var(--accent); color:#fff; padding:9px 20px;
       border-radius:10px; font-weight:600; border:0; cursor:pointer; font-size:14px;
       transition:background .12s, transform .12s }
.btn:hover { background:var(--accent2); transform:translateY(-1px) }
.btn.ghost { background:transparent; border:1px solid var(--line); color:var(--text) }
.btn.ghost:hover { border-color:var(--accent); background:rgba(88,101,242,.08) }
input[type=text],input[type=number],select,textarea { background:var(--panel2);
       border:1px solid var(--line); color:var(--text); border-radius:10px; padding:9px 12px; font-size:15px;
       transition:border-color .12s }
input[type=text] { width:140px } input[type=number] { width:90px } select { min-width:260px }
textarea { width:100%; min-height:90px; resize:vertical; font:inherit; line-height:1.5 }
input:focus,select:focus,textarea:focus { outline:none; border-color:var(--accent) }
.check { display:flex; align-items:center; gap:10px; padding:9px 10px; cursor:pointer;
         border-radius:10px; transition:background .12s }
.check:hover { background:rgba(255,255,255,.03) }
.check input { width:16px; height:16px; accent-color:var(--accent) }
.hint { font-size:12px; color:var(--muted); margin-top:4px }
table { width:100%; border-collapse:collapse }
th,td { text-align:left; padding:11px 14px; border-bottom:1px solid rgba(255,255,255,.05); vertical-align:middle }
th { color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.8px }
tbody tr { transition:background .12s }
tbody tr:hover { background:rgba(255,255,255,.025) }
code { background:var(--panel2); padding:2px 6px; border-radius:6px; font-size:13px }
.toast { background:#152015; border:1px solid #264226; color:#8fd68f; padding:10px 16px;
         border-radius:12px; margin-bottom:18px }
.switch { position:relative; display:inline-block; width:46px; height:25px; flex-shrink:0 }
.switch input { display:none }
.slider { position:absolute; inset:0; background:var(--panel2); border:1px solid var(--line);
          border-radius:999px; transition:.15s; cursor:pointer }
.slider::before { content:''; position:absolute; width:17px; height:17px; border-radius:50%;
          background:#8b93a3; top:3px; left:4px; transition:.15s }
.switch input:checked + .slider { background:var(--accent); border-color:var(--accent);
          box-shadow:0 0 10px rgba(88,101,242,.35) }
.switch input:checked + .slider::before { transform:translateX(20px); background:#fff }
.modrow { display:flex; align-items:center; justify-content:space-between; gap:14px;
          padding:16px 18px; border-radius:14px; background:var(--card); box-shadow:var(--shadow);
          transition:background .12s, transform .12s }
.modrow:hover { background:#1a1a24; transform:translateY(-1px) }
.stat { position:relative }
.stat.empty { opacity:.45 }
.slabel { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1.1px;
          color:var(--muted) }
.sval { font-variant-numeric:tabular-nums }
.delta { display:inline-block; font-size:11.5px; font-weight:600; padding:2px 9px;
         border-radius:999px; margin-top:6px; border:1px solid var(--line) }
.delta.up { background:#152015; color:#8fd68f; border-color:#264226 }
.delta.down { background:#241515; color:#f09a9a; border-color:#3f2424 }
.delta.flat { background:var(--panel2); color:var(--muted) }
.qgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px }
.qitem { background:var(--panel2); border-radius:12px; padding:13px 15px; box-shadow:var(--shadow);
         transition:background .12s, transform .12s }
.qitem:hover { background:#20202c; transform:translateY(-1px) }
.qitem .qlabel { display:block; font-size:10.5px; text-transform:uppercase; letter-spacing:1px;
        color:var(--muted); margin-bottom:5px; font-weight:600 }
.trow { display:grid; grid-template-columns:110px 1fr 44px; align-items:center; gap:12px; padding:7px 0 }
.tbar { background:var(--panel2); border-radius:7px; height:14px; overflow:hidden }
.tbar span { display:block; height:100%; background:linear-gradient(90deg,var(--accent),var(--accent2));
             border-radius:7px }
.legend { display:flex; gap:18px; font-size:12px; color:var(--muted); margin-top:10px }
.legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px }
`;

const NAV = [
    { label: 'General', items: [['', 'Overview'], ['general', 'Settings']] },
    { label: 'Modules', items: [['modules', 'Modules'], ['commands', 'Commands'], ['tags', 'Custom Commands']] },
    { label: 'Moderation', items: [['automod', 'Automod'], ['moderation', 'Mod Log'], ['logging', 'Logging']] },
    { label: 'Server', items: [['welcome', 'Welcome'], ['roles', 'Roles'], ['economy', 'Economy']] },
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
        <a class="dguild" href="/dashboard" title="Switch server">
            ${guild.icon ? `<img src="${esc(guild.icon)}" alt="">` : `<div style="width:36px;height:36px;border-radius:9px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700">${esc(guild.name[0] || '?')}</div>`}
            <div><div class="name">${esc(guild.name)}</div><div class="sub">${guild.memberCount ?? '?'} members · switch ‹</div></div>
        </a>
        <a class="dlink" href="/dashboard" style="font-size:13px;padding:6px 12px">‹ All servers</a>
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
        <div class="dcontent">${content}</div>
    </div>
</div>
</body></html>`;
}

module.exports = { dashLayout };
