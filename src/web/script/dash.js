/* Kotan dashboard SPA — served as a static shell, all data via /api.
   Routes: /dashboard → server picker; /dashboard/:id → guild app with
   hash sub-routes (#/overview … #/settings). Server-side guards and the
   API enforce access independently — this is presentation only. */

(function () {
    'use strict';

    // ---------- utils ----------
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const app = $('#app');

    async function api(path, opts) {
        const r = await fetch(path, opts && {
            method: opts.method || 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });
        if (r.status === 401) { location.href = `/login?next=${encodeURIComponent(location.pathname)}`; throw new Error('unauthorized'); }
        return r.json().catch(() => ({ ok: false, error: `HTTP ${r.status}` }));
    }

    function toast(msg, kind = 'ok') {
        const t = document.createElement('div');
        t.className = `toast ${kind}`;
        t.textContent = msg;
        $('#toasts').appendChild(t);
        setTimeout(() => t.remove(), 3200);
    }

    function confirmModal(title, body) {
        return new Promise((resolve) => {
            const ov = document.createElement('div');
            ov.className = 'overlay';
            ov.innerHTML = `<div class="modal"><h3>${esc(title)}</h3><p>${esc(body)}</p>
                <div class="actions"><button class="btn" data-x>Cancel</button>
                <button class="btn danger" data-ok>Confirm</button></div></div>`;
            ov.addEventListener('click', (e) => {
                if (e.target === ov || e.target.hasAttribute('data-x')) { ov.remove(); resolve(false); }
                if (e.target.hasAttribute('data-ok')) { ov.remove(); resolve(true); }
            });
            document.body.appendChild(ov);
        });
    }

    // ---------- theme ----------
    const THEME_KEY = 'kotan-theme';
    const theme = (() => { try { return JSON.parse(localStorage.getItem(THEME_KEY) || '{}'); } catch { return {}; } })();
    function applyTheme() {
        const r = document.documentElement;
        r.dataset.mode = theme.mode || ''; r.dataset.density = theme.density || ''; r.dataset.motion = theme.motion || '';
        if (theme.accent) { r.style.setProperty('--accent', theme.accent); r.style.setProperty('--accent-soft', theme.accent + '24'); }
        localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    }
    applyTheme();
    function mountThemeFab() {
        if ($('.theme-fab')) return;
        const fab = document.createElement('button');
        fab.className = 'theme-fab'; fab.title = 'Appearance'; fab.textContent = '◐';
        const panel = document.createElement('div');
        panel.className = 'theme-panel'; panel.style.display = 'none';
        panel.innerHTML = `<h4>Appearance</h4>
            <div class="row">Accent <input type="color" id="th-accent" value="${theme.accent || '#e8622e'}"></div>
            <div class="row">Mode <select id="th-mode"><option value="">Dark</option><option value="light">Light</option></select></div>
            <div class="row">Density <select id="th-density"><option value="">Comfortable</option><option value="compact">Compact</option></select></div>
            <div class="row">Motion <select id="th-motion"><option value="">On</option><option value="off">Off</option></select></div>`;
        document.body.append(fab, panel);
        panel.querySelector('#th-mode').value = theme.mode || '';
        panel.querySelector('#th-density').value = theme.density || '';
        panel.querySelector('#th-motion').value = theme.motion || '';
        fab.onclick = () => (panel.style.display = panel.style.display === 'none' ? 'block' : 'none');
        panel.onchange = () => {
            theme.accent = panel.querySelector('#th-accent').value;
            theme.mode = panel.querySelector('#th-mode').value;
            theme.density = panel.querySelector('#th-density').value;
            theme.motion = panel.querySelector('#th-motion').value;
            applyTheme();
        };
    }

    // ---------- search-select component ----------
    // options: [{value,label,icon,color}] — renders a .dsel dropdown; get()
    // returns the value (string) or array (multi).
    function dsel(opts = {}) {
        const el = document.createElement('div');
        el.className = `dsel${opts.multi ? ' multi' : ''}`;
        let values = new Set(Array.isArray(opts.value) ? opts.value.map(String) : [opts.value].filter((v) => v != null && v !== '').map(String));
        const btn = document.createElement('button');
        btn.type = 'button';
        const pop = document.createElement('div');
        pop.className = 'pop'; pop.style.display = 'none';
        el.append(btn, pop);

        const options = opts.options || [];
        const label = () => {
            if (opts.multi) return values.size ? `${values.size} selected` : (opts.placeholder || 'Select…');
            const v = [...values][0];
            const o = options.find((o) => String(o.value) === v);
            return o ? o.label : (v ? `#${v}` : (opts.placeholder || 'Select…'));
        };
        const renderBtn = () => { btn.innerHTML = `<span class="${values.size ? '' : 'ph'}">${esc(label())}</span><span class="caret">▾</span>`; };
        renderBtn();

        function renderPop(filter = '') {
            const list = options.filter((o) => o.label.toLowerCase().includes(filter));
            pop.innerHTML = (options.length > 10 ? '<div class="search"><input type="text" placeholder="Search…"></div>' : '')
                + (list.length ? list.map((o) => `
                    <div class="opt${values.has(String(o.value)) ? ' sel' : ''}" data-v="${esc(String(o.value))}">
                        ${o.icon ? `<span class="tic">${o.icon}</span>` : ''}
                        ${o.color ? `<span class="swatch" style="background:${esc(o.color)}"></span>` : ''}
                        ${esc(o.label)}</div>`).join('') : '<div class="empty">Nothing found</div>');
            const inp = $('.search input', pop);
            if (inp) { inp.focus(); inp.oninput = () => renderPop(inp.value.trim().toLowerCase()); inp.onkeydown = (e) => e.stopPropagation(); }
        }

        btn.onclick = () => {
            const open = pop.style.display !== 'none';
            $$('.dsel .pop').forEach((p) => (p.style.display = 'none'));
            pop.style.display = open ? 'none' : 'block';
            if (!open) renderPop();
        };
        pop.onclick = (e) => {
            const opt = e.target.closest('.opt');
            if (!opt) return;
            const v = opt.dataset.v;
            if (opts.multi) { values.has(v) ? values.delete(v) : values.add(v); renderPop($('.search input', pop)?.value.trim().toLowerCase() || ''); }
            else { values = new Set([v]); pop.style.display = 'none'; }
            renderBtn();
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        document.addEventListener('click', (e) => { if (!el.contains(e.target)) pop.style.display = 'none'; });

        el.get = () => (opts.multi ? [...values] : ([...values][0] || null));
        el.set = (v) => { values = new Set(Array.isArray(v) ? v.map(String) : [v].filter(Boolean).map(String)); renderBtn(); };
        el.setOptions = (o) => { options.length = 0; options.push(...o); renderBtn(); };
        return el;
    }

    // ---------- small render helpers ----------
    const fld = (label, inner, hint) => `<label class="fld"><span>${esc(label)}${hint ? ` <span class="hint">— ${esc(hint)}</span>` : ''}</span></label>`;
    // fld() leaves inner injection to callers that need real nodes; use fldText
    // for simple html inputs:
    const fldHtml = (label, inner, hint) => `<label class="fld"><span>${esc(label)}${hint ? ` <span class="hint">— ${esc(hint)}</span>` : ''}</span>${inner}</label>`;
    const tgl = (name, label, on) => `<label class="tgl"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="trk"></span><span class="lbl">${esc(label)}</span></label>`;
    const numIn = (name, v, min, max) => `<input type="number" name="${name}" value="${v ?? ''}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}>`;
    const txtIn = (name, v, ph = '') => `<input type="text" name="${name}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;
    const txtArea = (name, v) => `<textarea name="${name}">${esc(v ?? '')}</textarea>`;

    const chOpts = (channels) => channels.map((c) => ({ value: c.id, label: c.name, icon: c.type === 5 ? '📣' : '#' }));
    const roOpts = (roles) => roles.map((r) => ({ value: r.id, label: r.name, color: r.color }));

    const chName = (id) => DATA.channels.find((c) => c.id === id)?.name || id;
    const roName = (id) => DATA.roles.find((r) => r.id === id)?.name || id;

    // Mounts a .dsel into a placeholder <span data-mount="key"> inside `form`.
    const mounts = {};
    function mountSelect(form, key, opts) {
        const slot = form.querySelector(`[data-mount="${key}"]`);
        if (!slot) return null;
        const el = dsel(opts);
        slot.replaceWith(el);
        mounts[key] = el;
        return el;
    }
    const selSlot = (key) => `<span data-mount="${key}"></span>`;

    // ---------- charts (inline SVG) ----------
    function sparkline(values, color = 'var(--accent)', w = 600, h = 110) {
        if (!values?.length || values.every((v) => v == null)) return '<div class="empty-state">No data yet</div>';
        const vs = values.map((v) => v ?? 0);
        const max = Math.max(...vs, 1);
        const pts = vs.map((v, i) => [8 + (i / Math.max(vs.length - 1, 1)) * (w - 16), h - 8 - (v / max) * (h - 16)]);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">
            <path d="${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z" fill="${color}" opacity="0.1"/>
            <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/></svg>`;
    }
    function bars(rows, keys, colors) {
        if (!rows?.length) return '<div class="empty-state">No data yet</div>';
        const w = 600, h = 130, bw = Math.max(3, (w / rows.length - 4) / keys.length);
        const max = Math.max(...rows.flatMap((r) => keys.map((k) => r[k] || 0)), 1);
        let rects = '';
        rows.forEach((r, i) => keys.forEach((k, j) => {
            const v = r[k] || 0, bh = (v / max) * (h - 24);
            rects += `<rect x="${(i * (w / rows.length) + j * bw + 4).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${colors[j]}" opacity="0.85"><title>${r.date}: ${v}</title></rect>`;
        }));
        return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px">${rects}</svg>`;
    }

    // Catmull-Rom → cubic bezier spline through the points (the "pulse" look).
    function smoothPath(pts) {
        if (pts.length < 2) return `M${pts[0]?.[0] ?? 0},${pts[0]?.[1] ?? 0}`;
        let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
            d += `C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
        }
        return d;
    }

    // Multi-series smoothed area chart — each series normalized to its own
    // max so different magnitudes overlay as comparable shapes.
    function pulseChart(series, w = 900, h = 230) {
        const on = series.filter((s) => s.on && s.values?.some((v) => v));
        const grid = [0.25, 0.5, 0.75].map((f) =>
            `<line x1="0" x2="${w}" y1="${(h * f).toFixed(0)}" y2="${(h * f).toFixed(0)}" stroke="var(--border-soft)" stroke-width="1"/>`).join('');
        let defs = '', paths = '';
        on.forEach((s, si) => {
            const max = Math.max(...s.values, 1);
            const pts = s.values.map((v, i) => [10 + (i / Math.max(s.values.length - 1, 1)) * (w - 20), h - 12 - (v / max) * (h - 30)]);
            const d = smoothPath(pts);
            const gid = `pg${si}`;
            defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" style="stop-color:${s.color};stop-opacity:0.28"/>
                <stop offset="1" style="stop-color:${s.color};stop-opacity:0"/></linearGradient>`;
            if (si === 0) paths += `<path d="${d} L${pts.at(-1)[0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z" fill="url(#${gid})"/>`;
            paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"><title>${esc(s.label)}</title></path>`;
        });
        return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px"><defs>${defs}</defs>${grid}${paths || `<text x="${w / 2}" y="${h / 2}" fill="var(--muted)" font-size="13" text-anchor="middle">No data in this range yet</text>`}</svg>`;
    }

    // ---------- state ----------
    const m = location.pathname.match(/^\/dashboard(?:\/(\d+))?/);
    const guildId = m?.[1] || null;
    let CTX = null;           // {guild, settings, modules, commands}
    const DATA = { channels: [], roles: [] };
    let rangeDays = 30;       // overview range pill selection
    const pulseOn = new Set(['commands', 'joins', 'mod']);

    const fmtDelta = (cur, prev) => {
        if (!prev) return '';
        const pct = Math.round(((cur - prev) / prev) * 100);
        return `<span class="delta ${pct >= 0 ? 'up' : 'dn'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
    };

    async function save(section, fields, btn) {
        btn && (btn.disabled = true);
        const r = await api(`/api/guilds/${guildId}/settings`, { body: { section, fields } });
        btn && (btn.disabled = false);
        if (r.ok) { CTX.settings = r.settings; toast('Saved'); }
        else toast(r.error || 'Save failed', 'err');
        return r.ok;
    }

    const timeAgo = (ts) => {
        const s = Math.floor((Date.now() - ts) / 1000);
        if (s < 60) return `${s}s ago`;
        if (s < 3600) return `${Math.floor(s / 60)}m ago`;
        if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
        return `${Math.floor(s / 86400)}d ago`;
    };

    // ---------- PICKER (/dashboard) ----------
    async function renderPicker() {
        app.className = 'dmain';
        app.innerHTML = `<div class="pkwrap">
            <div class="pk-head">
                <div><h1 class="pk-title">Your servers</h1>
                <p class="pk-sub">Servers where you have Manage Server and Kotan is installed.</p></div>
                <input class="pk-search" id="srvq" type="search" placeholder="Search servers…">
            </div>
            <div class="pk-label">Manageable <span class="pkcount" id="srvn"></span></div>
            <div class="srvgrid" id="srvs"><div class="skeleton" style="height:180px"></div></div>
        </div>`;
        mountThemeFab();
        const [g, me, dev] = await Promise.all([api('/api/guilds'), api('/api/me'), api('/api/meta/devtools')]);
        if (g.ok === false) return;
        const grid = $('#srvs');
        const list = g.guilds || [];
        const card = (s) => {
            const icon = s.icon ? `https://cdn.discordapp.com/icons/${s.id}/${s.icon}.png?size=128` : '';
            return `<a class="srv" href="/dashboard/${s.id}" data-name="${esc(s.name.toLowerCase())}">
                ${icon ? `<div class="srvbg" style="background-image:url('${icon}')"></div>` : ''}
                ${icon ? `<img src="${icon}" alt="">` : `<span class="noicon">${esc(s.name[0])}</span>`}
                <b>${esc(s.name)}</b>
                <span class="srvbadge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3z"/></svg>${s.owner ? 'Owner' : 'Manager'}</span>
                <span class="srvbtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M2.5 12h3M18.5 12h3M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2"/></svg>Manage</span>
            </a>`;
        };
        grid.innerHTML = (list.length ? list.map(card).join('') : '<div class="empty-state"><div class="big">🛰️</div>No manageable servers with Kotan found.</div>')
            + (dev?.developer ? `<a class="srv dev" href="/dashboard/admin/blacklist" data-name="developer"><span class="noicon">🛠</span><b>Developer</b><span class="srvbadge">Guild blacklist</span><span class="srvbtn">Open</span></a>` : '');
        const cards = $$('.srv', grid);
        const count = $('#srvn');
        const apply = (q) => {
            let n = 0;
            cards.forEach((c) => { const show = c.dataset.name.includes(q); c.style.display = show ? '' : 'none'; n += show; });
            count.textContent = n;
        };
        apply('');
        $('#srvq').oninput = (e) => apply(e.target.value.trim().toLowerCase());
    }

    // ---------- GUILD APP ----------
    const svg = (inner) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    const NAV = [
        { group: 'General', items: [
            ['overview', svg('<path d="M3 12h4l2.5-7 4 14 2.5-7H21"/>'), 'Overview'],
            ['modules', svg('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'), 'Modules'],
            ['commands', svg('<path d="M5 7l4 4-4 4"/><path d="M12 17h7"/><rect x="3" y="4" width="18" height="16" rx="2"/>'), 'Commands'],
            ['custom-commands', svg('<path d="M17 3l4 4L8 20l-5 1 1-5L17 3z"/>'), 'Custom Commands'],
        ] },
        { group: 'Safety', items: [
            ['automod', svg('<path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>'), 'Automod'],
            ['mod-log', svg('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9.5 12h6M9.5 16h6M9.5 8h2"/>'), 'Mod Log'],
        ] },
        { group: 'Engagement', items: [
            ['logging', svg('<path d="M4 5h16M4 12h16M4 19h10"/>'), 'Logging'],
            ['welcome', svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>'), 'Welcome'],
            ['roles', svg('<path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/>'), 'Roles'],
        ] },
        { group: '', items: [
            ['settings', svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M2.5 12h3M18.5 12h3M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2"/>'), 'Settings'],
        ] },
    ];

    function shell(activeSlug) {
        const g = CTX.guild;
        const icon = g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64" alt="">` : `<span class="gnoicon">${esc(g.name[0])}</span>`;
        const av = CTX.user.avatar ? `<img src="https://cdn.discordapp.com/avatars/${CTX.user.id}/${CTX.user.avatar}.png?size=64" alt="">` : '';
        const label = NAV.flatMap((x) => x.items).find(([slug]) => slug === activeSlug)?.[2] || 'Overview';
        const nav = NAV.map((grp) => `<div class="dnav-group">${grp.group ? `<span>${grp.group}</span>` : ''}${grp.items.map(([slug, ic, lab]) =>
            `<a href="#/${slug}" class="${slug === activeSlug ? 'active' : ''}"><span class="ic">${ic}</span>${lab}</a>`).join('')}</div>`).join('');
        app.className = '';
        app.innerHTML = `<div class="dwrap">
            <aside class="dside" id="dside">
                <a class="nav-logo" href="/">Kotan</a>
                <a class="gsel" href="/dashboard" title="Switch server">${icon}<span class="gsel-t"><b>${esc(g.name)}</b><span>Switch server</span></span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></a>
                <nav class="dnav">${nav}</nav>
                <div class="duser">
                    ${av}<div class="du"><b>${esc(CTX.user.username)}</b><span>@${esc(CTX.user.username)}</span></div>
                    <a class="icobtn" href="/auth/logout" title="Sign out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></a>
                </div>
            </aside>
            <div class="dmain">
                <div class="dtop">
                    <button class="burger" id="burger">☰</button>
                    <div class="crumb"><a href="/dashboard">Servers</a><span>›</span>${esc(g.name)}<span>›</span><b>${esc(label)}</b></div>
                </div>
                <div class="dcontent"><div id="page" class="dpage"></div></div>
            </div>
        </div>`;
        $('#burger').onclick = () => $('#dside').classList.toggle('open');
        mountThemeFab();
    }

    const saveBar = (section) => `<div class="flex mt"><button class="btn primary" data-save="${section}">Save changes</button></div>`;

    function bindSave(container, section, collect) {
        container.querySelector(`[data-save="${section}"]`)?.addEventListener('click', async (e) => {
            for (const k in mounts) delete mounts[k];
            const fields = collect(container);
            await save(section, fields, e.target);
        });
    }

    const formVals = (el) => {
        const f = new FormData();
        $$('input[name],textarea[name],select[name]', el).forEach((i) => {
            if (i.type === 'checkbox') f.append(i.name, i.checked ? 'true' : '');
            else if (i.type !== 'radio' || i.checked) f.append(i.name, i.value);
        });
        const o = {};
        for (const [k, v] of f) o[k] === undefined ? (o[k] = v) : (Array.isArray(o[k]) ? o[k].push(v) : (o[k] = [o[k], v]));
        return o;
    };

    // ---------- pages ----------
    const PAGES = {
        async overview(page) {
            const s = CTX.settings;
            const stats = await api(`/api/guilds/${guildId}/stats?days=${rangeDays}`);
            const hr = new Date().getHours();
            const greet = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';
            const av = CTX.user.avatar
                ? `<img class="ov-av" src="https://cdn.discordapp.com/avatars/${CTX.user.id}/${CTX.user.avatar}.png?size=64" alt="">` : '';

            const delta = (cur, prev) => fmtDelta(cur ?? 0, prev ?? 0);
            const modDays = stats.mod?.days || [];
            const joins = (stats.growth?.series || []).map((v, i, a) => Math.max(0, (v || 0) - (i ? (a[i - 1] || v || 0) : v || 0)));

            const CARDS = {
                commands: { label: 'Commands run', color: 'var(--chart)',
                    icon: svg('<path d="M5 7l4 4-4 4"/><path d="M12 17h7"/><rect x="3" y="4" width="18" height="16" rx="2"/>'),
                    val: stats.usage?.total ?? 0, series: (stats.usage?.series || []).map((d) => d.count),
                    delta: delta(stats.usage?.week, stats.usage?.prevWeek) },
                members: { label: 'Members', color: 'var(--ok)',
                    icon: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><path d="M16 8.5a3 3 0 1 1 0-.01"/><path d="M17.5 14.6c1.9.6 3.2 1.9 3.6 3.9"/>'),
                    val: CTX.guild.memberCount, series: stats.growth?.series || [],
                    delta: stats.growth?.pct != null ? `<span class="delta ${stats.growth.pct >= 0 ? 'up' : 'dn'}">${stats.growth.pct >= 0 ? '▲' : '▼'} ${Math.abs(stats.growth.pct)}%</span>` : '' },
                warns: { label: 'Warns', color: 'var(--warn)',
                    icon: svg('<path d="M12 4L2.5 20h19L12 4z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>'),
                    val: stats.mod?.warnsTotal ?? 0, series: modDays.map((d) => d.warns || 0),
                    delta: delta(stats.mod?.warnsWeek, stats.mod?.warnsPrevWeek) },
                tempbans: { label: 'Tempbans', color: 'var(--danger)',
                    icon: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
                    val: stats.mod?.tempbansTotal ?? 0, series: modDays.map((d) => d.tempbans || 0),
                    delta: delta(stats.mod?.tempbansWeek, stats.mod?.tempbansPrevWeek) },
            };
            const cards = (s.overview.cards?.length ? s.overview.cards : Object.keys(CARDS));

            const PULSE = [
                { key: 'commands', label: 'Commands', color: 'var(--chart)', values: (stats.usage?.series || []).map((d) => d.count) },
                { key: 'joins', label: 'Member joins', color: 'var(--ok)', values: joins },
                { key: 'mod', label: 'Mod actions', color: 'var(--warn)', values: modDays.map((d) => (d.warns || 0) + (d.tempbans || 0)) },
            ];
            PULSE.forEach((s) => (s.on = pulseOn.has(s.key)));

            page.innerHTML = `
                <div class="ov-head">
                    <div class="ov-hi">${av}<div><h1>Good ${greet}, ${esc(CTX.user.username)}</h1>
                    <p>Here's how <b>${esc(CTX.guild.name)}</b> has been doing over the last ${rangeDays} days.</p></div></div>
                    <div class="rpills">${[7, 30, 45].map((d) => `<button class="rpill${d === rangeDays ? ' on' : ''}" data-d="${d}">${d}d</button>`).join('')}</div>
                </div>
                <div class="statrow">${cards.map((c) => CARDS[c]).filter(Boolean).map((d) => `
                    <div class="stat2">
                        <div class="s2h"><span class="s2i">${d.icon}</span>${d.label}${d.delta || ''}</div>
                        <b>${(d.val ?? 0).toLocaleString()}</b>
                        <div class="s2s">${sparkline(d.series, d.color, 400, 60)}</div>
                    </div>`).join('')}</div>
                <div class="card">
                    <div class="ph"><h3>Server pulse</h3><div class="legend" id="plg">${PULSE.map((s) =>
                        `<button class="lpill${s.on ? ' on' : ''}" data-k="${s.key}"><i style="background:${s.color}"></i>${s.label}</button>`).join('')}</div></div>
                    <p class="muted small mb">Activity per day, last ${rangeDays} days — legend toggles each series</p>
                    <div id="pulse">${pulseChart(PULSE)}</div>
                </div>
                <div class="trio">
                    <div class="card"><h3>Top commands</h3>${(stats.usage?.top || []).length ? stats.usage.top.map(([n, c]) => `<div class="qitem"><span class="grow mono">${esc(n)}</span><span class="chip">${c}</span></div>`).join('') : '<p class="muted small">No commands run yet.</p>'}</div>
                    <div class="card"><h3>Recent activity</h3>${(stats.recent || []).length ? stats.recent.map((r) => `<div class="qitem"><span class="chip ${r.type === 'warn' ? 'warn' : 'danger'}">${r.type}</span><span class="grow muted">on <span class="mono">${r.userId}</span> — ${esc(r.reason || 'no reason')}</span><span class="muted small">${timeAgo(r.at)}</span></div>`).join('') : '<p class="muted small">No recent moderation actions.</p>'}</div>
                    <div class="card"><h3>Settings audit</h3>${(stats.audit || []).length ? stats.audit.map((a) => `<div class="qitem"><span class="grow"><b>${esc(a.section)}</b> <span class="muted">edited by</span> <span class="mono">${a.userId}</span></span><span class="muted small">${timeAgo(a.at)}</span></div>`).join('') : '<p class="muted small">No changes recorded yet.</p>'}</div>
                </div>`;

            $$('.rpill', page).forEach((b) => (b.onclick = () => { rangeDays = +b.dataset.d; PAGES.overview(page); }));
            $$('#plg .lpill', page).forEach((b) => (b.onclick = () => {
                const k = b.dataset.k;
                pulseOn.has(k) && PULSE.filter((s) => s.on).length > 1 ? pulseOn.delete(k) : pulseOn.add(k);
                const s = PULSE.find((x) => x.key === k);
                s.on = pulseOn.has(k);
                b.classList.toggle('on', s.on);
                $('#pulse', page).innerHTML = pulseChart(PULSE);
            }));
        },

        async modules(page) {
            const s = CTX.settings;
            const modIds = CTX.modules.map((m) => m.id);
            const cmdCount = (id) => CTX.commands.filter((c) => c.module === id).length;
            page.innerHTML = `
                <div><div class="page-title">Modules</div><p class="page-desc">Enable or disable whole command categories, and restrict them to roles.</p></div>
                <div class="card"><h3>Command modules</h3><div id="modlist">${CTX.modules.map((m) => `
                    <div class="modrow"><div class="mi"><b>${esc(m.label)}</b> <code>${cmdCount(m.id)} cmd${cmdCount(m.id) === 1 ? '' : 's'}</code><p>${esc(m.description)}</p></div>
                    ${tgl(`mod_${m.id}`, s.modules[m.id] === false ? 'Disabled' : 'Enabled', s.modules[m.id] !== false)}</div>`).join('')}</div></div>
                <div class="card"><h3>Role gates</h3><p class="sub mb">Restrict a module to members holding specific roles. Empty = everyone.</p>
                    <div id="rolegates">${CTX.modules.map((m) => `<div class="modrow"><div class="mi"><b>${esc(m.label)}</b></div><div style="min-width:240px;flex:0 0 280px">${selSlot(`rg_${m.id}`)}</div></div>`).join('')}</div></div>
                ${saveBar('modules')}`;
            CTX.modules.forEach((m) => mountSelect(page, `rg_${m.id}`, { multi: true, options: roOpts(DATA.roles), value: s.moduleRoles[m.id] || [], placeholder: 'Everyone' }));
            bindSave(page, 'modules', (el) => {
                const f = formVals(el);
                const modules = {}; modIds.forEach((id) => (modules[id] = !!f[`mod_${id}`]));
                const moduleRoles = {}; CTX.modules.forEach((m) => (moduleRoles[m.id] = mounts[`rg_${m.id}`].get()));
                return { modules, moduleRoles };
            });
        },

        async commands(page) {
            const s = CTX.settings;
            const rules = s.commandRules || [];
            page.innerHTML = `
                <div><div class="page-title">Commands</div><p class="page-desc">Toggle individual commands, or scope them by channel/time window.</p></div>
                <div class="card"><h3>Enabled commands</h3><div class="cmd-grid" style="grid-template-columns:1fr">${CTX.commands.map((c) => `
                    <div class="modrow"><div class="mi"><b>${esc(c.name)}</b> <code>${esc(c.module)}</code><p>${esc(c.description)}</p></div>
                    ${tgl(`cmd_${c.name}`, '', !(s.disabledCommands || []).includes(c.name))}</div>`).join('')}</div></div>
                <div class="card"><h3>Scoped rules</h3><p class="sub mb">Block a command in a channel and/or during a daily time window (HH:MM, server local time).</p>
                    <div id="rules"></div>
                    <button class="btn sm mt" id="add-rule">+ Add rule</button></div>
                ${saveBar('commands')}`;

            const cmdOpts = CTX.commands.map((c) => ({ value: c.name, label: c.name }));
            const rulesEl = $('#rules', page);
            const renderRules = () => {
                rulesEl.innerHTML = rules.map((r, i) => `
                    <div class="modrow" data-i="${i}">
                        <div style="flex:0 0 160px">${selSlot(`rc_${i}`)}</div>
                        <div style="flex:0 0 180px">${selSlot(`rch_${i}`)}</div>
                        <input type="time" name="rs_${i}" value="${r.start || ''}" style="flex:0 0 110px" title="Start (HH:MM)">
                        <input type="time" name="re_${i}" value="${r.end || ''}" style="flex:0 0 110px" title="End (HH:MM)">
                        <button class="btn sm danger right" data-del="${i}">✕</button>
                    </div>`).join('') || '<p class="muted small">No scoped rules.</p>';
                rules.forEach((r, i) => {
                    mountSelect(page, `rc_${i}`, { options: cmdOpts, value: r.command, placeholder: 'Command…' });
                    mountSelect(page, `rch_${i}`, { options: [{ value: '', label: 'Any channel' }, ...chOpts(DATA.channels)], value: r.channelId || '', placeholder: 'Any channel' });
                });
                $$('#rules [data-del]', page).forEach((b) => (b.onclick = () => {
                    const i = +b.dataset.del;
                    rules.splice(i, 1); renderRules();
                }));
            };
            renderRules();
            $('#add-rule', page).onclick = () => { rules.push({ command: '', channelId: '', start: '', end: '' }); renderRules(); };

            bindSave(page, 'commands', (el) => {
                const f = formVals(el);
                return {
                    disabledCommands: CTX.commands.filter((c) => !f[`cmd_${c.name}`]).map((c) => c.name),
                    commandRules: rules.map((r, i) => ({
                        command: mounts[`rc_${i}`]?.get() || '',
                        channelId: mounts[`rch_${i}`]?.get() || null,
                        start: f[`rs_${i}`] || null,
                        end: f[`re_${i}`] || null,
                    })).filter((r) => r.command),
                };
            });
        },

        async 'custom-commands'(page) {
            page.innerHTML = `
                <div><div class="page-title">Custom Commands</div><p class="page-desc">Tags — text responses triggered like normal commands.</p></div>
                <div class="card"><h3>New tag</h3>
                    <div class="grid2">${fldHtml('Name', txtIn('tname', '', 'e.g. rules'), 'a-z 0-9 _ -, max 32')}${fldHtml('Content', txtIn('tcontent', '', 'Response text…'), 'max 1000 chars')}</div>
                    <button class="btn primary sm" id="add-tag">Create tag</button></div>
                <div class="card"><h3>Tags</h3><div id="taglist"><div class="skeleton" style="height:60px"></div></div></div>`;
            const load = async () => {
                const d = await api(`/api/guilds/${guildId}/tags`);
                const tags = Object.entries(d.tags || {});
                $('#taglist', page).innerHTML = tags.length ? tags.map(([n, t]) => `
                    <div class="qitem"><div class="grow"><b class="mono">${esc(n)}</b><div class="muted">${esc(String(t.content).slice(0, 90))}</div></div>
                    <span class="chip">${t.uses || 0} uses</span><button class="btn sm danger" data-del="${esc(n)}">Delete</button></div>`).join('')
                    : '<p class="muted small">No tags yet.</p>';
                $$('#taglist [data-del]', page).forEach((b) => (b.onclick = async () => {
                    if (!(await confirmModal('Delete tag', `Remove "${b.dataset.del}"?`))) return;
                    const r = await api(`/api/guilds/${guildId}/tags/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
                    r.ok ? (toast('Tag deleted'), load()) : toast('Delete failed', 'err');
                }));
            };
            $('#add-tag', page).onclick = async () => {
                const name = $('[name=tname]', page).value.trim();
                const content = $('[name=tcontent]', page).value;
                const r = await api(`/api/guilds/${guildId}/tags`, { body: { name, content } });
                if (r.ok) { toast('Tag created'); $('[name=tname]', page).value = ''; $('[name=tcontent]', page).value = ''; load(); }
                else toast(r.error || 'Failed', 'err');
            };
            load();
        },

        async automod(page) {
            const a = CTX.settings.automod;
            page.innerHTML = `
                <div><div class="page-title">Automod</div><p class="page-desc">Automatic filtering and rate protection.</p></div>
                <div class="card"><h3>Filters</h3>
                    <div class="mb">${tgl('antiInvite', 'Delete Discord invite links', a.antiInvite)}</div>
                    ${fldHtml('Word blacklist', txtArea('blacklist', (a.blacklist || []).join('\n')), 'one per line — messages containing any are deleted')}
                </div>
                <div class="card"><h3>Anti-spam</h3><div class="grid2">
                    ${fldHtml('Max messages', numIn('spamMax', a.spamMax, 0, 50), 'per window; 0 = off')}
                    ${fldHtml('Window (seconds)', numIn('spamWindow', a.spamWindow, 2, 60))}
                </div></div>
                <div class="card"><h3>Raid protection</h3><div class="grid2">
                    ${fldHtml('Join threshold', numIn('raidMax', a.raidMax, 0, 100), 'joins per window; 0 = off')}
                    ${fldHtml('Window (seconds)', numIn('raidWindow', a.raidWindow, 2, 120))}
                </div>${fldHtml('Action', `<select name="raidAction"><option value="alert" ${a.raidAction === 'alert' ? 'selected' : ''}>Alert mod-log</option><option value="kick" ${a.raidAction === 'kick' ? 'selected' : ''}>Kick joiner</option></select>`)}
                </div>
                ${saveBar('automod')}`;
            bindSave(page, 'automod', (el) => {
                const f = formVals(el);
                return {
                    antiInvite: !!f.antiInvite,
                    blacklist: String(f.blacklist || '').split('\n').map((w) => w.trim()).filter(Boolean),
                    spamMax: +f.spamMax || 0, spamWindow: +f.spamWindow || 5,
                    raidMax: +f.raidMax || 0, raidWindow: +f.raidWindow || 10, raidAction: f.raidAction || 'alert',
                };
            });
        },

        async 'mod-log'(page) {
            const s = CTX.settings;
            const stats = await api(`/api/guilds/${guildId}/stats`);
            page.innerHTML = `
                <div><div class="page-title">Mod Log</div><p class="page-desc">Where moderation actions are announced, plus recent activity.</p></div>
                <div class="card"><h3>Mod-log channel</h3>${fldHtml('Channel', selSlot('modlog'), 'warns, bans and automod alerts post here')}
                ${saveBar('modlog')}</div>
                <div class="card"><h3>Moderation activity — 14d</h3>${bars(stats.mod?.days || [], ['warns', 'tempbans'], ['var(--warn)', 'var(--danger)'])}
                    <p class="hint mt">Yellow = warns · Red = tempbans</p></div>`;
            mountSelect(page, 'modlog', { options: [{ value: '', label: 'Disabled' }, ...chOpts(DATA.channels)], value: s.modlogChannel || '', placeholder: 'Disabled' });
            bindSave(page, 'modlog', () => ({ modlogChannel: mounts.modlog.get() || null }));
        },

        async logging(page) {
            const l = CTX.settings.logging;
            page.innerHTML = `
                <div><div class="page-title">Logging</div><p class="page-desc">Event log channel and which events to record.</p></div>
                <div class="card"><h3>Log channel</h3>${fldHtml('Channel', selSlot('logch'), 'empty = logging off')}</div>
                <div class="card"><h3>Events</h3><div class="grid2">
                    ${tgl('messageDelete', 'Message deletions', l.messageDelete)}
                    ${tgl('messageEdit', 'Message edits', l.messageEdit)}
                    ${tgl('joinLeave', 'Member joins & leaves', l.joinLeave)}
                    ${tgl('channelEvents', 'Channel create/delete', l.channelEvents)}
                </div></div>
                ${saveBar('logging')}`;
            mountSelect(page, 'logch', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: l.channel || '', placeholder: 'Off' });
            bindSave(page, 'logging', (el) => {
                const f = formVals(el);
                return { channel: mounts.logch.get() || null, messageDelete: !!f.messageDelete, messageEdit: !!f.messageEdit, joinLeave: !!f.joinLeave, channelEvents: !!f.channelEvents };
            });
        },

        async welcome(page) {
            const w = CTX.settings.welcome;
            page.innerHTML = `
                <div><div class="page-title">Welcome &amp; Goodbye</div><p class="page-desc">Greet new members and note departures. Placeholders: <code class="mono">{user}</code> <code class="mono">{username}</code> <code class="mono">{server}</code> <code class="mono">{members}</code></p></div>
                <div class="card"><h3>Welcome</h3>
                    ${fldHtml('Channel', selSlot('wch'), 'empty = off')}
                    ${fldHtml('Message', txtArea('wmsg', w.message))}
                    <div class="preview" id="wprev"></div></div>
                <div class="card"><h3>Goodbye</h3>
                    ${fldHtml('Channel', selSlot('gch'), 'empty = off')}
                    ${fldHtml('Message', txtArea('gmsg', w.goodbyeMessage))}
                    <div class="preview" id="gprev"></div></div>
                ${saveBar('welcome')}`;
            mountSelect(page, 'wch', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: w.channel || '', placeholder: 'Off' });
            mountSelect(page, 'gch', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: w.goodbyeChannel || '', placeholder: 'Off' });
            const fill = (tpl) => esc(tpl).replaceAll('{user}', `<span class="puser">@${esc(CTX.user.username)}</span>`).replaceAll('{username}', esc(CTX.user.username)).replaceAll('{server}', esc(CTX.guild.name)).replaceAll('{members}', String(CTX.guild.memberCount));
            const upd = () => { $('#wprev', page).innerHTML = fill($('[name=wmsg]', page).value); $('#gprev', page).innerHTML = fill($('[name=gmsg]', page).value); };
            $$('[name=wmsg],[name=gmsg]', page).forEach((t) => (t.oninput = upd)); upd();
            bindSave(page, 'welcome', (el) => {
                const f = formVals(el);
                return { channel: mounts.wch.get() || null, goodbyeChannel: mounts.gch.get() || null, message: f.wmsg, goodbyeMessage: f.gmsg };
            });
        },

        async roles(page) {
            const r = CTX.settings.roles;
            const rrs = [...(r.reactionRoles || [])];
            page.innerHTML = `
                <div><div class="page-title">Roles</div><p class="page-desc">Automatic and reaction-based role assignment.</p></div>
                <div class="card"><h3>Autorole</h3>${fldHtml('Role granted on join', selSlot('autorole'), 'empty = off')}</div>
                <div class="card"><h3>Reaction roles</h3><p class="sub mb">Members who react with the emoji get the role.</p>
                    <div id="rrs"></div><button class="btn sm mt" id="add-rr">+ Add reaction role</button></div>
                ${saveBar('roles')}`;
            mountSelect(page, 'autorole', { options: [{ value: '', label: 'Off' }, ...roOpts(DATA.roles)], value: r.autorole || '', placeholder: 'Off' });

            const rrEl = $('#rrs', page);
            const renderRrs = () => {
                rrEl.innerHTML = rrs.map((x, i) => `
                    <div class="modrow" data-i="${i}">
                        <div style="flex:0 0 170px">${selSlot(`rrc_${i}`)}</div>
                        <div style="flex:0 0 190px">${selSlot(`rrm_${i}`)}</div>
                        <input type="text" name="rre_${i}" value="${esc(x.emoji || '')}" placeholder="emoji" style="flex:0 0 90px">
                        <div style="flex:0 0 170px">${selSlot(`rrr_${i}`)}</div>
                        <button class="btn sm danger right" data-del="${i}">✕</button>
                    </div>`).join('') || '<p class="muted small">No reaction roles.</p>';
                rrs.forEach((x, i) => {
                    const ch = mountSelect(page, `rrc_${i}`, { options: chOpts(DATA.channels), value: x.channelId, placeholder: 'Channel…' });
                    const ms = mountSelect(page, `rrm_${i}`, { options: [{ value: x.messageId || '', label: x.messageId ? `…${String(x.messageId).slice(-6)}` : 'Pick channel first' }], value: x.messageId, placeholder: 'Message…' });
                    mountSelect(page, `rrr_${i}`, { options: roOpts(DATA.roles), value: x.roleId, placeholder: 'Role…' });
                    ch.addEventListener('change', async () => {
                        const cid = ch.get();
                        if (!cid) return;
                        ms.setOptions([{ value: '', label: 'Loading…' }]);
                        const d = await api(`/api/guilds/${guildId}/messages?channel=${cid}`);
                        ms.setOptions(d.messages?.length
                            ? d.messages.map((mm) => ({ value: mm.id, label: `${mm.author}: ${mm.preview}` }))
                            : [{ value: '', label: d.error || 'No messages' }]);
                    });
                });
                $$('#rrs [data-del]', page).forEach((b) => (b.onclick = () => { rrs.splice(+b.dataset.del, 1); renderRrs(); }));
            };
            renderRrs();
            $('#add-rr', page).onclick = () => { rrs.push({ channelId: '', messageId: '', emoji: '', roleId: '' }); renderRrs(); };

            bindSave(page, 'roles', (el) => {
                const f = formVals(el);
                return {
                    autorole: mounts.autorole.get() || null,
                    reactionRoles: rrs.map((x, i) => ({
                        channelId: mounts[`rrc_${i}`]?.get(), messageId: mounts[`rrm_${i}`]?.get(),
                        emoji: f[`rre_${i}`], roleId: mounts[`rrr_${i}`]?.get(),
                    })),
                };
            });
        },

        async settings(page) {
            const s = CTX.settings;
            const rewards = [...(s.leveling.rewards || [])];
            const overviewCards = ['members', 'commands', 'warns', 'tempbans'];
            page.innerHTML = `
                <div><div class="page-title">Settings</div><p class="page-desc">Prefix, economy, leveling and dashboard access.</p></div>
                <div class="card"><h3>General</h3>${fldHtml('Command prefix', txtIn('prefix', s.prefix || ''), 'empty = default')} ${saveBar('general')}</div>
                <div class="card"><h3>Economy</h3><div class="grid2">
                    ${fldHtml('Currency name', txtIn('currency', s.economy.currency || ''), 'empty = default')}
                    ${fldHtml('Daily base reward', numIn('dailyBase', s.economy.dailyBase, 0, 1000000), 'empty = default')}
                </div>${saveBar('economy')}</div>
                <div class="card"><h3>Leveling</h3>
                    <div class="mb">${tgl('lv_on', 'Enable XP/levels', s.leveling.enabled)} ${tgl('lv_announce', 'Announce level-ups', s.leveling.announce)}</div>
                    <div class="grid2">
                        ${fldHtml('XP min / message', numIn('xpMin', s.leveling.xpMin, 1, 1000))}
                        ${fldHtml('XP max / message', numIn('xpMax', s.leveling.xpMax, 1, 1000))}
                        ${fldHtml('Cooldown (s)', numIn('cooldown', s.leveling.cooldown, 0, 3600))}
                        ${fldHtml('Multiplier', numIn('multiplier', s.leveling.multiplier, 0, 10))}
                    </div>
                    ${fldHtml('Level-up channel', selSlot('lvch'), 'empty = the channel they leveled in')}
                    ${fldHtml('Level-up message', txtIn('lvmsg', s.leveling.message), '{user} {level}')}
                    <h4 class="mt mb">Level rewards</h4><div id="rewards"></div>
                    <button class="btn sm mt" id="add-rw">+ Add reward</button>
                    ${saveBar('leveling')}</div>
                <div class="card"><h3>Access roles</h3><p class="sub mb">Mod/admin role lists stored with this guild's config.</p>
                    <div class="grid2">
                        ${fldHtml('Mod roles', selSlot('modroles'))}
                        ${fldHtml('Admin roles', selSlot('adminroles'))}
                    </div>${saveBar('access')}</div>
                <div class="card"><h3>Overview cards</h3><p class="sub mb">Which stats show on the Overview page.</p>
                    <div class="flex">${overviewCards.map((c) => tgl(`oc_${c}`, c, (s.overview.cards || []).includes(c))).join('')}</div>
                    ${saveBar('overview')}</div>`;

            mountSelect(page, 'lvch', { options: [{ value: '', label: 'Same channel' }, ...chOpts(DATA.channels)], value: s.leveling.channel || '', placeholder: 'Same channel' });
            mountSelect(page, 'modroles', { multi: true, options: roOpts(DATA.roles), value: s.access.modRoles, placeholder: 'None' });
            mountSelect(page, 'adminroles', { multi: true, options: roOpts(DATA.roles), value: s.access.adminRoles, placeholder: 'None' });

            const rwEl = $('#rewards', page);
            const renderRw = () => {
                rwEl.innerHTML = rewards.map((x, i) => `
                    <div class="modrow"><span class="muted small">Level</span>
                    <input type="number" name="rl_${i}" value="${x.level || ''}" min="1" style="flex:0 0 80px">
                    <div class="grow">${selSlot(`rlr_${i}`)}</div>
                    <button class="btn sm danger" data-del="${i}">✕</button></div>`).join('') || '<p class="muted small">No rewards.</p>';
                rewards.forEach((x, i) => mountSelect(page, `rlr_${i}`, { options: roOpts(DATA.roles), value: x.roleId, placeholder: 'Role…' }));
                $$('#rewards [data-del]', page).forEach((b) => (b.onclick = () => { rewards.splice(+b.dataset.del, 1); renderRw(); }));
            };
            renderRw();
            $('#add-rw', page).onclick = () => { rewards.push({ level: '', roleId: '' }); renderRw(); };

            bindSave(page, 'general', (el) => ({ prefix: formVals(el).prefix }));
            bindSave(page, 'economy', (el) => { const f = formVals(el); return { currency: f.currency, dailyBase: f.dailyBase }; });
            bindSave(page, 'leveling', (el) => {
                const f = formVals(el);
                return {
                    enabled: !!f.lv_on, announce: !!f.lv_announce,
                    xpMin: +f.xpMin || 15, xpMax: +f.xpMax || 25, cooldown: +f.cooldown || 60, multiplier: +f.multiplier || 1,
                    channel: mounts.lvch.get() || null, message: f.lvmsg,
                    rewards: rewards.map((x, i) => ({ level: +f[`rl_${i}`] || 0, roleId: mounts[`rlr_${i}`]?.get() })),
                };
            });
            bindSave(page, 'access', () => ({ modRoles: mounts.modroles.get(), adminRoles: mounts.adminroles.get() }));
            bindSave(page, 'overview', (el) => {
                const f = formVals(el);
                return { cards: overviewCards.filter((c) => f[`oc_${c}`]) };
            });
        },
    };

    const router = async () => {
        const slug = (location.hash.replace(/^#\/?/, '') || 'overview').split('?')[0];
        if (!CTX) {
            const [ctx, me] = await Promise.all([api(`/api/guilds/${guildId}`), api('/api/me')]);
            if (ctx.ok === false) {
                app.className = 'dmain';
                app.innerHTML = `<div class="center-page"><div class="card login-card"><h1>${ctx.error === 'restricted' ? 'Access restricted' : 'Unavailable'}</h1><p>${esc(ctx.error === 'restricted' ? 'This server has been restricted by Kotan\'s developers.' : ctx.error || 'Could not load this server.')}</p><a class="btn" href="/dashboard">Back</a></div></div>`;
                return;
            }
            CTX = { ...ctx, user: me.user };
            const [ch, ro] = await Promise.all([api(`/api/guilds/${guildId}/channels`), api(`/api/guilds/${guildId}/roles`)]);
            DATA.channels = ch.channels || [];
            DATA.roles = ro.roles || [];
        }
        shell(slug);
        const page = $('#page');
        const render = PAGES[slug] || PAGES.overview;
        try { await render(page); } catch (e) {
            page.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="sub">${esc(e.message)}</p></div>`;
        }
    };

    // ---------- boot ----------
    if (!guildId) renderPicker();
    else { addEventListener('hashchange', router); router(); }
})();
