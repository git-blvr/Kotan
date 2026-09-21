const { esc, BG } = require('./layout');

// Dashboard app-shell: fixed sidebar + topbar + scrollable content panel.
// Background is the bg1 artwork, dimmed.

const LIGHT_VARS = `--bg:#eef0f4; --panel:#ffffff; --panel2:#e6e9f0; --card:#fbfcfe; --line:#d5d9e3;
       --text:#1d2030; --muted:#5f6675;
       --shadow:0 1px 2px rgba(30,35,50,.12), inset 0 1px 0 rgba(255,255,255,.6);
       --shadow-lift:0 4px 14px rgba(30,35,50,.15), inset 0 1px 0 rgba(255,255,255,.7)`;

const DASH_CSS = `
:root { --bg:#0a0a0f; --panel:#121218; --panel2:#1b1b24; --card:#16161e; --line:#26262f;
       --text:#eceef3; --muted:#848b9a; --accent:#5865f2; --accent2:#7983f5;
       --shadow:0 1px 2px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.035);
       --shadow-lift:0 4px 14px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.045);
       color-scheme:dark }
/* dark thin scrollbars — sidebar, content, dropdown menus */
* { scrollbar-width:thin; scrollbar-color:rgba(255,255,255,.16) transparent }
::-webkit-scrollbar { width:9px; height:9px }
::-webkit-scrollbar-track { background:transparent }
::-webkit-scrollbar-thumb { background:rgba(255,255,255,.13); border-radius:8px;
       border:2px solid transparent; background-clip:padding-box }
::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.22); background-clip:padding-box }
body[data-mode=light] * { scrollbar-color:rgba(0,0,0,.25) transparent }
body[data-mode=light] { color-scheme:light }
body[data-mode=light] ::-webkit-scrollbar-thumb { background:rgba(0,0,0,.2); background-clip:padding-box }
@media (prefers-color-scheme: light) {
    body[data-mode=auto] { color-scheme:light }
    body[data-mode=auto] * { scrollbar-color:rgba(0,0,0,.25) transparent }
    body[data-mode=auto] ::-webkit-scrollbar-thumb { background:rgba(0,0,0,.2); background-clip:padding-box } }
body[data-mode=light] { ${LIGHT_VARS} }
@media (prefers-color-scheme: light) { body[data-mode=auto] { ${LIGHT_VARS} } }
* { box-sizing:border-box; margin:0; padding:0 }
body { color:var(--text); font:15px/1.6 'Segoe UI',system-ui,sans-serif; height:100vh; overflow:hidden;
       ${BG ? `background:linear-gradient(rgba(10,10,15,.86),rgba(10,10,15,.94)),url('${BG}') center/cover fixed;` : 'background:var(--bg);'} }
body[data-mode=light], body[data-mode=auto] {
       ${BG ? `background:linear-gradient(rgba(238,240,244,.88),rgba(238,240,244,.95)),url('${BG}') center/cover fixed;` : ''} }
a { color:var(--accent2); text-decoration:none }
.dwrap { display:flex; flex-direction:row; height:100vh; overflow:hidden }
.dside { width:248px; flex-shrink:0; display:flex; flex-direction:column; padding:18px 12px;
         background:rgba(11,11,16,.82); backdrop-filter:blur(14px);
         border-right:1px solid rgba(255,255,255,.05); border-radius:0 20px 20px 0;
         box-shadow:4px 0 18px rgba(0,0,0,.35); overflow-y:auto }
body[data-mode=light] .dside, body[data-mode=auto] .dside { background:rgba(255,255,255,.78);
         border-right-color:rgba(0,0,0,.08); box-shadow:4px 0 18px rgba(30,35,50,.12) }
body[data-side=compact] .dside { width:200px }
body[data-font=large] { font-size:16.5px }
body[data-font=larger] { font-size:18px }
.dbrand { font-size:19px; font-weight:700; letter-spacing:.3px; color:var(--text); padding:6px 10px 14px }
.dguild { display:flex; align-items:center; gap:10px; padding:10px; margin-bottom:8px;
          background:var(--panel2); border:1px solid rgba(255,255,255,.05); border-radius:14px;
          color:var(--text); box-shadow:var(--shadow);
          transition:border-color .15s ease-out, transform .15s ease-out }
.dguild:hover { border-color:color-mix(in srgb, var(--accent) 50%, transparent); transform:translateY(-1px) }
.dguild img { width:36px; height:36px; border-radius:10px }
.dguild .name { font-weight:600; font-size:14px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dguild .sub { font-size:11px; color:var(--muted) }
.dgroup { font-size:10.5px; letter-spacing:1.4px; color:#5f6674; margin:26px 8px 7px; padding-top:18px;
          border-top:1px solid rgba(255,255,255,.05); text-transform:uppercase }
body[data-mode=light] .dgroup, body[data-mode=auto] .dgroup { color:#8a91a3; border-top-color:rgba(0,0,0,.07) }
.dgroup:first-of-type { border-top:0; padding-top:0; margin-top:12px }
.dlink { display:block; padding:9px 12px; border-radius:9px; color:var(--muted); font-weight:500; font-size:14px;
         transition:background .15s ease-out, color .15s ease-out, transform .15s ease-out }
.dlink:hover { background:rgba(255,255,255,.045); color:var(--text); transform:translateX(2px) }
body[data-mode=light] .dlink:hover, body[data-mode=auto] .dlink:hover { background:rgba(0,0,0,.05) }
.dlink.active { background:color-mix(in srgb, var(--accent) 16%, transparent); color:var(--text); font-weight:600;
         box-shadow:0 0 14px color-mix(in srgb, var(--accent) 22%, transparent),
                    inset 0 0 0 1px color-mix(in srgb, var(--accent) 34%, transparent) }
.dmain { flex:1; min-width:0; display:flex; flex-direction:column; gap:16px;
         padding:20px 24px; overflow:hidden }
.dtop { flex-shrink:0; height:64px; display:flex; align-items:center; justify-content:space-between; gap:12px;
        padding:0 22px; background:var(--panel); border-radius:20px; box-shadow:var(--shadow) }
.dtop .crumb { color:var(--muted); font-size:12.5px; letter-spacing:.3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.dtop .user { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:14px; flex-shrink:0 }
.dtop .user img { width:30px; height:30px; border-radius:50% }
.dcontent { flex:1; min-height:0; overflow-y:auto; padding:28px 32px;
            background:var(--panel); border-radius:20px; box-shadow:var(--shadow) }
.dfoot { margin-top:auto; padding-top:16px }
.card { background:var(--card); border-radius:16px; padding:26px; box-shadow:var(--shadow) }
.grid { display:grid; gap:16px }
h1 { font-size:22px; font-weight:650; letter-spacing:.2px }
h2 { font-size:13px; font-weight:600; letter-spacing:.9px; text-transform:uppercase;
     color:var(--muted); margin-bottom:12px }
.muted { color:var(--muted) }
.pill { display:inline-block; background:var(--panel2); border:1px solid var(--line);
        border-radius:999px; padding:2px 10px; font-size:12px; color:var(--muted); margin:2px }
/* ---------- buttons: primary / secondary / ghost / danger ---------- */
.btn, .btn-sec, .btn-ghost, .btn-danger {
       display:inline-flex; align-items:center; justify-content:center; gap:8px;
       padding:9px 20px; border-radius:10px; font-weight:600; font-size:14px;
       cursor:pointer; text-decoration:none; position:relative;
       transition:background .15s ease-out, color .15s ease-out, border-color .15s ease-out,
                  transform .15s ease-out, filter .15s ease-out }
.btn { background:var(--accent); color:#fff; border:0;
       box-shadow:0 1px 2px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.14) }
.btn:hover { background:var(--accent2); transform:translateY(-1px) }
.btn-sec { background:var(--panel2); color:var(--text); border:1px solid var(--line) }
.btn-sec:hover { border-color:color-mix(in srgb, var(--accent) 45%, transparent);
       transform:translateY(-1px) }
.btn-ghost { background:transparent; color:var(--muted); border:0 }
.btn-ghost:hover { color:var(--text); background:rgba(255,255,255,.05) }
.btn-danger { background:color-mix(in srgb, #e05555 13%, transparent); color:#f09a9a;
       border:1px solid color-mix(in srgb, #e05555 35%, transparent) }
.btn-danger:hover { background:color-mix(in srgb, #e05555 22%, transparent); transform:translateY(-1px) }
.btn:active, .btn-sec:active, .btn-ghost:active, .btn-danger:active {
       transform:scale(.98); filter:brightness(.93) }
.btn:disabled, .btn-sec:disabled, .btn-ghost:disabled, .btn-danger:disabled {
       opacity:.5; pointer-events:none; transform:none }
.btn-sm { padding:5px 13px; font-size:12.5px; border-radius:8px }
.btn-lg { padding:13px 30px; font-size:15.5px; border-radius:12px }
.btn.loading, .btn-sec.loading, .btn-danger.loading { color:transparent !important; pointer-events:none }
.btn.loading::after, .btn-sec.loading::after, .btn-danger.loading::after {
       content:''; position:absolute; width:14px; height:14px; left:50%; top:50%;
       margin:-8px 0 0 -8px; border:2px solid rgba(255,255,255,.35); border-top-color:#fff;
       border-radius:50%; animation:spin .7s linear infinite }
.btn-danger.loading::after { border-color:rgba(240,154,154,.35); border-top-color:#f09a9a }
@keyframes spin { to { transform:rotate(360deg) } }
body[data-mode=light] .btn-ghost:hover, body[data-mode=auto] .btn-ghost:hover { background:rgba(0,0,0,.05) }

/* ---------- inputs ---------- */
input[type=text],input[type=number],input[type=color],select,textarea { background:var(--panel2);
       border:1px solid var(--line); color:var(--text); border-radius:10px; padding:9px 12px; font-size:15px;
       transition:border-color .15s ease-out, box-shadow .15s ease-out }
input[type=color] { width:52px; height:40px; padding:4px; cursor:pointer }
input[type=text] { width:140px } input[type=number] { width:90px } select { min-width:260px }
select[multiple] { min-height:96px; min-width:200px; padding:6px }
textarea { width:100%; min-height:90px; resize:vertical; font:inherit; line-height:1.5 }
input:hover,select:hover,textarea:hover { border-color:rgba(255,255,255,.16) }
body[data-mode=light] input:hover, body[data-mode=auto] input:hover,
body[data-mode=light] select:hover, body[data-mode=auto] select:hover,
body[data-mode=light] textarea:hover, body[data-mode=auto] textarea:hover { border-color:rgba(0,0,0,.22) }
input:focus,select:focus,textarea:focus { outline:none; border-color:var(--accent);
       box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent) }
::placeholder { color:#565c6b; opacity:1 }
body[data-mode=light] ::placeholder, body[data-mode=auto] ::placeholder { color:#9aa1b0 }
select:not([multiple]) { appearance:none; -webkit-appearance:none; padding-right:32px;
       background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23848b9a' stroke-width='1.6' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
       background-repeat:no-repeat; background-position:right 12px center; cursor:pointer }
/* inline validation */
input:user-invalid, textarea:user-invalid { border-color:#e05555 !important }
.err-msg { display:none; font-size:12px; color:#f09a9a; margin-top:6px }
input:user-invalid + .err-msg, .ifield:has(input:user-invalid) + .err-msg { display:block }
.ifield { position:relative; display:inline-flex; align-items:center }
.ifield .ok-ic { position:absolute; right:10px; color:#8fd68f; font-size:13px; opacity:0;
       transition:opacity .15s ease-out; pointer-events:none }
.ifield:has(input:valid:not(:placeholder-shown)) .ok-ic { opacity:1 }
:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:8px }
.check { display:flex; align-items:center; gap:10px; padding:9px 10px; cursor:pointer;
         border-radius:10px; transition:background .15s ease-out }
.check:hover { background:rgba(255,255,255,.03) }
body[data-mode=light] .check:hover, body[data-mode=auto] .check:hover { background:rgba(0,0,0,.04) }
.check input { width:16px; height:16px; accent-color:var(--accent); flex-shrink:0 }
.hint { font-size:12px; color:var(--muted); margin-top:4px }
table { width:100%; border-collapse:collapse }
th,td { text-align:left; padding:11px 14px; border-bottom:1px solid rgba(255,255,255,.05); vertical-align:middle }
body[data-mode=light] th, body[data-mode=light] td,
body[data-mode=auto] th, body[data-mode=auto] td { border-bottom-color:rgba(0,0,0,.07) }
th { color:var(--muted); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.8px }
tbody tr { transition:background .15s ease-out }
tbody tr:hover { background:rgba(255,255,255,.025) }
body[data-mode=light] tbody tr:hover, body[data-mode=auto] tbody tr:hover { background:rgba(0,0,0,.03) }
code { background:var(--panel2); padding:2px 6px; border-radius:6px; font-size:13px }
.toast { position:fixed; right:22px; bottom:22px; z-index:150; overflow:hidden;
         background:#152015; border:1px solid #264226; color:#8fd68f; padding:12px 40px 12px 16px;
         border-radius:12px; box-shadow:0 8px 26px rgba(0,0,0,.45);
         animation:toastIn .22s ease-out }
body[data-mode=light] .toast, body[data-mode=auto] .toast { background:#e3f4e3; border-color:#b8dcb8; color:#2d6b2d }
.toast.hide { opacity:0; transform:translateY(8px); transition:opacity .18s ease-out, transform .18s ease-out }
@keyframes toastIn { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
.tprog { position:absolute; left:0; bottom:0; height:2px; background:currentColor; opacity:.7;
         animation:tprog 3s linear forwards }
@keyframes tprog { from { width:100% } to { width:0 } }
.tx { position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:0;
      color:inherit; font-size:15px; cursor:pointer; opacity:.65; padding:4px 6px; border-radius:6px }
.tx:hover { opacity:1; background:rgba(255,255,255,.08) }
.switch { position:relative; display:inline-block; width:46px; height:25px; flex-shrink:0 }
.switch input { position:absolute; opacity:0; inset:0; margin:0 }
.slider { position:absolute; inset:0; background:var(--panel2); border:1px solid var(--line);
          border-radius:999px; transition:background .18s ease-out, border-color .18s ease-out,
          box-shadow .18s ease-out; cursor:pointer }
.slider::before { content:''; position:absolute; width:17px; height:17px; border-radius:50%;
          background:#8b93a3; top:3px; left:4px;
          transition:transform .18s ease-out, background .18s ease-out }
.switch input:checked + .slider { background:var(--accent); border-color:var(--accent);
          box-shadow:0 0 10px color-mix(in srgb, var(--accent) 35%, transparent) }
.switch input:checked + .slider::before { transform:translateX(20px); background:#fff }
.switch input:focus-visible + .slider { outline:2px solid var(--accent); outline-offset:2px }
.modrow { display:flex; align-items:center; justify-content:space-between; gap:14px;
          padding:16px 18px; border-radius:14px; background:var(--card); box-shadow:var(--shadow);
          transition:background .15s ease-out, transform .15s ease-out }
.modrow:hover { background:#1a1a24; transform:translateY(-1px) }
body[data-mode=light] .modrow:hover, body[data-mode=auto] .modrow:hover { background:#f0f1f6 }
.stat { position:relative; --sa:var(--accent);
        box-shadow:var(--shadow), inset 0 2px 0 var(--sa) }
.stat.empty { opacity:.45 }
.slabel { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:1.1px;
          color:var(--muted) }
.sval { font-variant-numeric:tabular-nums }
.delta { display:inline-block; font-size:11.5px; font-weight:600; padding:2px 9px;
         border-radius:999px; margin-top:6px; border:1px solid var(--line) }
.delta.up { background:#152015; color:#8fd68f; border-color:#264226 }
.delta.down { background:#241515; color:#f09a9a; border-color:#3f2424 }
.delta.flat { background:var(--panel2); color:var(--muted) }
body[data-mode=light] .delta.up, body[data-mode=auto] .delta.up { background:#e3f4e3; color:#2d6b2d; border-color:#b8dcb8 }
body[data-mode=light] .delta.down, body[data-mode=auto] .delta.down { background:#fbe9e9; color:#a33d3d; border-color:#eccaca }
.qgrid { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px }
.qitem { background:var(--panel2); border-radius:12px; padding:13px 15px; box-shadow:var(--shadow);
         transition:background .15s ease-out, transform .15s ease-out; color:var(--text); display:block }
.qitem:hover { background:#20202c; transform:translateY(-1px) }
body[data-mode=light] .qitem:hover, body[data-mode=auto] .qitem:hover { background:#eceef5 }
.qitem .qlabel { display:block; font-size:10.5px; text-transform:uppercase; letter-spacing:1px;
        color:var(--muted); margin-bottom:5px; font-weight:600 }
.qitem .qgo { float:right; color:var(--muted); font-size:12px }
.trow { display:grid; grid-template-columns:110px 1fr 44px; align-items:center; gap:12px; padding:7px 0 }
.tbar { background:var(--panel2); border-radius:7px; height:14px; overflow:hidden;
        box-shadow:inset 0 1px 3px rgba(0,0,0,.35) }
.tbar span { display:block; height:100%; background:linear-gradient(90deg,var(--accent),var(--accent2));
             border-radius:7px }
.legend { display:flex; gap:18px; font-size:12px; color:var(--muted); margin-top:10px }
.legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px }
.act { display:flex; justify-content:space-between; align-items:baseline; gap:12px; padding:8px 0;
       border-bottom:1px solid rgba(255,255,255,.05); font-size:13.5px }
body[data-mode=light] .act, body[data-mode=auto] .act { border-bottom-color:rgba(0,0,0,.07) }
.act:last-child { border-bottom:0 }
.act .muted { font-size:12px; white-space:nowrap }
.pv { background:var(--panel2); border-radius:12px; padding:14px 16px; margin-top:12px; font-size:14px;
      box-shadow:var(--shadow); min-height:22px; white-space:pre-wrap; word-break:break-word }
.pvlabel { display:block; font-size:10.5px; text-transform:uppercase; letter-spacing:1px;
           color:var(--muted); margin-bottom:6px; font-weight:600 }

/* ---------- custom select (single-select enhancement) ---------- */
.dsel { position:relative; display:inline-block; min-width:170px }
.dsel-src { display:none } /* original stays in the form so its value still submits */
.dsel-btn { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%;
       background:var(--panel2); border:1px solid var(--line); color:var(--text); border-radius:10px;
       padding:9px 12px; font-size:15px; cursor:pointer; text-align:left;
       transition:border-color .15s ease-out, box-shadow .15s ease-out }
.dsel-btn:hover { border-color:rgba(255,255,255,.16) }
.dsel-btn:focus-visible { outline:none; border-color:var(--accent);
       box-shadow:0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent) }
.dsel-btn:disabled { opacity:.5; cursor:default }
.dsel .chev { color:var(--muted); font-size:11px; transition:transform .16s ease-out }
.dsel.open .chev { transform:rotate(180deg) }
.dsel-menu { position:absolute; top:calc(100% + 6px); left:0; min-width:100%; width:max-content; max-width:280px;
       background:var(--panel2); border:1px solid var(--line); border-radius:12px;
       box-shadow:0 10px 32px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.04);
       max-height:230px; overflow-y:auto; z-index:120; list-style:none;
       opacity:0; transform:scale(.96) translateY(-4px); transform-origin:top; pointer-events:none;
       transition:opacity .16s ease-out, transform .16s ease-out }
.dsel.open .dsel-menu { opacity:1; transform:none; pointer-events:auto }
.dsel-opt { padding:8px 12px; font-size:14px; color:var(--text); cursor:pointer;
       display:flex; justify-content:space-between; gap:16px; align-items:center;
       transition:background .1s }
.dsel-opt:hover { background:rgba(255,255,255,.06) }
body[data-mode=light] .dsel-opt:hover, body[data-mode=auto] .dsel-opt:hover { background:rgba(0,0,0,.05) }
.dsel-opt.sel { color:var(--accent2); font-weight:600 }
.dsel-opt.sel::after { content:'✓'; font-size:12px }

/* ---------- modal ---------- */
.modal-bg { position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center;
       background:rgba(0,0,0,.55); backdrop-filter:blur(3px);
       opacity:0; transition:opacity .18s ease-out }
.modal-bg.show { opacity:1 }
.modal { background:var(--panel); border:1px solid var(--line); border-radius:18px;
       padding:22px 24px; max-width:420px; width:calc(100% - 48px);
       box-shadow:0 20px 60px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04);
       transform:scale(.95); opacity:0;
       transition:transform .18s ease-out, opacity .18s ease-out }
.modal-bg.show .modal { transform:none; opacity:1 }
.modal h3 { font-size:15.5px; margin-bottom:8px }
.modal p { font-size:14px; color:var(--muted); margin-bottom:18px; line-height:1.55 }
.modal-actions { display:flex; justify-content:flex-end; gap:10px }

/* ---- entrance + draw animations ---- */
@keyframes rise { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:none } }
.dcontent > * { animation:rise .35s cubic-bezier(.2,.7,.3,1) both }
.dcontent > *:nth-child(2) { animation-delay:.05s }
.dcontent > *:nth-child(3) { animation-delay:.1s }
.dcontent > *:nth-child(4) { animation-delay:.15s }
.dcontent > *:nth-child(n+5) { animation-delay:.2s }
.sparkline polyline { stroke-dasharray:100; stroke-dashoffset:100; animation:draw .7s ease-out .15s forwards }
@keyframes draw { to { stroke-dashoffset:0 } }
body[data-motion=reduced] *, body[data-motion=reduced] *::before, body[data-motion=reduced] *::after {
    animation:none !important; transition:none !important }
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation:none !important; transition:none !important } }

/* ---- mobile: off-canvas sidebar via checkbox hack ---- */
.navtoggle { display:none }
.navbtn { display:none }
@media (max-width:820px) {
    .dside { position:fixed; left:0; top:0; bottom:0; z-index:60; transform:translateX(-105%);
             transition:transform .25s ease; box-shadow:8px 0 30px rgba(0,0,0,.5) }
    .navtoggle:checked ~ .dwrap .dside { transform:none }
    .navtoggle:checked ~ .dwrap::before { content:''; position:fixed; inset:0;
             background:rgba(0,0,0,.45); z-index:55 }
    .navbtn { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px;
              border-radius:9px; color:var(--muted); cursor:pointer; font-size:17px; flex-shrink:0 }
    .navbtn:hover { background:rgba(255,255,255,.06); color:var(--text) }
    .dmain { padding:14px }
    .dtop { height:56px; padding:0 14px }
    .dcontent { padding:20px }
    .qgrid { grid-template-columns:1fr }
}
`;

// Page slugs shared with the Access page's per-section tier selects.
const SECTIONS = [
    ['', 'Overview'],
    ['general', 'Settings'],
    ['modules', 'Modules'],
    ['commands', 'Commands'],
    ['tags', 'Custom Commands'],
    ['automod', 'Automod'],
    ['moderation', 'Mod Log'],
    ['logging', 'Logging'],
    ['welcome', 'Welcome'],
    ['roles', 'Roles'],
    ['economy', 'Economy'],
    ['leveling', 'Leveling'],
    ['access', 'Access'],
];

const NAV = [
    { label: 'General', items: [['', 'Overview'], ['general', 'Settings']] },
    { label: 'Modules', items: [['modules', 'Modules'], ['commands', 'Commands'], ['tags', 'Custom Commands']] },
    { label: 'Moderation', items: [['automod', 'Automod'], ['moderation', 'Mod Log'], ['logging', 'Logging']] },
    { label: 'Server', items: [['welcome', 'Welcome'], ['roles', 'Roles'], ['economy', 'Economy'], ['leveling', 'Leveling'], ['access', 'Access']] },
];

const lighten = (hex, amt = 0.22) => {
    const n = parseInt(hex.slice(1), 16);
    const c = (s) => Math.min(255, Math.round(((n >> s) & 255) + 255 * amt));
    return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
};

function dashLayout({ user, guild, active, title, content, theme, allowed }) {
    const t = { accent: '#5865f2', mode: 'dark', sidebar: 'comfortable', font: 'normal', motion: 'on', ...(theme || {}) };
    const can = allowed || (() => true);
    const base = `/dashboard/${guild.id}`;
    const nav = NAV.map((group) => {
        const items = group.items.filter(([slug]) => can(slug));
        if (!items.length) return '';
        return `
        <div class="dgroup">${esc(group.label)}</div>
        ${items
            .map(
                ([slug, label]) =>
                    `<a class="dlink ${active === slug ? 'active' : ''}" href="${base}${slug ? `/${slug}` : ''}">${esc(label)}</a>`
            )
            .join('')}`;
    }).join('');

    return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(guild.name)} · Kotan</title>
<style>${DASH_CSS}
:root { --accent:${esc(t.accent)}; --accent2:${esc(lighten(t.accent))} }</style>
</head><body data-mode="${esc(t.mode)}" data-side="${esc(t.sidebar)}" data-font="${esc(t.font)}" data-motion="${esc(t.motion)}">
<input type="checkbox" id="navtoggle" class="navtoggle" aria-label="Toggle navigation">
<div class="dwrap">
    <aside class="dside">
        <a class="dbrand" href="/">Kotan</a>
        <a class="dguild" href="/dashboard" title="Switch server">
            ${guild.icon ? `<img src="${esc(guild.icon)}" alt="">` : `<div style="width:36px;height:36px;border-radius:10px;background:var(--accent);display:flex;align-items:center;justify-content:center;font-weight:700">${esc(guild.name[0] || '?')}</div>`}
            <div><div class="name">${esc(guild.name)}</div><div class="sub">${guild.memberCount ?? '?'} members · switch ‹</div></div>
        </a>
        <a class="dlink" href="/dashboard" style="font-size:13px;padding:6px 12px">‹ All servers</a>
        ${nav}
        <div class="dfoot">
            <a class="dlink" href="/dashboard/theme" style="font-size:13px">Appearance</a>
            <a class="dlink" href="/dashboard" style="font-size:13px">‹ All servers</a>
        </div>
    </aside>
    <div class="dmain">
        <div class="dtop">
            <label for="navtoggle" class="navbtn" title="Menu">☰</label>
            <span class="crumb">Dashboard / ${esc(guild.name)} / ${esc(title)}</span>
            <span class="user"><img src="${esc(user.avatarUrl)}" alt="">${esc(user.username)} · <a href="/auth/logout">Logout</a></span>
        </div>
        <div class="dcontent">${content}</div>
    </div>
</div>
<script>
(function () {
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.dataset.motion === 'reduced';

    // ---------- custom select dropdowns (single-select only) ----------
    document.querySelectorAll('select:not([multiple]):not([data-native])').forEach(function (sel) {
        var wrap = document.createElement('div');
        wrap.className = 'dsel';
        if (sel.style.minWidth) wrap.style.minWidth = sel.style.minWidth;
        if (sel.style.width) wrap.style.width = sel.style.width;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'dsel-btn';
        btn.setAttribute('aria-haspopup', 'listbox');
        btn.setAttribute('aria-expanded', 'false');
        btn.innerHTML = '<span class="dsel-lab"></span><span class="chev">▾</span>';
        var menu = document.createElement('ul');
        menu.className = 'dsel-menu';
        menu.setAttribute('role', 'listbox');
        function buildMenu() {
            menu.innerHTML = '';
            Array.prototype.forEach.call(sel.options, function (o, i) {
                var li = document.createElement('li');
                li.className = 'dsel-opt' + (o.selected ? ' sel' : '');
                li.textContent = o.text;
                li.setAttribute('role', 'option');
                li.addEventListener('click', function () {
                    sel.selectedIndex = i;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    sync(); close();
                });
                menu.appendChild(li);
            });
        }
        buildMenu();
        var lab = btn.querySelector('.dsel-lab');
        function sync() {
            lab.textContent = sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : '—';
            Array.prototype.forEach.call(menu.children, function (li, i) {
                li.classList.toggle('sel', sel.options[i].selected);
            });
        }
        function openM() { wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
        function close() { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
        sel.addEventListener('dsel:refresh', function () { buildMenu(); sync(); btn.disabled = sel.disabled; });
        btn.disabled = sel.disabled;
        sync();
        btn.addEventListener('click', function () { wrap.classList.contains('open') ? close() : openM(); });
        btn.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!wrap.classList.contains('open')) openM();
                else if (sel.selectedIndex < sel.options.length - 1) { sel.selectedIndex++; sel.dispatchEvent(new Event('change', { bubbles: true })); sync(); }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (sel.selectedIndex > 0) { sel.selectedIndex--; sel.dispatchEvent(new Event('change', { bubbles: true })); sync(); }
            } else if (e.key === 'Escape' || e.key === 'Tab') close();
        });
        document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
        sel.classList.add('dsel-src');
        sel.parentNode.insertBefore(wrap, sel);
        wrap.appendChild(sel);
        wrap.appendChild(btn);
        wrap.appendChild(menu);
    });

    // ---------- confirm modal ----------
    function confirmModal(msg) {
        return new Promise(function (res) {
            var bg = document.createElement('div');
            bg.className = 'modal-bg';
            bg.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><h3>Are you sure?</h3><p></p>' +
                '<div class="modal-actions"><button class="btn-sec" data-x>Cancel</button>' +
                '<button class="btn-danger" data-ok>Confirm</button></div></div>';
            bg.querySelector('p').textContent = msg;
            document.body.appendChild(bg);
            requestAnimationFrame(function () { bg.classList.add('show'); });
            function done(v) {
                bg.classList.remove('show');
                setTimeout(function () { bg.remove(); }, 180);
                res(v);
            }
            bg.querySelector('[data-x]').addEventListener('click', function () { done(false); });
            bg.querySelector('[data-ok]').addEventListener('click', function () { done(true); });
            bg.addEventListener('click', function (e) { if (e.target === bg) done(false); });
            document.addEventListener('keydown', function h(e) {
                if (e.key === 'Escape') { done(false); document.removeEventListener('keydown', h); }
            });
            bg.querySelector('[data-x]').focus();
        });
    }

    function busy(f) {
        var b = f.querySelector('button[type="submit"]');
        if (b) { b.disabled = true; b.classList.add('loading'); }
    }

    document.addEventListener('submit', function (e) {
        var f = e.target;
        if (f.dataset.go) { delete f.dataset.go; busy(f); return; }
        var msg = null;
        if (f.dataset.confirmUnchecked) {
            var turnedOff = Array.prototype.some.call(
                f.querySelectorAll('input[type="checkbox"]'),
                function (c) { return c.defaultChecked && !c.checked; }
            );
            if (turnedOff) msg = f.dataset.confirmUnchecked;
        }
        if (!msg && f.dataset.confirm) msg = f.dataset.confirm;
        if (msg) {
            e.preventDefault();
            confirmModal(msg).then(function (ok) {
                if (ok) { f.dataset.go = '1'; f.requestSubmit(); }
            });
            return;
        }
        busy(f);
    });

    // ---------- roles page: channel -> recent-messages picker ----------
    var msgSel = document.querySelector('select[data-msgs]');
    var chanSel = document.querySelector('select[data-msgsrc]');
    if (msgSel && chanSel) {
        var gid = location.pathname.split('/')[2];
        var opt = function (text, val) {
            var o = document.createElement('option');
            o.value = val || '';
            o.textContent = text;
            return o;
        };
        var loadMsgs = function () {
            msgSel.innerHTML = '';
            msgSel.appendChild(opt(chanSel.value ? 'Loading…' : '— pick a channel —'));
            msgSel.disabled = true;
            msgSel.dispatchEvent(new Event('dsel:refresh'));
            if (!chanSel.value) return;
            fetch('/dashboard/' + gid + '/messages?channel=' + encodeURIComponent(chanSel.value))
                .then(function (r) { return r.ok ? r.json() : []; })
                .then(function (list) {
                    msgSel.innerHTML = '';
                    if (!list.length) msgSel.appendChild(opt('No recent messages'));
                    list.forEach(function (m) { msgSel.appendChild(opt(m.label, m.id)); });
                    msgSel.disabled = !list.length;
                    msgSel.dispatchEvent(new Event('dsel:refresh'));
                })
                .catch(function () {
                    msgSel.innerHTML = '';
                    msgSel.appendChild(opt('Failed to load messages'));
                    msgSel.dispatchEvent(new Event('dsel:refresh'));
                });
        };
        chanSel.addEventListener('change', loadMsgs);
        if (chanSel.value) loadMsgs();
    }

    // ---------- toasts: auto-dismiss + progress ----------
    document.querySelectorAll('.toast').forEach(function (t) {
        var out = function () { t.classList.add('hide'); setTimeout(function () { t.remove(); }, 200); };
        setTimeout(out, 3000);
        var x = t.querySelector('.tx');
        if (x) x.addEventListener('click', out);
    });

    if (!reduced) {
        document.querySelectorAll('[data-count]').forEach(function (el) {
            var target = +el.dataset.count;
            if (!isFinite(target)) return;
            var t0 = performance.now();
            (function tick(t) {
                var p = Math.min(1, (t - t0) / 650);
                el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString('en-US');
                if (p < 1) requestAnimationFrame(tick);
            })(t0);
        });
    }
    document.querySelectorAll('.pv[data-src]').forEach(function (pv) {
        var src = document.querySelector('[name="' + pv.dataset.src + '"]');
        var map = { user: '@' + pv.dataset.user, username: pv.dataset.user, server: pv.dataset.guild, members: '42', level: '5' };
        var upd = function () {
            var v = (src && src.value) || '';
            for (var k in map) v = v.split('{' + k + '}').join(map[k]);
            pv.textContent = v || pv.dataset.empty || '…';
        };
        if (src) { src.addEventListener('input', upd); upd(); }
    });
})();
</script>
</body></html>`;
}

module.exports = { dashLayout, SECTIONS };
