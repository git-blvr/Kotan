// Shared HTML shell — nav, footer and the site's stylesheet live here so
// every page looks consistent. Views only provide `content` + `title`.

const esc = (s) =>
    String(s ?? '').replace(
        /[&<>"']/g,
        (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

// Optional page background image (src/assets is gitignored — page works without it).
let BG = null;
try {
    BG = require('../../assets/links.json')?.links?.website?.bg1 || null;
} catch {
    BG = null;
}

const CSS = `
:root { --bg:#0d1117; --panel:#161b22; --panel2:#1c2330; --line:#2a3240;
       --text:#e8ebf0; --muted:#9aa4b0; --accent:#5865f2; --accent2:#7983f5; }
* { box-sizing:border-box; margin:0; padding:0 }
body { background:var(--bg); color:var(--text); font:15px/1.6 'Segoe UI',system-ui,sans-serif;
       min-height:100vh; display:flex; flex-direction:column }
a { color:var(--accent2); text-decoration:none } a:hover { text-decoration:underline }
nav { display:flex; align-items:center; gap:20px; padding:14px 28px;
      background:rgba(13,17,23,.9); border-bottom:1px solid var(--line);
      position:sticky; top:0; backdrop-filter:blur(8px); z-index:10 }
nav .brand { font-weight:700; font-size:18px; color:var(--text) }
nav .links { display:flex; gap:18px; flex:1 }
nav .links a { color:var(--muted) } nav .links a.active,nav .links a:hover { color:var(--text); text-decoration:none }
nav .user { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:14px }
nav .user img { width:28px; height:28px; border-radius:50% }
main { flex:1; width:min(1100px,92%); margin:0 auto; padding:36px 0 }
footer { padding:20px; text-align:center; color:var(--muted); font-size:13px; border-top:1px solid var(--line) }
.btn { display:inline-block; background:var(--accent); color:#fff; padding:10px 22px;
       border-radius:8px; font-weight:600; border:0; cursor:pointer; font-size:14px }
.btn:hover { background:var(--accent2); text-decoration:none }
.btn.ghost { background:transparent; border:1px solid var(--line); color:var(--text) }
.btn.ghost:hover { border-color:var(--accent2) }
.card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:22px }
.grid { display:grid; gap:16px }
h1 { font-size:34px } h2 { font-size:22px; margin-bottom:12px }
.muted { color:var(--muted) }
.pill { display:inline-block; background:var(--panel2); border:1px solid var(--line);
        border-radius:999px; padding:2px 10px; font-size:12px; color:var(--muted); margin:2px }
input[type=text] { background:var(--panel2); border:1px solid var(--line); color:var(--text);
        border-radius:8px; padding:9px 12px; font-size:15px; width:120px }
input:focus { outline:1px solid var(--accent) }
table { width:100%; border-collapse:collapse }
th,td { text-align:left; padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top }
th { color:var(--muted); font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.5px }
code { background:var(--panel2); padding:2px 6px; border-radius:6px; font-size:13px }
.toast { background:#1d2b1d; border:1px solid #2d4a2d; color:#8fd68f; padding:10px 16px;
         border-radius:8px; margin-bottom:18px }
`;

function layout({ title, user = null, active = '', content = '', withBg = false }) {
    const link = (href, label, key) =>
        `<a href="${href}" class="${active === key ? 'active' : ''}">${label}</a>`;
    const userChip = user
        ? `<div class="user"><img src="${esc(user.avatarUrl)}" alt="">${esc(user.username)}
           <a class="btn ghost" style="padding:4px 12px" href="/auth/logout">Logout</a></div>`
        : `<a class="btn ghost" style="padding:6px 14px" href="/auth/login">Login</a>`;
    const bodyStyle = withBg && BG
        ? ` style="background:linear-gradient(rgba(13,17,23,.82),rgba(13,17,23,.9)),url('${esc(BG)}') center/cover fixed"`
        : '';

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Kotan</title>
<style>${CSS}</style>
</head><body${bodyStyle}>
<nav>
    <a class="brand" href="/">Kotan</a>
    <div class="links">
        ${link('/', 'Home', 'home')}
        ${link('/doc', 'Documentation', 'doc')}
        ${link('/dashboard', 'Dashboard', 'dashboard')}
    </div>
    ${userChip}
</nav>
<main>${content}</main>
<footer>Kotan · <a href="/privacy">Privacy</a> · <a href="/tos">Terms of Service</a></footer>
</body></html>`;
}

module.exports = { layout, esc, BG };
