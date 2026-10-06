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
            <div class="row">Accent <input type="color" id="th-accent" value="${/^#[0-9a-f]{3,8}$/i.test(theme.accent || '') ? theme.accent : '#e8622e'}"></div>
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
        pop.className = `pop${opts.multi ? ' multi' : ''}`; pop.style.display = 'none';
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
            if (inp) { inp.focus({ preventScroll: true }); inp.oninput = () => renderPop(inp.value.trim().toLowerCase()); inp.onkeydown = (e) => e.stopPropagation(); }
        }

        const closePop = () => { pop.style.display = 'none'; };
        btn.onclick = () => {
            const open = pop.style.display !== 'none';
            $$('.dselpop').forEach((p) => (p.style.display = 'none'));
            pop.style.display = open ? 'none' : 'block';
            if (!open) {
                // portal to <body> — ancestor backdrop-filter/transform creates a
                // containing block that would break position:fixed anchoring
                if (pop.parentElement !== document.body) document.body.appendChild(pop);
                pop.classList.add('dselpop');
                renderPop(); // fill first so offsetHeight measures real content
                const r = btn.getBoundingClientRect();
                const w = Math.min(r.width, innerWidth - 16);
                pop.style.width = `${w}px`;
                pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
                // Fit inside the viewport — the pop is fixed, so it can't ride
                // a page scroll; options must be reachable where it opens.
                // Open downward unless the full list won't fit and there's
                // more room above, then flip up.
                const below = innerHeight - r.bottom - 8;
                const above = r.top - 8;
                const cap = Math.min(260, innerHeight - 16);
                if (below < Math.min(pop.offsetHeight, cap) && above > below) {
                    pop.style.maxHeight = `${Math.min(cap, above)}px`;
                    pop.style.top = `${Math.max(8, r.top - pop.offsetHeight - 4)}px`;
                } else {
                    pop.style.maxHeight = `${Math.min(cap, Math.max(120, below))}px`;
                    pop.style.top = `${r.bottom + 4}px`;
                }
            }
        };
        pop.onclick = (e) => {
            // dsel often sits inside a <label class="fld"> — the label would
            // forward clicks on the pop to the toggle button, re-opening it.
            e.preventDefault();
            const opt = e.target.closest('.opt');
            if (!opt) return;
            const v = opt.dataset.v;
            if (opts.multi) { values.has(v) ? values.delete(v) : values.add(v); renderPop($('.search input', pop)?.value.trim().toLowerCase() || ''); }
            else { values = new Set([v]); closePop(); }
            renderBtn();
            el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        document.addEventListener('click', (e) => { if (!el.contains(e.target) && !pop.contains(e.target)) closePop(); });

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

    // Fixed-position dropdowns don't follow their trigger on scroll — close
    // them instead (capture picks up scrolls inside nested containers too).
    // Scrolls INSIDE the popover's own option list are exempt — that list is
    // scrollable itself and must not nuke the open dropdown.
    window.addEventListener('scroll', (e) => {
        $$('.dselpop').forEach((p) => {
            if (!p.contains(e.target)) p.style.display = 'none';
        });
    }, { capture: true, passive: true });

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
    let actDays = 30;         // activity page range pill selection
    const actFilter = { q: '', roles: [] }; // activity name/id search + role picks
    const pulseOn = new Set(['commands', 'joins', 'mod']);

    const fmtDelta = (cur, prev) => {
        if (!prev) return '';
        const pct = Math.round(((cur - prev) / prev) * 100);
        return `<span class="delta ${pct >= 0 ? 'up' : 'dn'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
    };

    async function save(section, fields, btn, quiet) {
        btn && (btn.disabled = true);
        const r = await api(`/api/guilds/${guildId}/settings`, { body: { section, fields } });
        btn && (btn.disabled = false);
        if (r.ok) {
            CTX.settings = r.settings;
            // What was sent becomes the section's new clean snapshot.
            const s = saveSections.find((x) => x.section === section);
            if (s) { s.baseline = JSON.stringify(fields); s.dirty = false; renderDirtyBar(); }
            if (!quiet) toast('Saved');
        }
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
        // Clear per-guild theming left over from a previous guild view.
        document.documentElement.style.removeProperty('--accent');
        document.documentElement.style.removeProperty('--accent-2');
        document.documentElement.dataset.glass = '';
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
            ['activity', svg('<circle cx="12" cy="13" r="8.5"/><path d="M12 9.5V13l2.5 2.5"/><path d="M9 2h6"/>'), 'Activity'],
            ['modules', svg('<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>'), 'Modules'],
            ['commands', svg('<path d="M5 7l4 4-4 4"/><path d="M12 17h7"/><rect x="3" y="4" width="18" height="16" rx="2"/>'), 'Commands'],
            ['triggers', svg('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>'), 'Triggers'],
        ] },
        { group: 'Safety', items: [
            ['automod', svg('<path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>'), 'Automod'],
            ['logging', svg('<path d="M4 5h16M4 12h16M4 19h10"/>'), 'Logging'],
            ['tickets', svg('<path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4z"/><path d="M13 5v2M13 11v2M13 17v2"/>'), 'Tickets'],
            ['captcha', svg('<path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"/><path d="M9 9.5h.01M15 9.5h.01"/><path d="M9.5 14.5c1.2 1 3.8 1 5 0"/>'), 'CAPTCHA'],
        ] },
        { group: 'Engagement', items: [
            ['welcome', svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>'), 'Welcome'],
            ['roles', svg('<path d="M3 12V4h8l9 9-8 8-9-9z"/><circle cx="7.5" cy="8.5" r="1.2" fill="currentColor" stroke="none"/>'), 'Roles'],
            ['leveling', svg('<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>'), 'Leveling'],
            ['afk', svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>'), 'AFK'],
            ['economy', svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M15 9.2c-.6-1-1.7-1.4-3-1.4-1.7 0-3 .9-3 2.4 0 3.2 6 1.7 6 4.9 0 1.5-1.3 2.4-3 2.4-1.3 0-2.4-.5-3-1.5"/>'), 'Economy'],
            ['shop', svg('<path d="M4 7l1.5-3h13L20 7"/><path d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z"/><path d="M9 10a3 3 0 0 0 6 0"/>'), 'Shop'],
            ['games', svg('<rect x="2.5" y="7.5" width="19" height="11" rx="5.5"/><path d="M8 11v4M6 13h4"/><circle cx="15.5" cy="12" r="0.8" fill="currentColor" stroke="none"/><circle cx="18" cy="14" r="0.8" fill="currentColor" stroke="none"/>'), 'Games'],
            ['boosting', svg('<path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2"/><path d="M9 15l-2-2c.5-2.6 1.6-5.2 3.4-7C12.7 3.7 15.5 2.5 21 3c.5 5.5-.7 8.3-3 10.6-1.8 1.8-4.4 2.9-7 3.4z"/><circle cx="15" cy="9" r="1.6"/>'), 'Boosting'],
            ['voicemaster', svg('<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>'), 'VoiceMaster'],
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
        // Last NAV group (Settings) pins to the sidebar footer with the user
        // chip — the main nav scrolls, those two stay put.
        const link = ([slug, ic, lab]) => `<a href="#/${slug}" class="${slug === activeSlug ? 'active' : ''}"><span class="ic">${ic}</span>${lab}</a>`;
        const nav = NAV.slice(0, -1).map((grp) => `<div class="dnav-group">${grp.group ? `<span>${grp.group}</span>` : ''}${grp.items.map(link).join('')}</div>`).join('');
        const footNav = NAV[NAV.length - 1].items.map(link).join('');
        app.className = '';
        app.innerHTML = `<div class="dwrap">
            <aside class="dside" id="dside">
                <a class="nav-logo" href="/">Kotan</a>
                <a class="gsel" href="/dashboard" title="Switch server">${icon}<span class="gsel-t"><b>${esc(g.name)}</b><span>Switch server</span></span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></a>
                <nav class="dnav">${nav}</nav>
                <div class="dfoot"><nav class="dnav foot">${footNav}</nav>
                <div class="duser">
                    ${av}<div class="du"><b>${esc(CTX.user.username)}</b><span>@${esc(CTX.user.username)}</span></div>
                    <a class="icobtn" href="/auth/logout" title="Sign out"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></a>
                </div></div>
            </aside>
            <div class="dmain">
                <div class="dtop">
                    <button class="burger" id="burger">☰</button>
                    <div class="crumb"><a href="/dashboard">Servers</a><span>›</span>${esc(g.name)}<span>›</span><b>${esc(label)}</b></div>
                </div>
                <div class="dcontent"><div id="page" class="dpage"></div></div>
            </div>
        </div>`;
        // Per-guild dashboard appearance — set in Settings > Dashboard appearance.
        applyAppearance();
        // Default anchor nav (#/slug) would scroll .dnav to bring the
        // clicked link to the top — route via pushState instead.
        $('#dside').addEventListener('click', (e) => {
            const a = e.target.closest('a[href^="#/"]');
            if (!a) return;
            e.preventDefault();
            const href = a.getAttribute('href');
            if (location.hash === href) return;
            history.pushState(null, '', href);
            router();
        });
        $('#burger').onclick = () => $('#dside').classList.toggle('open');
        mountThemeFab();
    }

    function applyAppearance() {
        const ap = CTX.settings?.appearance || {};
        document.documentElement.dataset.glass = ap.theme === 'glass' ? '1' : '';
        const root = document.documentElement.style;
        if (ap.accent) { root.setProperty('--accent', ap.accent); root.setProperty('--accent-2', ap.accent); }
        else { root.removeProperty('--accent'); root.removeProperty('--accent-2'); }
        const bg = $('.dwrap', app);
        if (bg) {
            if (ap.background) {
                bg.style.background = `url("${ap.background.replace(/["\\]/g, '')}") center / cover fixed`;
                bg.style.backgroundBlendMode = 'normal';
            } else bg.style.background = '';
        }
    }

    // In-page subnav — built automatically from each page's section headings.
    // Sits above the title, jump-scrolls to a section, and tracks scroll.
    let scrollSpy = null;
    function bindSubnav(page) {
        const heads = $$('.card h3', page);
        // Only worth a subnav when there's actually a lot to jump between —
        // few sections or a page that fits the viewport gets none.
        if (heads.length < 4 || page.scrollHeight < window.innerHeight * 1.15) return;
        const seen = new Map();
        heads.forEach((h, i) => {
            const base = h.textContent.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `sec-${i}`;
            const slug = seen.has(base) ? `${base}-${seen.get(base)}` : base;
            seen.set(base, (seen.get(base) || 0) + 1);
            h.closest('.card').dataset.sec = slug;
            h.dataset.secLabel = h.textContent.trim();
        });
        const nav = document.createElement('div');
        nav.className = 'subnav';
        nav.innerHTML = heads.map((h) => `<button class="snv" data-sec="${h.closest('.card').dataset.sec}">${esc(h.dataset.secLabel)}</button>`).join('');
        page.insertBefore(nav, page.firstChild);
        $$('.snv', nav).forEach((b) => (b.onclick = () => {
            const t = $(`.card[data-sec="${b.dataset.sec}"]`, page);
            if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
        }));
        if (scrollSpy) window.removeEventListener('scroll', scrollSpy);
        scrollSpy = () => {
            const line = nav.getBoundingClientRect().bottom + 16;
            let cur = heads[0]?.closest('.card')?.dataset.sec;
            for (const h of heads) {
                const card = h.closest('.card');
                if (card.getBoundingClientRect().top < line) cur = card.dataset.sec;
            }
            $$('.snv', nav).forEach((b) => b.classList.toggle('on', b.dataset.sec === cur));
        };
        window.addEventListener('scroll', scrollSpy, { passive: true });
        scrollSpy();
    }

    // ---------- Discord-style SVG previews ----------
    // Inline SVG mocks of Discord UI: message rows, embeds, CV2 containers,
    // and the profile popout. Text wraps by estimated width — it's a preview.
    const DC = { bg: '#313338', panel: '#2b2d31', border: '#43444c', text: '#dbdee1', head: '#f2f3f5', muted: '#949ba4', brand: '#5865f2', green: '#23a55a' };
    const DFONT = `'gg sans','Segoe UI','Helvetica Neue',Arial,sans-serif`;
    // Discord-style "Today at h:mm AM" — .dsvg-ts nodes refresh on a 2s tick.
    const tsNow = () => {
        const d = new Date();
        const h = d.getHours() % 12 || 12, ap = d.getHours() < 12 ? 'AM' : 'PM';
        return `Today at ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
    };
    setInterval(() => { $$('.dsvg-ts').forEach((t) => (t.textContent = tsNow())); }, 2000);
    let svgUid = 0;
    const xesc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const normHex = (v, fb) => (/^#?[0-9a-f]{6}$/i.test(String(v || '').trim()) ? `#${String(v).trim().replace(/^#/, '')}` : fb);
    const dcdnAv = (id, hash) => (hash ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128` : '');
    const dcdnIcon = (id, hash) => (hash ? `https://cdn.discordapp.com/icons/${id}/${hash}.png?size=128` : '');

    const wrapTxt = (str, maxChars) => {
        const out = [];
        for (const raw of String(str || '').split('\n')) {
            let line = '';
            for (const w of raw.split(/\s+/).filter(Boolean)) {
                const cand = line ? `${line} ${w}` : w;
                if (cand.length > maxChars && line) { out.push(line); line = w; }
                else line = cand;
            }
            out.push(line);
        }
        return out.length ? out : [''];
    };

    const txtLines = (lines, x, y, { size = 14, fill = DC.text, weight = 400, lh = 1.4 } = {}) =>
        lines.map((l, i) => `<text x="${x}" y="${y + i * size * lh}" font-family="${DFONT}" font-size="${size}" font-weight="${weight}" fill="${fill}">${xesc(l)}</text>`).join('');

    // Circular avatar — CDN image when available, else a default silhouette.
    const svgAv = (url, cx, cy, r) => {
        const id = `av${++svgUid}`;
        const inner = url
            ? `<image href="${xesc(url)}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
            : `<g clip-path="url(#${id})"><rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="${DC.brand}"/><circle cx="${cx}" cy="${cy - r * 0.35}" r="${r * 0.42}" fill="#fff"/><path d="M${cx - r * 0.75} ${cy + r} a${r * 0.75} ${r * 0.75} 0 0 1 ${r * 1.5} 0" fill="#fff"/></g>`;
        return `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>${inner}`;
    };

    // Rounded image — CDN URL or a dark placeholder with an icon glyph.
    const svgImg = (url, x, y, w, h, rx = 8) => {
        const id = `im${++svgUid}`;
        const inner = /^https?:\/\//.test(url || '')
            ? `<image href="${xesc(url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
            : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1e1f22" clip-path="url(#${id})"/><path d="M${x + w / 2 - 14} ${y + h / 2 + 10} l9 -12 7 8 9 -12 11 16z" fill="${DC.border}"/><circle cx="${x + w / 2 - 8}" cy="${y + h / 2 - 8}" r="4" fill="${DC.border}"/>`;
        return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath></defs>${inner}`;
    };

    // Classic embed — accent bar, title, wrapped description, thumbnail, footer.
    const svgEmbed = (e, x, y, w) => {
        const pad = 14, iw = w - 32;
        const thumb = e.thumbUrl ? 80 : 0;
        const tw = iw - (thumb ? 92 : 0);
        const color = e.color === false ? DC.border : normHex(e.color, DC.brand);
        let cy = y + pad, body = '';
        if (e.title) {
            const ls = wrapTxt(e.title, Math.floor(tw / 8.2));
            body += txtLines(ls, x + 16, cy + 11, { size: 15, fill: DC.head, weight: 700 });
            cy += ls.length * 21 + 4;
        }
        if (e.description) {
            const ls = wrapTxt(e.description, Math.floor(tw / 6.9));
            body += txtLines(ls, x + 16, cy + 10, { size: 14 });
            cy += ls.length * 19.6 + 4;
        }
        if (e.footer) {
            cy += 6;
            const ls = wrapTxt(e.footer, Math.floor(iw / 6.4));
            body += txtLines(ls, x + 16, cy + 8, { size: 12, fill: DC.muted });
            cy += ls.length * 16.8;
        }
        const h = Math.max(cy - y + pad, thumb ? 108 : 44);
        const img = thumb ? svgImg(e.thumbUrl, x + w - 96, y + pad, 80, 80) : '';
        return { h, svg: `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${DC.panel}"/><rect x="${x}" y="${y}" width="4" height="${h}" fill="${color}"/>${img}${body}` };
    };

    // Button/select rows — pseudo-comps the preview layers onto feature
    // panels (voicemaster grid, ticket topic picker, verify button). One
    // call renders one action row; `color` picks the Discord button tint.
    const BTN_COLORS = { primary: '#5865f2', success: '#248046', danger: '#da373c' };
    const svgRowComp = (c, x, y, w) => {
        let svg = '';
        if (c.type === 'buttons') {
            let bx = x;
            for (const l of c.labels || []) {
                const bw = Math.max(48, String(l).length * 7.8 + 30);
                if (bx + bw > x + w) break;
                svg += `<rect x="${bx}" y="${y}" width="${bw}" height="34" rx="8" fill="${BTN_COLORS[c.color] || '#4e5058'}"/>
                    <text x="${bx + bw / 2}" y="${y + 22}" text-anchor="middle" font-family="${DFONT}" font-size="14" font-weight="500" fill="#fff">${xesc(l)}</text>`;
                bx += bw + 8;
            }
        } else if (c.type === 'select') {
            svg = `<rect x="${x}" y="${y}" width="${w}" height="34" rx="8" fill="#383a40"/>
                <text x="${x + 12}" y="${y + 22}" font-family="${DFONT}" font-size="14" fill="#b5bac1">${xesc(c.label || 'Make a selection')}</text>
                <path d="M${x + w - 24} ${y + 14} l5 5 5 -5" stroke="#b5bac1" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        return { svg, h: 42 };
    };

    // CV2 container — stacked components, per-type rendering, optional accent bar.
    const svgContainer = (comps, x, y, w, accent) => {
        const pad = 16, iw = w - pad * 2;
        let cy = y + pad, body = '';
        for (const c of comps || []) {
            if (c.type === 'text') {
                const ls = wrapTxt(c.text || 'Text', Math.floor(iw / 6.9));
                body += txtLines(ls, x + pad, cy + 10);
                cy += ls.length * 19.6 + 6;
            } else if (c.type === 'heading') {
                const ls = wrapTxt(c.text || 'Heading', Math.floor(iw / 9));
                body += txtLines(ls, x + pad, cy + 12, { size: 16, fill: DC.head, weight: 700 });
                cy += ls.length * 22.4 + 6;
            } else if (c.type === 'separator') {
                const gap = c.size === 'large' ? 12 : 5;
                cy += gap;
                body += `<line x1="${x + pad}" y1="${cy}" x2="${x + w - pad}" y2="${cy}" stroke="${DC.border}" stroke-width="1"/>`;
                cy += gap + 4;
            } else if (c.type === 'image') {
                const ih = Math.min(150, Math.floor(iw * 0.55));
                body += svgImg(c.url, x + pad, cy, iw, ih);
                cy += ih + 8;
            } else if (c.type === 'section') {
                const accW = 96; // accessory column (thumbnail or button)
                const big = c.big === true; // converted headings keep the size
                const lh = big ? 22.4 : 19.6;
                const ls = wrapTxt(c.text || 'Section text', Math.floor((iw - accW) / (big ? 9 : 6.9)));
                const sh = Math.max(ls.length * lh, 64);
                body += txtLines(ls, x + pad, cy + 10 + Math.max(0, (sh - ls.length * lh) / 2),
                    big ? { size: 16, fill: DC.head, weight: 700 } : {});
                if (c.btnUrl || c.btnLabel) {
                    // button accessory — Discord renders link buttons gray
                    const bl = (c.btnLabel || 'Link').slice(0, 16);
                    const bw = Math.max(64, bl.length * 8.4 + 34);
                    body += `<rect x="${x + w - pad - bw}" y="${cy + (sh - 34) / 2}" width="${bw}" height="34" rx="8" fill="#4e5058"/>
                        <text x="${x + w - pad - bw / 2}" y="${cy + (sh - 34) / 2 + 22}" text-anchor="middle" font-family="${DFONT}" font-size="14" font-weight="500" fill="#fff">${xesc(bl)}</text>`;
                } else {
                    body += svgImg(c.image, x + w - pad - 64, cy, 64, 64);
                }
                cy += sh + 8;
            } else if (c.type === 'link') {
                const ll = (c.label || 'Link').slice(0, 20);
                const lw = Math.max(80, ll.length * 8.4 + 46);
                body += `<rect x="${x + pad}" y="${cy}" width="${lw}" height="34" rx="8" fill="#4e5058"/>
                    <text x="${x + pad + lw / 2 - 7}" y="${cy + 22}" text-anchor="middle" font-family="${DFONT}" font-size="14" font-weight="500" fill="#fff">${xesc(ll)}</text>
                    <path d="M${x + pad + lw - 16} ${cy + 11} h6 v6 M${x + pad + lw - 10} ${cy + 11} l-7 7" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
                cy += 42;
            } else if (c.type === 'buttons' || c.type === 'select') {
                const r = svgRowComp(c, x + pad, cy, iw);
                body += r.svg;
                cy += r.h;
            }
        }
        const h = Math.max(cy - y + pad - 4, 44);
        const bar = accent ? `<rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${normHex(accent, DC.brand)}"/>` : '';
        return { h, svg: `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${DC.panel}" stroke="${DC.border}" stroke-opacity=".55"/>${bar}${body}` };
    };

    // A message row: avatar, name + BOT tag + timestamp, text, embed/container.
    // `rows` are action rows rendered below the body (panels whose controls
    // didn't fit inside the card, or non-CV2 styles).
    const svgMessage = ({ avatar, name, content, embed, container, accent, rows }) => {
        const W = 440;
        let body = svgAv(avatar, 38, 28, 20);
        const nw = Math.min(String(name).length * 8.4, 180);
        body += `<text x="72" y="32" font-family="${DFONT}" font-size="15" font-weight="600" fill="${DC.head}">${xesc(name)}</text>`;
        body += `<rect x="${76 + nw}" y="20" width="38" height="15" rx="4" fill="${DC.brand}"/><text x="${95 + nw}" y="31" text-anchor="middle" font-family="${DFONT}" font-size="10" font-weight="700" fill="#fff">BOT</text>`;
        body += `<text class="dsvg-ts" x="${121 + nw}" y="31" font-family="${DFONT}" font-size="11" fill="${DC.muted}">${tsNow()}</text>`;
        let cy = 44;
        if (content) {
            const ls = wrapTxt(content, 47);
            body += txtLines(ls, 72, cy + 10);
            cy += ls.length * 19.6 + 6;
        }
        if (embed) { const r = svgEmbed(embed, 72, cy, 344); body += r.svg; cy += r.h + 8; }
        if (container) { const r = svgContainer(container, 72, cy, 344, accent); body += r.svg; cy += r.h + 8; }
        if (rows?.length) for (const c of rows) { const r = svgRowComp(c, 72, cy, 344); body += r.svg; cy += r.h; }
        const h = Math.max(cy + 8, 52);
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" class="dsvg" role="img"><rect width="${W}" height="${h}" fill="${DC.bg}"/>${body}</svg>`;
    };

    // Discord profile popout — banner (image or accent), avatar + status,
    // name, meta. Clickable zones carry data-pick for the upload pickers.
    const svgProfile = ({ name, username, avatar, banner, bannerImg }) => {
        const W = 300, H = 238;
        const bc = normHex(banner, DC.brand);
        const id = `pf${++svgUid}`;
        const bid = `pb${++svgUid}`;
        const bannerArt = /^https?:\/\//.test(bannerImg || '')
            ? `<defs><clipPath id="${bid}"><rect width="${W}" height="60"/></clipPath></defs>
               <image href="${xesc(bannerImg)}" width="${W}" height="60" preserveAspectRatio="xMidYMid slice" clip-path="url(#${bid})"/>`
            : `<rect width="${W}" height="60" fill="${bc}"/>`;
        const badge = (cx, cy) => `
            <g class="pfbadge">
                <circle cx="${cx}" cy="${cy}" r="11" fill="#111214" stroke="#3a3c42"/>
                <text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-family="${DFONT}" font-size="12" fill="#dbdee1">✎</text>
            </g>`;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="dsvg" role="img">
            <defs><clipPath id="${id}"><rect width="${W}" height="${H}" rx="10"/></clipPath></defs>
            <g clip-path="url(#${id})">
                <rect width="${W}" height="${H}" fill="#1e1f22"/>
                <g class="pfpzone" data-pick="banner">
                    ${bannerArt}
                    <rect width="${W}" height="60" fill="#000" class="pfdim"/>
                    ${badge(W - 24, 30)}
                </g>
                <rect y="60" width="${W}" height="${H - 60}" fill="#111214"/>
                <g class="pfpzone" data-pick="avatar">
                    <circle cx="52" cy="78" r="47" fill="#111214"/>
                    ${svgAv(avatar, 52, 78, 42)}
                    <circle cx="52" cy="78" r="42" fill="#000" class="pfdim"/>
                    <circle cx="82" cy="106" r="12" fill="#111214"/><circle cx="82" cy="106" r="8" fill="${DC.green}"/>
                    ${badge(52, 78)}
                </g>
                <text x="16" y="150" font-family="${DFONT}" font-size="19" font-weight="700" fill="${DC.head}">${xesc(name)}</text>
                <text x="16" y="170" font-family="${DFONT}" font-size="13" fill="${DC.muted}">${xesc(username)}</text>
                <rect x="12" y="184" width="${W - 24}" height="${H - 196}" rx="8" fill="#1e1f22"/>
                <text x="24" y="206" font-family="${DFONT}" font-size="11" font-weight="700" fill="${DC.muted}">ABOUT ME</text>
                <text x="24" y="222" font-family="${DFONT}" font-size="12" fill="${DC.text}">Your friendly community bot.</text>
            </g></svg>`;
    };

    // ---------- welcome image editor (canvas) ----------
    // Positions and sizes are stored as 0-1 fractions; the preview canvas
    // uses the same 800x300 frame the bot renders with @napi-rs/canvas.
    function imgEditorHtml(p, img) {
        return `
            <div class="card"><h3>Welcome image</h3>
                <p class="sub mb">Canvas-rendered image attached to the welcome message — drag pieces around the preview. Text placeholders: <code class="mono">{username}</code> <code class="mono">{user}</code> <code class="mono">{server}</code> <code class="mono">{members}</code></p>
                ${tgl(`${p}img_on`, 'Welcome image enabled', img?.enabled)}
                <div class="grid2">
                    ${fldHtml('Background image URL', txtIn(`${p}img_bg`, img?.background || ''), 'empty = solid color below')}
                    ${fldHtml('Background color', `<input type="color" name="${p}img_col" value="#${esc(img?.bgColor || '1e1f22')}" class="colfull">`)}
                </div>
                <div class="imged-tools">
                    <button type="button" class="btn sm" id="${p}img_addav">+ Media</button>
                    <button type="button" class="btn sm" id="${p}img_addtx">+ Text</button>
                    <span class="imged-sep"></span>
                    <button type="button" class="btn sm" id="${p}img_row" title="Spread all pieces evenly in a horizontal line">Auto: row</button>
                    <button type="button" class="btn sm" id="${p}img_col" title="Spread all pieces evenly in a vertical line">Auto: column</button>
                    <button type="button" class="btn sm danger" id="${p}img_del" style="display:none">Remove selected</button>
                </div>
                <canvas id="${p}img_cv" class="imged-cv" width="800" height="300"></canvas>
                <div id="${p}img_props" class="imged-props"></div>
                <div class="imged-test">
                    <div class="imged-inline">
                        <div class="fld grow"><label>Test channel</label>${selSlot(`${p}img_tch`)}</div>
                        <div class="fld"><label>&nbsp;</label><button type="button" class="btn sm primary" id="${p}img_test">Send test welcome</button></div>
                    </div>
                    <span id="${p}img_tstat" class="sub"></span>
                </div>
            </div>`;
    }

    function setupImageEditor(page, p, img) {
        const W = 800, H = 300;
        const cv = $(`#${p}img_cv`, page);
        const props = $(`#${p}img_props`, page);
        const delBtn = $(`#${p}img_del`, page);
        const c2 = cv.getContext('2d');
        // Legacy 'avatar' elements normalize to media:avatar:circle on load.
        const els = (img?.elements || []).map((e) =>
            e.type === 'avatar' ? { ...e, type: 'media', src: 'avatar', shape: 'circle' } : { ...e });
        let sel = null;
        let uid = els.length;

        const memberAv = dcdnAv(CTX.user.id, CTX.user.avatar);
        const guildIcon = dcdnIcon(CTX.guild.id, CTX.guild.icon);
        const imgCache = new Map();
        const srcOf = (el) => (el.src === 'icon' ? guildIcon
            : el.src === 'url' ? (el.url || '').replaceAll('{avatar}', memberAv).replaceAll('{icon}', guildIcon)
            : memberAv);
        const imgFor = (u) => {
            if (!u) return null;
            let i = imgCache.get(u);
            if (!i) { i = new Image(); i.crossOrigin = 'anonymous'; i.onload = draw; i.src = u; imgCache.set(u, i); }
            return i;
        };
        const bgImg = new Image(); bgImg.crossOrigin = 'anonymous';
        const bgIn = $(`[name=${p}img_bg]`, page);
        const colIn = $(`[name=${p}img_col]`, page);
        const loadBg = () => {
            const u = (bgIn.value || '').trim();
            bgImg.src = /^https?:\/\//i.test(u) ? u : '';
            draw();
        };
        bgImg.onload = draw;
        bgIn.addEventListener('input', loadBg);
        colIn.addEventListener('input', draw);

        const fmtS = (s) => String(s ?? '')
            .replaceAll('{user}', `@${CTX.user.username}`)
            .replaceAll('{username}', CTX.user.username)
            .replaceAll('{server}', CTX.guild.name)
            .replaceAll('{members}', String(CTX.guild.memberCount));
        const textFont = (el) => `${el.bold ? '800' : '600'} ${Math.max(8, el.size * H)}px Kotan, sans-serif`;

        const shapeClip = (cx, cy, r, shape) => {
            c2.beginPath();
            if (shape === 'square') c2.rect(cx - r, cy - r, r * 2, r * 2);
            else if (shape === 'rounded') c2.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.4);
            else c2.arc(cx, cy, r, 0, 7);
        };

        function elBounds(el) {
            if (el.type === 'media') {
                const r = Math.max(4, el.size * H * 0.5);
                return { x: el.x * W - r, y: el.y * H - r, w: r * 2, h: r * 2 };
            }
            c2.font = textFont(el);
            const tw = c2.measureText(fmtS(el.text) || ' ').width;
            const th = Math.max(8, el.size * H);
            const ax = { left: 0, right: 1 }[el.align] ?? 0.5;
            return { x: el.x * W - tw * ax, y: el.y * H - th / 2, w: tw, h: th };
        }

        function draw() {
            c2.clearRect(0, 0, W, H);
            c2.fillStyle = colIn.value || '#1e1f22';
            c2.fillRect(0, 0, W, H);
            if (bgImg.complete && bgImg.naturalWidth) {
                const s = Math.max(W / bgImg.naturalWidth, H / bgImg.naturalHeight);
                const w = bgImg.naturalWidth * s, h = bgImg.naturalHeight * s;
                c2.drawImage(bgImg, (W - w) / 2, (H - h) / 2, w, h);
            }
            for (const el of els) {
                if (el.type === 'media') {
                    const r = Math.max(4, el.size * H * 0.5), cx = el.x * W, cy = el.y * H;
                    const mi = imgFor(srcOf(el));
                    if (mi?.complete && mi.naturalWidth) {
                        c2.save(); shapeClip(cx, cy, r, el.shape); c2.clip();
                        c2.drawImage(mi, cx - r, cy - r, r * 2, r * 2);
                        c2.restore();
                    } else {
                        c2.fillStyle = '#5865f2';
                        shapeClip(cx, cy, r, el.shape); c2.fill();
                    }
                    if (el.ring) {
                        c2.strokeStyle = '#' + el.ring;
                        c2.lineWidth = Math.max(2, r * 0.07);
                        shapeClip(cx, cy, r - c2.lineWidth / 2, el.shape); c2.stroke();
                    }
                } else if (el.type === 'text') {
                    c2.font = textFont(el);
                    c2.textAlign = { left: 'left', right: 'right' }[el.align] || 'center';
                    c2.textBaseline = 'middle';
                    c2.fillStyle = '#' + (el.color || 'ffffff');
                    c2.fillText(fmtS(el.text) || ' ', el.x * W, el.y * H, W * 0.94);
                }
            }
            if (sel) {
                const b = elBounds(sel);
                c2.save();
                c2.strokeStyle = '#5865f2'; c2.lineWidth = 2; c2.setLineDash([6, 4]);
                c2.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
                c2.restore();
            }
        }

        function renderProps() {
            delBtn.style.display = sel ? '' : 'none';
            if (!sel) { props.innerHTML = '<p class="sub">Click a piece to select it — drag to move.</p>'; return; }
            if (sel.type === 'media') {
                props.innerHTML = `
                    <div class="imged-inline">
                        <div class="fld"><label>Source</label><select data-k="src">
                            ${[['avatar', 'Member avatar'], ['icon', 'Server icon'], ['url', 'Image URL']].map(([v, l]) => `<option value="${v}" ${sel.src === v ? 'selected' : ''}>${l}</option>`).join('')}
                        </select></div>
                        <div class="fld grow" data-uwrap ${sel.src === 'url' ? '' : 'style="display:none"'}><label>Image URL</label><input type="text" data-k="url" value="${esc(sel.url || '')}" placeholder="https://… or {avatar}"></div>
                        <div class="fld"><label>Edges</label><select data-k="shape">
                            ${[['circle', 'Circle'], ['rounded', 'Rounded'], ['square', 'Square']].map(([v, l]) => `<option value="${v}" ${sel.shape === v ? 'selected' : ''}>${l}</option>`).join('')}
                        </select></div>
                        <div class="fld grow"><label>Size</label><input type="range" data-k="size" min="0.05" max="0.8" step="0.01" value="${sel.size}"></div>
                        <div class="fld"><label>Ring</label><div class="imged-inline"><input type="color" data-k="ring" value="#${esc(sel.ring || '5865f2')}"><button type="button" class="btn sm" data-noring>None</button></div></div>
                    </div>`;
                const srcIn = props.querySelector('[data-k=src]');
                const uwrap = props.querySelector('[data-uwrap]');
                srcIn.onchange = () => { sel.src = srcIn.value; uwrap.style.display = sel.src === 'url' ? '' : 'none'; draw(); };
                const urlIn = props.querySelector('[data-k=url]');
                urlIn.oninput = () => { sel.url = urlIn.value; draw(); };
                const shIn = props.querySelector('[data-k=shape]');
                shIn.onchange = () => { sel.shape = shIn.value; draw(); };
                const sizeIn = props.querySelector('[data-k=size]');
                sizeIn.oninput = () => { sel.size = +sizeIn.value; draw(); };
                const ringIn = props.querySelector('[data-k=ring]');
                ringIn.oninput = () => { sel.ring = ringIn.value.slice(1); draw(); };
                props.querySelector('[data-noring]').onclick = () => { sel.ring = ''; draw(); };
            } else {
                props.innerHTML = `
                    <div class="fld"><label>Text</label><input type="text" data-k="text" value="${esc(sel.text)}" placeholder="Welcome {username}"></div>
                    <div class="imged-inline">
                        <div class="fld grow"><label>Size</label><input type="range" data-k="size" min="0.02" max="0.4" step="0.005" value="${sel.size}"></div>
                        <div class="fld"><label>Color</label><input type="color" data-k="color" value="#${esc(sel.color || 'ffffff')}"></div>
                        <div class="fld"><label>Align</label><select data-k="align">
                            ${['left', 'center', 'right'].map((a) => `<option value="${a}" ${sel.align === a ? 'selected' : ''}>${a}</option>`).join('')}
                        </select></div>
                        <div class="fld"><label>&nbsp;</label><label class="chkline"><input type="checkbox" data-k="bold" ${sel.bold ? 'checked' : ''}> Bold</label></div>
                    </div>`;
                const textIn = props.querySelector('[data-k=text]');
                textIn.oninput = () => { sel.text = textIn.value; draw(); };
                const sizeIn = props.querySelector('[data-k=size]');
                sizeIn.oninput = () => { sel.size = +sizeIn.value; draw(); };
                const colEl = props.querySelector('[data-k=color]');
                colEl.oninput = () => { sel.color = colEl.value.slice(1); draw(); };
                const alignIn = props.querySelector('[data-k=align]');
                alignIn.onchange = () => { sel.align = alignIn.value; draw(); };
                const boldIn = props.querySelector('[data-k=bold]');
                boldIn.onchange = () => { sel.bold = boldIn.checked; draw(); };
            }
        }

        // Drag: hit-test topmost element (render order = array order), then
        // track pointer movement in canvas coords. Fires a synthetic input so
        // the dirty scanner picks up position changes.
        const toXY = (e) => {
            const r = cv.getBoundingClientRect();
            return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
        };
        let dragOff = null;
        cv.onpointerdown = (e) => {
            const pt = toXY(e);
            sel = null;
            for (let i = els.length - 1; i >= 0; i--) {
                const b = elBounds(els[i]);
                if (pt.x >= b.x - 4 && pt.x <= b.x + b.w + 4 && pt.y >= b.y - 4 && pt.y <= b.y + b.h + 4) { sel = els[i]; break; }
            }
            if (sel) {
                cv.setPointerCapture(e.pointerId);
                dragOff = { dx: pt.x - sel.x * W, dy: pt.y - sel.y * H };
                cv.style.cursor = 'grabbing';
            }
            renderProps(); draw();
        };
        cv.onpointermove = (e) => {
            if (!dragOff || !sel) return;
            const pt = toXY(e);
            sel.x = Math.min(1, Math.max(0, (pt.x - dragOff.dx) / W));
            sel.y = Math.min(1, Math.max(0, (pt.y - dragOff.dy) / H));
            draw();
        };
        const endDrag = () => {
            if (dragOff) cv.dispatchEvent(new Event('input', { bubbles: true }));
            dragOff = null; cv.style.cursor = '';
        };
        cv.onpointerup = endDrag;
        cv.onpointercancel = endDrag;

        $(`#${p}img_addav`, page).onclick = () => {
            sel = { id: `e${++uid}`, type: 'media', src: 'avatar', shape: 'circle', x: 0.5, y: 0.4, size: 0.3, ring: '5865f2' };
            els.push(sel); renderProps(); draw();
        };
        // Auto-layout: spread every element evenly along one axis, centered on
        // the other — the classic "line them up, balanced" button.
        const spread = (axis) => {
            els.forEach((el, i) => {
                const t = (i + 1) / (els.length + 1);
                if (axis === 'row') { el.x = t; el.y = 0.5; }
                else { el.x = 0.5; el.y = t; }
            });
            draw(); cv.dispatchEvent(new Event('input', { bubbles: true }));
        };
        $(`#${p}img_row`, page).onclick = () => spread('row');
        $(`#${p}img_col`, page).onclick = () => spread('column');
        $(`#${p}img_addtx`, page).onclick = () => {
            sel = { id: `e${++uid}`, type: 'text', x: 0.5, y: 0.5, text: 'Welcome {username}', size: 0.08, color: 'ffffff', bold: true, align: 'center' };
            els.push(sel); renderProps(); draw();
        };
        delBtn.onclick = () => {
            const i = els.indexOf(sel);
            if (i >= 0) els.splice(i, 1);
            sel = null; renderProps(); draw();
        };

        renderProps(); draw();
        return {
            collect(f) {
                return {
                    enabled: f[`${p}img_on`],
                    width: W, height: H,
                    background: (bgIn.value || '').trim(),
                    bgColor: (colIn.value || '').replace('#', ''),
                    elements: els.map((e) => ({ ...e })),
                };
            },
        };
    }

    // ---------- unsaved-changes bar ----------
    // bindSave() registers a section collector — no per-section button is
    // rendered. Each section's collected fields are snapshotted at bind time;
    // edits are diffed against that snapshot, and the fixed bottom bar shows
    // while any section differs. Save commits every dirty section, Cancel
    // re-renders the page from CTX.settings.
    let saveSections = [];
    let dirtyBar = null;
    let dirtyObs = null;
    let dirtyQueued = false;

    const secSnap = (s) => { try { return JSON.stringify(s.collect(s.container)); } catch { return null; } };

    function bindSave(container, section, collect) {
        const s = { container, section, collect };
        s.baseline = secSnap(s);
        saveSections.push(s);
    }

    function renderDirtyBar() {
        if (!dirtyBar && !saveSections.length) return;
        if (!dirtyBar) {
            dirtyBar = document.createElement('div');
            dirtyBar.className = 'savebar';
            dirtyBar.innerHTML = `<span class="sb-msg">You have unsaved changes!</span>
                <div class="sb-btns"><button class="btn sm" data-x>Cancel</button>
                <button class="btn primary sm" data-ok>Save</button></div>`;
            dirtyBar.querySelector('[data-x]').onclick = () => router();
            dirtyBar.querySelector('[data-ok]').onclick = (e) => saveDirty(e.target);
            document.body.appendChild(dirtyBar);
        }
        const dirty = saveSections.some((s) => s.dirty);
        dirtyBar.classList.toggle('show', dirty);
        document.body.classList.toggle('has-dirty', dirty);
    }

    // Scans are microtask-coalesced — typing, preview re-renders and row
    // re-draws each fire a burst of events/mutations per gesture.
    const queueDirtyScan = () => {
        if (dirtyQueued) return;
        dirtyQueued = true;
        queueMicrotask(() => { dirtyQueued = false; dirtyScan(); });
    };

    function dirtyScan() {
        for (const s of saveSections) s.dirty = secSnap(s) !== s.baseline;
        renderDirtyBar();
    }

    async function saveDirty(btn) {
        const pending = saveSections.filter((s) => s.dirty);
        if (!pending.length) return;
        btn.disabled = true;
        let ok = true;
        for (const s of pending) {
            try { ok = (await save(s.section, s.collect(s.container), null, true)) && ok; }
            catch { ok = false; }
        }
        btn.disabled = false;
        if (ok) toast('Saved');
        renderDirtyBar();
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

    // ---------- shared rich-card editor (welcome / tickets panel) ----------
    const COMP_DEFS = [
        ['text', 'Text'], ['heading', 'Heading'], ['separator', 'Divider'],
        ['image', 'Image'], ['section', 'Section'], ['link', 'Link button'],
    ];

    // Markup for one card editor — prefix `p` namespaces every field/id so
    // several editors can coexist on a page. The live component list is a
    // clone held inside setupCardEditor, not on `e`.
    function cardEditorHtml(p, e, extraChips = []) {
        const chips = ['{user}', '{username}', '{server}', '{members}', '{avatar}', '{icon}', ...extraChips]
            .map((v) => `<button type="button" class="chip" data-ins="${v}">${v.slice(1, -1)}</button>`).join('');
        const mdbar = `<div class="mdbar">
            <button type="button" data-md="**">B</button><button type="button" data-md="*" class="it">I</button>
            <button type="button" data-md="__" class="ul">U</button><button type="button" data-md="~~" class="st">S</button>
            <button type="button" data-md="\`">\`\`</button><button type="button" data-mdlink>🔗</button>
        </div>`;
        return `
            <h4 class="mt mb">Card ${tgl(`${p}e_on`, 'enabled', e.enabled)}</h4>
            <div class="cedit" id="${p}ecard">
                <div class="cedit-fields">
                    <div class="cesec"><span class="ceic">${svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6"/>')}</span>
                        <div><b>Basics</b><p class="sub">Style and accent — clear fields to hide them.</p></div></div>
                    <div class="grid2">
                        ${fldHtml('Style', `<select name="${p}e_style"><option value="embed" ${e.style !== 'cv2' ? 'selected' : ''}>Embed</option><option value="cv2" ${e.style === 'cv2' ? 'selected' : ''}>CV2 container</option></select>`)}
                        ${fldHtml('Color', `<select name="${p}e_colmode">
                            <option value="" ${e.colorMode !== 'dominant' && e.colorMode !== 'none' ? 'selected' : ''}>Custom / brand</option>
                            <option value="dominant" ${e.colorMode === 'dominant' ? 'selected' : ''}>Dominant (auto)</option>
                            <option value="none" ${e.colorMode === 'none' ? 'selected' : ''}>None — no accent</option>
                        </select>`, 'dominant = tinted from the card image/avatar')}
                    </div>
                    <div id="${p}e_colrow">
                        ${fldHtml('Accent color', `<div class="clrrow">
                            <input type="color" id="${p}e_colpick" value="${/^#?[0-9a-f]{6}$/i.test(e.color || '') ? `#${String(e.color).replace(/^#/, '')}` : '#5865f2'}">
                            <input type="text" name="${p}e_color" value="${esc(e.color ? `#${e.color}` : '')}" placeholder="#5865f2" maxlength="7">
                            <button type="button" class="btn sm" id="${p}e_coldom" title="Sample — extract the dominant color once and use it as the custom accent">◈ Sample image</button>
                            <button type="button" class="btn sm" id="${p}e_colclr" title="Clear — use the brand color">✕</button>
                        </div>`, 'hex — empty = brand color')}
                    </div>
                    <div id="${p}e_embed">
                        <div class="cesec"><span class="ceic">${svg('<path d="M4 6h16M4 12h10M4 18h13"/>')}</span>
                            <div><b>Content</b><p class="sub">Markdown and placeholders supported.</p></div></div>
                        <div class="inschips"><span>Insert</span>${chips}</div>
                        <div class="grid2">
                            ${fldHtml('Title', txtIn(`${p}e_title`, e.title || '', 'e.g. Welcome to {server}!'))}
                            ${fldHtml('Footer', txtIn(`${p}e_footer`, e.footer || ''))}
                        </div>
                        ${fldHtml('Description', mdbar + txtArea(`${p}e_desc`, e.description || ''), 'supports the same placeholders')}
                        ${fldHtml('Thumbnail URL', txtIn(`${p}e_thumburl`, e.thumb || '', '{avatar} {icon} or https://'), 'empty = member avatar')}
                        ${tgl(`${p}e_thumb`, 'Show thumbnail', e.thumbnail)}
                    </div>
                    <div id="${p}e_cv2">
                        <div class="cesec"><span class="ceic">${svg('<path d="M4 5h16v4H4zM4 11h16v4H4zM4 17h16v4H4z"/>')}</span>
                            <div><b>Components</b><p class="sub">Drag to reorder — max 10 — <code class="mono">+</code> on a text row attaches a thumbnail or button.</p></div></div>
                        <div id="${p}comps"></div>
                        <div class="compadd mt">${COMP_DEFS.map(([t, l]) => `<button class="btn sm" data-add="${t}">+ ${l}</button>`).join('')}</div>
                    </div>
                </div>
                <div class="cedit-prev">
                    <div class="ceio"><span class="cepv-t">Live Discord preview</span>
                        <span class="ceio-btns">
                            <button type="button" class="btn sm" id="${p}e_imp" title="Paste a card export or raw Discord message JSON">⇪ Import</button>
                            <button type="button" class="btn sm" id="${p}e_exp" title="Copy + download this card as JSON">⇩ Export</button>
                        </span></div>
                    <p class="sub mb">Matches the message Discord will post.</p>
                    <div class="dprev" id="${p}dprev"></div>
                </div>
            </div>`;
    }

    const cardCompFields = (c) => {
        switch (c.type) {
            case 'text':
                return `<textarea data-k="text" rows="2" placeholder="Markdown text — placeholders allowed">${esc(c.text || '')}</textarea>`;
            case 'heading':
                return `<input type="text" data-k="text" value="${esc(c.text || '')}" placeholder="Big heading text">`;
            case 'separator':
                return `<select data-k="size"><option value="small" ${c.size !== 'large' ? 'selected' : ''}>Small gap</option><option value="large" ${c.size === 'large' ? 'selected' : ''}>Large gap</option></select>`;
            case 'image':
                return `<input type="text" data-k="url" value="${esc(c.url || '')}" placeholder="https://… or {avatar} / {icon}">`;
            case 'section': {
                const acc = (c.btnUrl !== undefined || c.btnLabel !== undefined)
                    ? `<input type="text" data-k="btnLabel" value="${esc(c.btnLabel || '')}" placeholder="Button label" style="flex:0 0 120px">
                       <input type="text" data-k="btnUrl" value="${esc(c.btnUrl || '')}" placeholder="https://…" style="flex:0 0 150px">`
                    : `<input type="text" data-k="image" value="${esc(c.image || '')}" placeholder="{avatar} or URL" style="flex:0 0 160px">`;
                return `<input type="text" data-k="text" value="${esc(c.text || '')}" placeholder="Text beside the accessory" class="grow">${acc}`;
            }
            case 'link':
                return `<input type="text" data-k="label" value="${esc(c.label || '')}" placeholder="Button label" style="flex:0 0 140px">
                        <input type="text" data-k="url" value="${esc(c.url || '')}" placeholder="https://…" class="grow">`;
            default: return '';
        }
    };

    // Wires one card editor already rendered into `page`. Returns a
    // collector producing the saved embed/card object.
    function setupCardEditor(page, p, e, opts = {}) {
        // Working copy — edits never touch the settings object, so cancelling
        // (re-render from CTX.settings) restores the saved card.
        const list = (e.components || []).map((c) => ({ ...c }));
        // Feature panels can attach fixed controls (voicemaster button grid,
        // ticket topic picker…) — preview them exactly where the posted
        // payload puts them.
        const extras = opts.extras || [];

        const memberAv = dcdnAv(CTX.user.id, CTX.user.avatar);
        const guildIcon = dcdnIcon(CTX.guild.id, CTX.guild.icon);
        const botAv = CTX.bot ? (CTX.bot.avatarUrl || dcdnAv(CTX.bot.id, CTX.bot.avatar)) : '';
        const botName = CTX.settings.branding?.nickname || CTX.bot?.username || 'Kotan';
        const sampleFill = (s) => String(s ?? '')
            .replaceAll('{user}', `@${CTX.user.username}`)
            .replaceAll('{username}', CTX.user.username)
            .replaceAll('{server}', CTX.guild.name)
            .replaceAll('{members}', String(CTX.guild.memberCount))
            .replaceAll('{avatar}', memberAv || 'avatar')
            .replaceAll('{icon}', guildIcon || 'icon')
            .replaceAll('{boosts}', '7');
        // Dominant-mode preview — the real accent is extracted at send time;
        // the preview approximates it by fetching the same source once.
        let domCol = null, domSrc = '';
        const domSource = () => {
            const imgComp = list.find((c) => c.type === 'image' || (c.type === 'section' && c.image)) || {};
            const raw = ($(`[name=${p}e_thumburl]`, page)?.value || '').trim() || imgComp.url || imgComp.image || '';
            const src = raw === '{avatar}' ? (memberAv || guildIcon) : raw === '{icon}' ? guildIcon : /^https?:\/\//.test(raw) ? raw : '';
            return src || memberAv || guildIcon;
        };
        const maybeFetchDom = async () => {
            if ($(`[name=${p}e_colmode]`, page)?.value !== 'dominant') return;
            const src = domSource();
            if (!src || src === domSrc) return;
            domSrc = src;
            const r = await api(`/api/guilds/${guildId}/dominant-color?src=${encodeURIComponent(src)}`).catch(() => null);
            if (r?.ok && src === domSrc) { domCol = r.color; updPrev(); }
        };

        const updPrev = () => {
            const el = $(`#${p}dprev`, page);
            if (!el) return;
            const f = formVals(page);
            const b = { avatar: botAv, name: botName };
            if (!f[`${p}e_on`]) {
                // Card off — panels still post plain text + controls.
                el.innerHTML = extras.length
                    ? svgMessage({ ...b, content: sampleFill(f[`${p}e_desc`]) || opts.plain || '', rows: extras })
                    : '';
                return;
            }
            const mode = f[`${p}e_colmode`];
            const acv = mode === 'dominant' ? (domCol || '') : f[`${p}e_color`];
            if (f[`${p}e_style`] === 'cv2') {
                const comps = list.map((c) => ({ ...c, text: sampleFill(c.text), url: sampleFill(c.url), image: sampleFill(c.image), label: sampleFill(c.label) }));
                if (!comps.length && !extras.length) { el.innerHTML = '<p class="muted small">Add components to preview the card.</p>'; return; }
                // Controls ride inside the container up to Discord's
                // 10-per-container cap — a packed card spills them below,
                // matching the posted payload.
                const inside = comps.length + extras.length <= 10;
                el.innerHTML = svgMessage({ ...b, container: [...comps, ...(inside ? extras : [])], accent: mode === 'none' ? '' : acv, rows: inside ? null : extras });
            } else {
                el.innerHTML = svgMessage({ ...b, embed: {
                    title: sampleFill(f[`${p}e_title`]), description: sampleFill(f[`${p}e_desc`]),
                    footer: sampleFill(f[`${p}e_footer`]), color: mode === 'none' ? false : acv,
                    thumbUrl: f[`${p}e_thumb`] ? (sampleFill(f[`${p}e_thumburl`]) || memberAv) : '',
                }, rows: extras });
            }
        };

        const renderComps = () => {
            const el = $(`#${p}comps`, page);
            el.innerHTML = list.map((c, i) => `
                <div class="comprow" draggable="true" data-i="${i}">
                    <span class="drag" title="Drag to reorder">⠿</span>
                    <span class="ctype">${COMP_DEFS.find(([t]) => t === c.type)?.[1] || c.type}</span>
                    ${cardCompFields(c)}
                    <span class="cbtns">${c.type === 'text' || c.type === 'heading' ? `<button class="cbtn acc" data-acc="${i}" title="Attach accessory">＋</button>` : ''}<button class="cbtn" data-up="${i}" title="Move up">↑</button><button class="cbtn" data-dn="${i}" title="Move down">↓</button><button class="cbtn danger" data-del="${i}" title="Remove">✕</button></span>
                </div>`).join('') || '<p class="muted small">No components — add some below.</p>';
            $$('.comprow [data-k]', el).forEach((inp) => {
                const row = inp.closest('.comprow');
                inp.oninput = () => { list[+row.dataset.i][inp.dataset.k] = inp.value; };
            });
            $$('.comprow [data-up]', el).forEach((b) => (b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; renderComps(); } }));
            $$('.comprow [data-dn]', el).forEach((b) => (b.onclick = () => { const i = +b.dataset.dn; if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; renderComps(); } }));
            $$('.comprow [data-del]', el).forEach((b) => (b.onclick = () => { list.splice(+b.dataset.del, 1); renderComps(); }));
            // "+" on a text row — turn it into a section with a thumbnail or
            // link-button accessory (that's how CV2 attaches media to text).
            $$('.comprow [data-acc]', el).forEach((b) => (b.onclick = (ev) => {
                ev.stopPropagation();
                $$('.accmenu', el).forEach((m) => m.remove());
                const menu = document.createElement('div');
                menu.className = 'accmenu';
                menu.innerHTML = `<button type="button" data-accto="thumb">Thumbnail</button><button type="button" data-accto="btn">Link button</button>`;
                b.closest('.cbtns').appendChild(menu);
                menu.querySelectorAll('[data-accto]').forEach((mb) => (mb.onclick = () => {
                    const i = +b.dataset.acc;
                    const c = list[i];
                    // Headings become sections too — big:true keeps the
                    // heading-size text so the conversion doesn't shrink it.
                    const big = c.type === 'heading' ? { big: true } : {};
                    list[i] = mb.dataset.accto === 'thumb'
                        ? { type: 'section', text: c.text, image: '', ...big }
                        : { type: 'section', text: c.text, btnLabel: '', btnUrl: '', ...big };
                    renderComps();
                }));
                setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
            }));
            let dragIdx = null;
            $$('.comprow', el).forEach((row) => {
                row.ondragstart = (ev) => { dragIdx = +row.dataset.i; ev.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); };
                row.ondragend = () => row.classList.remove('dragging');
                row.ondragover = (ev) => ev.preventDefault();
                row.ondrop = (ev) => {
                    ev.preventDefault();
                    const to = +row.dataset.i;
                    if (dragIdx === null || dragIdx === to) return;
                    list.splice(to, 0, list.splice(dragIdx, 1)[0]);
                    renderComps();
                };
            });
            updPrev();
        };

        // Card editor collapses when disabled; embed vs CV2 fields follow the
        // style select; the accent row only applies to custom-color mode.
        const on = $(`[name=${p}e_on]`, page);
        const styleSel = $(`[name=${p}e_style]`, page);
        const modeSel = $(`[name=${p}e_colmode]`, page);
        const sync = () => {
            $(`#${p}ecard`, page).style.display = on.checked ? '' : 'none';
            const cv2Mode = styleSel.value === 'cv2';
            $(`#${p}e_embed`, page).style.display = cv2Mode ? 'none' : '';
            $(`#${p}e_cv2`, page).style.display = cv2Mode ? '' : 'none';
            $(`#${p}e_colrow`, page).style.display = modeSel.value === '' ? '' : 'none';
        };
        on.onchange = sync; styleSel.onchange = sync;
        modeSel.onchange = () => { sync(); maybeFetchDom(); };
        sync(); maybeFetchDom();
        $(`#${p}ecard`, page).addEventListener('input', updPrev);
        $(`#${p}ecard`, page).addEventListener('change', () => { updPrev(); maybeFetchDom(); });

        // Accent color row — swatch picker, dominant-from-image, clear.
        const colIn = $(`[name=${p}e_color]`, page);
        const colPick = $(`#${p}e_colpick`, page);
        colPick.oninput = () => { colIn.value = colPick.value; updPrev(); };
        colIn.addEventListener('input', () => {
            const v = colIn.value.trim();
            if (/^#?[0-9a-f]{6}$/i.test(v)) colPick.value = `#${v.replace(/^#/, '')}`;
        });
        $(`#${p}e_colclr`, page).onclick = () => { colIn.value = ''; updPrev(); };
        $(`#${p}e_coldom`, page).onclick = async (ev) => {
            // Source order: thumbnail field, then the first CV2 image/
            // section thumbnail, then the server icon as a last resort.
            const imgComp = list.find((c) => c.type === 'image' || (c.type === 'section' && c.image)) || {};
            const raw = ($(`[name=${p}e_thumburl]`, page)?.value || '').trim() || imgComp.url || imgComp.image || '{icon}';
            const src = raw === '{avatar}' ? (memberAv || guildIcon) : /^https?:\/\//.test(raw) ? raw : guildIcon;
            ev.target.disabled = true;
            const r = await api(`/api/guilds/${guildId}/dominant-color?src=${encodeURIComponent(src)}`).catch(() => null);
            ev.target.disabled = false;
            if (r?.ok) { colIn.value = r.color; colPick.value = r.color; updPrev(); }
            else toast(r?.error || 'Could not read that image', 'err');
        };

        // Insert chips land in the last-focused field inside this editor;
        // the md toolbar wraps the description textarea's selection.
        let lastField = null;
        const insAt = (el, v) => {
            const s = el.selectionStart ?? el.value.length, e2 = el.selectionEnd ?? el.value.length;
            el.value = el.value.slice(0, s) + v + el.value.slice(e2);
            el.focus(); el.setSelectionRange(s + v.length, s + v.length);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const mdWrap = (el, pre, post = pre) => {
            const s = el.selectionStart ?? 0, e2 = el.selectionEnd ?? 0;
            el.value = el.value.slice(0, s) + pre + el.value.slice(s, e2) + post + el.value.slice(e2);
            el.focus(); el.setSelectionRange(s + pre.length, e2 + pre.length);
            el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        page.addEventListener('focusin', (e) => {
            if (e.target.matches(`#${p}ecard input, #${p}ecard textarea`)) lastField = e.target;
        });
        page.addEventListener('click', (e) => {
            const chip = e.target.closest(`#${p}ecard .chip[data-ins]`);
            if (chip && lastField) insAt(lastField, chip.dataset.ins);
            const md = e.target.closest(`#${p}ecard [data-md]`);
            if (md && $(`[name=${p}e_desc]`, page)) mdWrap($(`[name=${p}e_desc]`, page), md.dataset.md);
            const mdl = e.target.closest(`#${p}ecard [data-mdlink]`);
            if (mdl && $(`[name=${p}e_desc]`, page)) mdWrap($(`[name=${p}e_desc]`, page), '[', '](https://)');
        });

        renderComps();
        $$(`.compadd [data-add]`, $(`#${p}e_cv2`, page)).forEach((b) => (b.onclick = () => {
            if (list.length >= 10) return toast('CV2 containers cap at 10 components', 'err');
            list.push({ type: b.dataset.add });
            renderComps();
        }));

        const collect = (f) => ({
            enabled: !!f[`${p}e_on`],
            style: f[`${p}e_style`],
            title: f[`${p}e_title`], description: f[`${p}e_desc`],
            color: f[`${p}e_color`], colorMode: f[`${p}e_colmode`], footer: f[`${p}e_footer`],
            thumbnail: !!f[`${p}e_thumb`], thumb: f[`${p}e_thumburl`],
            components: f[`${p}e_style`] === 'cv2' ? list.map((c) => ({ ...c })) : [],
        });

        // ---------- payload import/export ----------
        // Export shape: { kotan: 'card', card: <collect()> } — the marker lets
        // import tell kotan exports from raw Discord message payloads, which
        // get converted into our component schema on the way in.
        const COMP_KEYS = {
            text: ['text'], heading: ['text', 'big'], separator: ['size'],
            image: ['url'], section: ['text', 'image', 'btnLabel', 'btnUrl', 'big'], link: ['label', 'url'],
        };
        const sanitizeComp = (c) => {
            if (!c || typeof c !== 'object' || !COMP_KEYS[c.type]) return null;
            const o = { type: c.type };
            for (const k of COMP_KEYS[c.type]) if (c[k] !== undefined) o[k] = c[k];
            return o;
        };
        const hexCol = (n) => (/^\d+$/.test(String(n)) ? `#${Number(n).toString(16).padStart(6, '0')}` : /^#?[0-9a-f]{6}$/i.test(String(n || '')) ? `#${String(n).replace(/^#/, '')}` : '');

        // One raw Discord component object → our schema (null = drop).
        const fromDiscordComp = (c) => {
            switch (c?.type) {
                case 10: return { type: 'text', text: c.content || '' };
                case 9: {
                    const text = (c.components || []).filter((x) => x.type === 10).map((x) => x.content).join('\n');
                    const acc = c.accessory;
                    if (acc?.type === 11) return { type: 'section', text, image: acc.media?.url || '' };
                    if (acc?.type === 2 && acc.style === 5) return { type: 'section', text, btnLabel: acc.label || '', btnUrl: acc.url || '' };
                    return { type: 'section', text, image: '' };
                }
                case 12: return { type: 'image', url: c.items?.[0]?.media?.url || '' };
                case 13: return { type: 'image', url: c.file?.url || '' };
                case 14: return { type: 'separator', size: c.spacing === 2 ? 'large' : 'small' };
                default: return null;
            }
        };

        // Accepts a kotan export ({kotan:'card',card}), a bare card object, a
        // Discord message payload (embeds/CV2 container), or a lone embed —
        // returns our card shape or null when nothing recognizable.
        const cardFromPayload = (raw) => {
            if (!raw || typeof raw !== 'object') return null;
            if (raw.kotan === 'card' && raw.card && typeof raw.card === 'object') return raw.card;
            if (raw.card && typeof raw.card === 'object' && raw.card.style) return raw.card;
            if (typeof raw.style === 'string' && (raw.components !== undefined || raw.title !== undefined)) return raw;
            const card = { enabled: true, style: 'embed', components: [] };
            const cont = raw.type === 17 ? raw : (raw.components || []).find((c) => c.type === 17);
            if (cont) {
                card.style = 'cv2';
                card.color = hexCol(cont.accent_color);
                for (const c of cont.components || []) {
                    if (c.type === 1)
                        for (const b of c.components || [])
                            if (b.type === 2 && b.style === 5) card.components.push({ type: 'link', label: b.label || '', url: b.url || '' });
                    if (c.type === 17) { const inner = cardFromPayload({ components: [c] }); if (inner) card.components.push(...inner.components); }
                    const s = fromDiscordComp(c);
                    if (s) card.components.push(s);
                }
                return card;
            }
            const emb = raw.embeds?.[0] || (raw.title !== undefined || raw.description !== undefined ? raw : null);
            if (emb) {
                card.title = emb.title || '';
                card.description = emb.description || '';
                card.color = hexCol(emb.color);
                card.footer = emb.footer?.text || '';
                if (emb.thumbnail?.url) { card.thumbnail = true; card.thumb = emb.thumbnail.url; }
                return card;
            }
            if (typeof raw.content === 'string' && raw.content) { card.description = raw.content; return card; }
            return null;
        };

        const applyCard = (c) => {
            on.checked = c.enabled !== false;
            if (c.style) styleSel.value = c.style === 'cv2' ? 'cv2' : 'embed';
            modeSel.value = c.colorMode === 'dominant' || c.colorMode === 'none' ? c.colorMode : '';
            colIn.value = c.color || '';
            if (/^#?[0-9a-f]{6}$/i.test(colIn.value.trim())) colPick.value = `#${colIn.value.trim().replace(/^#/, '')}`;
            $(`[name=${p}e_title]`, page).value = c.title || '';
            $(`[name=${p}e_desc]`, page).value = c.description || '';
            $(`[name=${p}e_footer]`, page).value = c.footer || '';
            $(`[name=${p}e_thumb]`, page).checked = !!c.thumbnail;
            $(`[name=${p}e_thumburl]`, page).value = c.thumb || '';
            list.splice(0, list.length, ...(Array.isArray(c.components) ? c.components.map(sanitizeComp).filter(Boolean).slice(0, 10) : []));
            sync();
            renderComps();
            maybeFetchDom();
        };

        $(`#${p}e_exp`, page).onclick = async () => {
            const text = JSON.stringify({ kotan: 'card', card: collect(formVals(page)) }, null, 2);
            try { await navigator.clipboard.writeText(text); } catch { /* clipboard needs https — download still works */ }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            a.download = 'kotan-card.json';
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Card exported — copied to clipboard and downloaded');
        };

        $(`#${p}e_imp`, page).onclick = () => {
            const ov = document.createElement('div');
            ov.className = 'overlay';
            ov.innerHTML = `<div class="modal">
                <h3>Import card payload</h3>
                <p>Paste a kotan card export or a raw Discord message JSON, or load a .json file.</p>
                <textarea class="mono ceimp" rows="9" placeholder='{"kotan":"card","card":{…}}'></textarea>
                <div class="actions"><button class="btn" data-x>Cancel</button>
                    <button class="btn" data-file>Choose file…</button>
                    <button class="btn" data-ok>Import</button></div></div>`;
            const ta = ov.querySelector('.ceimp');
            const doImport = (text) => {
                let raw;
                try { raw = JSON.parse(text); } catch { return toast('Not valid JSON', 'err'); }
                const card = cardFromPayload(raw);
                if (!card) return toast('No card or message payload found in that JSON', 'err');
                applyCard(card);
                ov.remove();
                toast('Card imported — review it, then save');
            };
            ov.addEventListener('click', (e) => {
                if (e.target === ov || e.target.hasAttribute('data-x')) ov.remove();
                if (e.target.hasAttribute('data-ok')) doImport(ta.value.trim());
                if (e.target.hasAttribute('data-file')) {
                    const inp = document.createElement('input');
                    inp.type = 'file'; inp.accept = '.json,application/json';
                    inp.onchange = () => inp.files[0]?.text().then(doImport);
                    inp.click();
                }
            });
            document.body.appendChild(ov);
            ta.focus();
        };

        return { collect };
    }

    // ---------- pages ----------

    // The VoiceMaster control grid as pseudo-comps — identical to the
    // action rows utils/voicemaster.js attaches under the card.
    const VM_EXTRAS = [
        { type: 'buttons', labels: ['Lock', 'Unlock', 'Hide', 'Show', 'Rename'] },
        { type: 'buttons', labels: ['Limit +', 'Limit −', 'Invite', 'Trust', 'Untrust'] },
        { type: 'buttons', labels: ['Kick', 'Block', 'Unblock', 'Transfer', 'Claim'] },
        { type: 'select', label: 'Select bitrate quality…' },
    ];

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
                ping: { label: 'Bot ping', color: 'var(--accent)',
                    icon: svg('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>'),
                    val: stats.ping >= 0 ? stats.ping : '—', suffix: 'ms', series: [],
                    delta: '' },
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
                        <b>${typeof d.val === 'number' ? d.val.toLocaleString() : d.val}${d.suffix ? `<span class="muted" style="font-size:14px;font-weight:600"> ${d.suffix}</span>` : ''}</b>
                        <div class="s2s">${d.series.length ? sparkline(d.series, d.color, 400, 60) : ''}</div>
                    </div>`).join('')}</div>
                <div class="card">
                    <div class="ph"><h3>Server pulse</h3><div class="legend" id="plg">${PULSE.map((s) =>
                        `<button class="lpill${s.on ? ' on' : ''}" data-k="${s.key}"><i style="background:${s.color}"></i>${s.label}</button>`).join('')}</div></div>
                    <p class="muted small mb">Activity per day, last ${rangeDays} days — legend toggles each series</p>
                    <div id="pulse">${pulseChart(PULSE)}</div>
                </div>
                <div class="trio">
                    <div class="card"><h3>Top commands</h3>${(stats.usage?.top || []).length ? stats.usage.top.map((t) => `<div class="qitem"><span class="grow mono">${esc(t.name)}</span><span class="chip">${t.count}</span></div>`).join('') : '<p class="muted small">No commands run yet.</p>'}</div>
                    <div class="card"><h3>Recent activity</h3>${(stats.recent || []).length ? stats.recent.map((r) => `<div class="qitem"><span class="chip ${r.type === 'warn' ? 'warn' : 'danger'}">${esc(r.type)}</span><span class="grow muted">on <span class="mono">${esc(r.userId)}</span> — ${esc(r.reason || 'no reason')}</span><span class="muted small">${timeAgo(r.at)}</span></div>`).join('') : '<p class="muted small">No recent moderation actions.</p>'}</div>
                    <div class="card"><h3>Settings audit</h3>${(stats.audit || []).length ? stats.audit.map((a) => `<div class="qitem"><span class="grow"><b>${esc(a.section)}</b> <span class="muted">edited by</span> <span class="mono">${esc(a.userId)}</span></span><span class="muted small">${timeAgo(a.at)}</span></div>`).join('') : '<p class="muted small">No changes recorded yet.</p>'}</div>
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

        // Activity leaderboards — messages, voice, channels and members.
        // One fetch covers the range; filters re-render client-side.
        async activity(page) {
            const d = await api(`/api/guilds/${guildId}/activity?days=${actDays}`);
            if (d.error) throw new Error(d.error);
            const mem = d.members || {};
            const users = d.users || {};
            const chans = d.channels || {};

            // Voice totals are stored as minutes — render "Xh Ym".
            const fmtV = (mins) => (mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`);
            const boards = {
                messages: Object.entries(users).map(([id, u]) => ({ id, v: u.msg || 0 })).filter((e) => e.v > 0).sort((a, b) => b.v - a.v),
                voice: Object.entries(users).map(([id, u]) => ({ id, v: u.voice || 0 })).filter((e) => e.v > 0).sort((a, b) => b.v - a.v),
                members: Object.entries(users)
                    .map(([id, u]) => ({ id, msg: u.msg || 0, voice: u.voice || 0, v: (u.msg || 0) + (u.voice || 0) }))
                    .filter((e) => e.v > 0).sort((a, b) => b.v - a.v),
                channels: Object.entries(chans).map(([id, v]) => ({ id, v })).sort((a, b) => b.v - a.v),
            };

            const memberOk = (id) => {
                const q = actFilter.q.toLowerCase();
                const m = mem[id];
                if (actFilter.roles.length && !(m?.roles || []).some((r) => actFilter.roles.includes(r))) return false;
                if (!q) return true;
                return id.includes(q) || (m?.name || '').toLowerCase().includes(q) || (m?.user || '').toLowerCase().includes(q);
            };
            const chanOk = (id) => {
                const q = actFilter.q.toLowerCase();
                return !q || id.includes(q) || chName(id).toLowerCase().includes(q);
            };

            const avatar = (id) => {
                const m = mem[id];
                return m?.avatar
                    ? `<img class="lbav" src="${m.avatar}" alt="" loading="lazy">`
                    : `<span class="lbav no">${esc((m?.name || m?.user || '?')[0].toUpperCase())}</span>`;
            };
            const urow = (e, i, val) => {
                const m = mem[e.id] || {};
                const shown = m.name || m.user || e.id;
                return `<div class="lbrow"><span class="rank">${i + 1}</span>${avatar(e.id)}
                    <span class="lbname" title="${esc(e.id)}">${esc(shown)}${m.user && shown !== m.user ? `<span class="lbtag">@${esc(m.user)}</span>` : ''}</span>
                    <span class="lbval">${val}</span></div>`;
            };
            const crow = (e, i) => `<div class="lbrow"><span class="rank">${i + 1}</span><span class="lbav chan">#</span>
                <span class="lbname" title="${esc(e.id)}">${esc(chName(e.id))}</span>
                <span class="lbval">${e.v.toLocaleString()} msgs</span></div>`;

            const BOXES = [
                { key: 'messages', title: 'Messages', rows: () => boards.messages.filter((e) => memberOk(e.id)), row: (e, i) => urow(e, i, e.v.toLocaleString()) },
                { key: 'voice', title: 'Voice', rows: () => boards.voice.filter((e) => memberOk(e.id)), row: (e, i) => urow(e, i, fmtV(e.v)) },
                { key: 'channels', title: 'Channels', rows: () => boards.channels.filter((e) => chanOk(e.id)), row: crow },
                { key: 'members', title: 'Members', rows: () => boards.members.filter((e) => memberOk(e.id)), row: (e, i) => urow(e, i, `${e.msg.toLocaleString()} msgs · ${fmtV(e.voice)}`) },
            ];

            page.innerHTML = `
                <div><div class="page-title">Activity</div>
                    <p class="page-desc">Who's active and where — every message, voice minute, join and leave is counted live.</p></div>
                <div class="card actbar">
                    <input type="text" id="actq" placeholder="Filter by name or ID…" value="${esc(actFilter.q)}">
                    ${selSlot('actroles')}
                    <div class="rpills">${[7, 14, 30, 90].map((dd) => `<button class="rpill${dd === actDays ? ' on' : ''}" data-d="${dd}">${dd}d</button>`).join('')}</div>
                </div>
                <div class="actgrid">${BOXES.map((b) => `
                    <div class="card actbox">
                        <div class="ph"><h3>${b.title}</h3>${b.key === 'members' ? `<span class="muted small">+${d.joins || 0} joined · −${d.leaves || 0} left</span>` : ''}</div>
                        <div class="lrows" data-box="${b.key}"></div>
                        <button class="seeall" data-see="${b.key}">See all</button>
                    </div>`).join('')}
                </div>`;

            const rolesel = mountSelect(page, 'actroles', { multi: true, options: roOpts(DATA.roles), value: actFilter.roles, placeholder: 'All roles' });

            const renderBoxes = () => {
                for (const b of BOXES) {
                    const rows = b.rows();
                    $(`[data-box="${b.key}"]`, page).innerHTML = rows.length
                        ? rows.slice(0, 10).map(b.row).join('')
                        : '<div class="empty-state">No activity in this range yet</div>';
                    $(`[data-see="${b.key}"]`, page).textContent = `See all (${rows.length})`;
                }
            };

            const seeAll = (key) => {
                const b = BOXES.find((x) => x.key === key);
                const rows = b.rows();
                const ov = document.createElement('div');
                ov.className = 'overlay';
                ov.innerHTML = `<div class="modal actmodal">
                    <div class="ph"><h3>${b.title} · last ${actDays} days</h3><span class="chip">${rows.length}</span></div>
                    <div class="lrows modal-lrows">${rows.length ? rows.map(b.row).join('') : '<div class="empty-state">No activity in this range yet</div>'}</div>
                    <div class="actions"><button class="btn" data-x>Close</button></div></div>`;
                ov.addEventListener('click', (e) => { if (e.target === ov || e.target.hasAttribute('data-x')) ov.remove(); });
                document.body.appendChild(ov);
            };

            $('#actq', page).oninput = (e) => { actFilter.q = e.target.value.trim(); renderBoxes(); };
            rolesel?.addEventListener('change', () => { actFilter.roles = rolesel.get(); renderBoxes(); });
            $$('.rpill', page).forEach((b) => (b.onclick = () => { actDays = +b.dataset.d; PAGES.activity(page); }));
            $$('.seeall', page).forEach((b) => (b.onclick = () => seeAll(b.dataset.see)));
            renderBoxes();
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
                <div class="card"><h3>Channel gates</h3><p class="sub mb">Limit a module to specific channels. Empty = works everywhere.</p>
                    <div id="changates">${CTX.modules.map((m) => `<div class="modrow"><div class="mi"><b>${esc(m.label)}</b></div><div style="min-width:240px;flex:0 0 280px">${selSlot(`cg_${m.id}`)}</div></div>`).join('')}</div></div>`;
            CTX.modules.forEach((m) => mountSelect(page, `rg_${m.id}`, { multi: true, options: roOpts(DATA.roles), value: s.moduleRoles[m.id] || [], placeholder: 'Everyone' }));
            CTX.modules.forEach((m) => mountSelect(page, `cg_${m.id}`, { multi: true, options: chOpts(DATA.channels), value: s.moduleChannels?.[m.id] || [], placeholder: 'Everywhere' }));
            bindSave(page, 'modules', (el) => {
                const f = formVals(el);
                const modules = {}; modIds.forEach((id) => (modules[id] = !!f[`mod_${id}`]));
                const moduleRoles = {}; CTX.modules.forEach((m) => (moduleRoles[m.id] = mounts[`rg_${m.id}`].get()));
                const moduleChannels = {}; CTX.modules.forEach((m) => (moduleChannels[m.id] = mounts[`cg_${m.id}`].get()));
                return { modules, moduleRoles, moduleChannels };
            });
        },

        async commands(page) {
            const s = CTX.settings;
            const rules = [...(s.commandRules || [])];
            page.innerHTML = `
                <div><div class="page-title">Commands</div><p class="page-desc">Toggle individual commands, or scope them by channel/time window.</p></div>
                <div class="card"><h3>Enabled commands</h3><div class="cmd-grid" style="grid-template-columns:1fr">${CTX.commands.map((c) => `
                    <div class="modrow"><div class="mi"><b>${esc(c.name)}</b> <code>${esc(c.module)}</code><p>${esc(c.description)}</p></div>
                    ${tgl(`cmd_${c.name}`, '', !(s.disabledCommands || []).includes(c.name))}</div>`).join('')}</div></div>
                <div class="card"><h3>Scoped rules</h3><p class="sub mb">Block a command in a channel and/or during a daily time window (HH:MM, server local time).</p>
                    <div id="rules"></div>
                    <button class="btn sm mt" id="add-rule">+ Add rule</button></div>`;

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

        async triggers(page) {
            const known = new Set(CTX.commands.map((c) => c.name));
            page.innerHTML = `
                <div><div class="page-title">Triggers</div><p class="page-desc">Bare words that run a command — no prefix needed. Typing <code class="mono">balance</code> can run <code class="mono">.balance</code>.</p></div>
                <div class="card"><h3>New trigger</h3>
                    <div class="grid2">
                        ${fldHtml('Trigger word', txtIn('tname', '', 'e.g. balance'), 'any characters except spaces and slashes — can\'t start with the prefix, max 32')}
                        ${fldHtml('Command', selSlot('tcmd'), 'the command it runs')}
                    </div>
                    ${fldHtml('Arguments', txtIn('targs', '', 'optional — e.g. @user 100'), 'fixed args passed before whatever the sender types next')}
                    <div class="mt"><button class="btn primary sm" id="add-tag">Create trigger</button></div></div>
                <div class="card"><h3>Triggers</h3><div id="taglist"><div class="skeleton" style="height:60px"></div></div></div>`;
            mountSelect(page, 'tcmd', { options: CTX.commands.map((c) => ({ value: c.name, label: `${c.name} — ${(c.description || '').slice(0, 40)}` })), placeholder: 'Pick a command' });
            const load = async () => {
                const d = await api(`/api/guilds/${guildId}/tags`);
                const tags = Object.entries(d.tags || {});
                $('#taglist', page).innerHTML = tags.length ? tags.map(([n, t]) => {
                    const [cname, ...cargs] = String(t.content).split(/\s+/);
                    const isCmd = t.trigger && known.has(cname?.toLowerCase());
                    const desc = t.trigger
                        ? (isCmd ? `runs <b class="mono">${esc(cname)}</b>${cargs.length ? ` ${esc(cargs.join(' '))}` : ''}` : `replies: ${esc(String(t.content).slice(0, 80))}`)
                        : esc(String(t.content).slice(0, 80));
                    return `<div class="qitem"><div class="grow"><b class="mono">${esc(n)}</b><div class="muted">${desc}</div></div>
                        <span class="chip ${t.trigger ? 'ok' : ''}">${t.trigger ? 'bare word' : 'prefix'}</span>
                        <span class="chip">${t.uses || 0} uses</span><button class="btn sm danger" data-del="${esc(n)}">Delete</button></div>`;
                }).join('') : '<p class="muted small">No triggers yet.</p>';
                $$('#taglist [data-del]', page).forEach((b) => (b.onclick = async () => {
                    if (!(await confirmModal('Delete trigger', `Remove "${b.dataset.del}"?`))) return;
                    const r = await api(`/api/guilds/${guildId}/tags/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' });
                    r.ok ? (toast('Trigger deleted'), load()) : toast('Delete failed', 'err');
                }));
            };
            $('#add-tag', page).onclick = async () => {
                const name = $('[name=tname]', page).value.trim();
                const cmd = mounts.tcmd.get();
                const args = $('[name=targs]', page).value.trim();
                if (!cmd) return toast('Pick a command', 'err');
                const r = await api(`/api/guilds/${guildId}/tags`, { body: { name, content: `${cmd} ${args}`.trim(), trigger: true } });
                if (r.ok) { toast('Trigger created'); $('[name=tname]', page).value = ''; $('[name=targs]', page).value = ''; mounts.tcmd.set(''); load(); }
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
                <div class="card"><h3>Whitelist</h3><p class="sub mb">Automod never scans these channels, and never flags members holding these roles — applies to every check above.</p>
                    <div class="grid2">
                        ${fldHtml('Exempt channels', selSlot('amch'), 'empty = all channels scanned')}
                        ${fldHtml('Exempt roles', selSlot('amroles'), 'empty = everyone checked')}
                    </div></div>`;
            mountSelect(page, 'amch', { multi: true, options: chOpts(DATA.channels), value: a.exemptChannels || [], placeholder: 'All channels' });
            mountSelect(page, 'amroles', { multi: true, options: roOpts(DATA.roles), value: a.exemptRoles || [], placeholder: 'Everyone' });
            bindSave(page, 'automod', (el) => {
                const f = formVals(el);
                return {
                    antiInvite: !!f.antiInvite,
                    blacklist: String(f.blacklist || '').split('\n').map((w) => w.trim()).filter(Boolean),
                    spamMax: +f.spamMax || 0, spamWindow: +f.spamWindow || 5,
                    raidMax: +f.raidMax || 0, raidWindow: +f.raidWindow || 10, raidAction: f.raidAction || 'alert',
                    exemptChannels: mounts.amch.get(), exemptRoles: mounts.amroles.get(),
                };
            });
        },

        async logging(page) {
            const s = CTX.settings;
            const l = s.logging;
            // Every loggable event, grouped — each row has a toggle and a
            // per-event channel override (empty = default channel).
            const LOG_GROUPS = [
                ['Messages', [
                    ['messageDelete', 'Message deletions'], ['messageEdit', 'Message edits'], ['bulkDelete', 'Bulk purges'],
                ]],
                ['Members', [
                    ['memberJoin', 'Member joins'], ['memberLeave', 'Member leaves'],
                    ['memberUpdate', 'Role/nickname changes'], ['banAdd', 'Bans'], ['banRemove', 'Unbans'],
                ]],
                ['Channels', [
                    ['channelCreate', 'Channel created'], ['channelDelete', 'Channel deleted'], ['channelUpdate', 'Channel updated'],
                    ['threadCreate', 'Thread created'], ['threadDelete', 'Thread deleted'],
                ]],
                ['Roles & server', [
                    ['roleCreate', 'Role created'], ['roleDelete', 'Role deleted'], ['roleUpdate', 'Role updated'],
                    ['emojiCreate', 'Emoji added'], ['emojiDelete', 'Emoji removed'],
                    ['inviteCreate', 'Invite created'], ['inviteDelete', 'Invite deleted'], ['voiceState', 'Voice join/leave/move'],
                ]],
            ];
            const ALL_EVENTS = LOG_GROUPS.flatMap(([, es]) => es);
            // Per-event flags, falling back to the old grouped toggles.
            const legacy = {
                messageDelete: l.messageDelete, messageEdit: l.messageEdit, bulkDelete: l.messageDelete,
                memberJoin: l.joinLeave, memberLeave: l.joinLeave,
                channelCreate: l.channelEvents, channelDelete: l.channelEvents,
            };
            const isOn = (k) => l.events?.[k] ?? legacy[k] ?? false;
            page.innerHTML = `
                <div><div class="page-title">Logging</div><p class="page-desc">Every event can be toggled and routed to its own channel.</p></div>
                <div class="card"><h3>Channels</h3><div class="grid2">
                    ${fldHtml('Default log channel', selSlot('logch'), 'events without an override post here — empty = off')}
                    ${fldHtml('Mod-log channel', selSlot('modlog'), 'warns, bans and automod alerts post here')}
                </div></div>
                ${LOG_GROUPS.map(([group, events]) => `
                <div class="card"><h3>${group}</h3>
                    ${events.map(([k, label]) => `
                        <div class="evrow">
                            <div class="evl">${tgl(`ev_${k}`, label, isOn(k))}</div>
                            <div class="evc">${selSlot(`lc_${k}`)}</div>
                        </div>`).join('')}
                </div>`).join('')}`;
            mountSelect(page, 'logch', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: l.channel || '', placeholder: 'Off' });
            mountSelect(page, 'modlog', { options: [{ value: '', label: 'Disabled' }, ...chOpts(DATA.channels)], value: s.modlogChannel || '', placeholder: 'Disabled' });
            ALL_EVENTS.forEach(([k]) =>
                mountSelect(page, `lc_${k}`, { options: [{ value: '', label: 'Default' }, ...chOpts(DATA.channels)], value: l.channels?.[k] || '', placeholder: 'Default' }));
            bindSave(page, 'logging', (el) => {
                const f = formVals(el);
                const events = {}, channels = {};
                ALL_EVENTS.forEach(([k]) => {
                    events[k] = !!f[`ev_${k}`];
                    const v = mounts[`lc_${k}`].get();
                    if (v) channels[k] = v;
                });
                return {
                    channel: mounts.logch.get() || null,
                    modlogChannel: mounts.modlog.get() || null,
                    events, channels,
                };
            });
        },

        async welcome(page) {
            const w = CTX.settings.welcome;
            const embedEditor = cardEditorHtml;

            page.innerHTML = `
                <div><div class="page-title">Welcome &amp; Goodbye</div><p class="page-desc">Greet new members and note departures. Placeholders: <code class="mono">{user}</code> <code class="mono">{username}</code> <code class="mono">{server}</code> <code class="mono">{members}</code></p></div>
                <div class="card"><h3>Welcome</h3>
                    ${fldHtml('Channel', selSlot('wch'), 'empty = off')}
                    ${fldHtml('Message', txtArea('wmsg', w.message), 'sent when the card below is disabled')}
                    <div class="preview" id="wprev"></div>
                    ${embedEditor('w', w.embed)}
                </div>
                ${imgEditorHtml('w', w.image)}
                <div class="card"><h3>Goodbye</h3>
                    ${fldHtml('Channel', selSlot('gch'), 'empty = off')}
                    ${fldHtml('Message', txtArea('gmsg', w.goodbyeMessage), 'sent when the card below is disabled')}
                    <div class="preview" id="gprev"></div>
                    ${embedEditor('g', w.goodbyeEmbed)}
                </div>`;

            mountSelect(page, 'wch', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: w.channel || '', placeholder: 'Off' });
            mountSelect(page, 'gch', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: w.goodbyeChannel || '', placeholder: 'Off' });

            const fill = (tpl) => esc(tpl).replaceAll('{user}', `<span class="puser">@${esc(CTX.user.username)}</span>`).replaceAll('{username}', esc(CTX.user.username)).replaceAll('{server}', esc(CTX.guild.name)).replaceAll('{members}', String(CTX.guild.memberCount));
            const upd = () => { $('#wprev', page).innerHTML = fill($('[name=wmsg]', page).value); $('#gprev', page).innerHTML = fill($('[name=gmsg]', page).value); };
            $$('[name=wmsg],[name=gmsg]', page).forEach((t) => (t.oninput = upd)); upd();

            const cardW = setupCardEditor(page, 'w', w.embed);
            const cardG = setupCardEditor(page, 'g', w.goodbyeEmbed);
            const imgedW = setupImageEditor(page, 'w', w.image);
            mountSelect(page, 'wimg_tch', { options: [{ value: '', label: 'Pick a channel…' }, ...chOpts(DATA.channels)], value: '', placeholder: 'Pick a channel…' });
            $('#wimg_test', page).onclick = async (e) => {
                const status = $('#wimg_tstat', page);
                const channel = mounts.wimg_tch.get();
                if (!channel) { status.textContent = '— pick a channel first'; return; }
                e.target.disabled = true;
                const f = formVals(page);
                const r = await api(`/api/guilds/${guildId}/welcome/test`, {
                    body: { channel, message: f.wmsg, embed: cardW.collect(f), image: imgedW.collect(f) },
                }).catch(() => null);
                e.target.disabled = false;
                status.textContent = r?.ok ? '— sent!' : `— ${r?.error || 'failed'}`;
            };
            bindSave(page, 'welcome', (el) => {
                const f = formVals(el);
                return {
                    channel: mounts.wch.get() || null, goodbyeChannel: mounts.gch.get() || null,
                    message: f.wmsg, goodbyeMessage: f.gmsg,
                    embed: cardW.collect(f), goodbyeEmbed: cardG.collect(f),
                    image: imgedW.collect(f),
                };
            });
        },



        async afk(page) {
            const a = CTX.settings.afk || {};
            page.innerHTML = `
                <div><div class="page-title">AFK</div><p class="page-desc">Members go away with <code class="mono">.afk</code> or <code class="mono">/afk</code> — pinging them announces it, and <code class="mono">.afk pings</code> shows who tried. Placeholders: <code class="mono">{user}</code> <code class="mono">{username}</code> <code class="mono">{message}</code> <code class="mono">{ago}</code> <code class="mono">{channel}</code></p></div>
                <div class="card"><h3>Behavior</h3>
                    ${tgl('a_on', 'AFK enabled', a.enabled !== false)}
                    ${fldHtml('Default message', txtIn('a_def', a.defaultMessage || 'AFK'), 'used by a bare .afk with no text')}
                    ${fldHtml('Announcement', txtIn('a_ann', a.announce || ''), 'reply when an AFK member gets pinged — {user} {message} {ago} {channel}')}
                    ${tgl('a_clear', 'Welcome-back notice', a.selfClear !== false)}
                </div>
                <div class="card"><h3>Permissions</h3>
                    ${fldHtml('Allowed roles', selSlot('a_roles'), 'members need one of these — empty = everyone')}
                    ${fldHtml('Silent channels', selSlot('a_ch'), 'mentions here never announce AFK status')}
                </div>
                <div class="card"><h3>Announcement card</h3>
                    <p class="sub mb">Rich card replacing the plain announcement line — the same editor as Welcome.</p>
                    ${cardEditorHtml('afk', a.card || {})}
                </div>`;

            mountSelect(page, 'a_roles', { multi: true, options: roOpts(DATA.roles), value: a.roles || [], placeholder: 'Everyone' });
            mountSelect(page, 'a_ch', { multi: true, options: chOpts(DATA.channels), value: a.exemptChannels || [], placeholder: 'None' });
            const card = setupCardEditor(page, 'afk', a.card || {});
            bindSave(page, 'afk', (el) => {
                const f = formVals(el);
                return {
                    enabled: f.a_on, defaultMessage: f.a_def, announce: f.a_ann,
                    selfClear: f.a_clear,
                    roles: mounts.a_roles.get(), exemptChannels: mounts.a_ch.get(),
                    card: card.collect(f),
                };
            });
        },

        async roles(page) {
            const r = CTX.settings.roles;
            const rrs = [...(r.reactionRoles || [])];
            page.innerHTML = `
                <div><div class="page-title">Roles</div><p class="page-desc">Automatic and reaction-based role assignment.</p></div>
                <div class="card"><h3>Autorole</h3>${fldHtml('Role granted on join', selSlot('autorole'), 'empty = off')}</div>
                <div class="card"><h3>Reaction roles</h3><p class="sub mb">Members who react with the emoji get the role.</p>
                    <div id="rrs"></div><button class="btn sm mt" id="add-rr">+ Add reaction role</button></div>`;
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

        async leveling(page) {
            const s = CTX.settings;
            const rewards = [...(s.leveling.rewards || [])];
            page.innerHTML = `
                <div><div class="page-title">Leveling</div><p class="page-desc">XP rates, level-up announcements, and role rewards.</p></div>
                <div class="card"><h3>XP</h3>
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
                    <button class="btn sm mt" id="add-rw">+ Add reward</button></div>`;
            mountSelect(page, 'lvch', { options: [{ value: '', label: 'Same channel' }, ...chOpts(DATA.channels)], value: s.leveling.channel || '', placeholder: 'Same channel' });
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
            bindSave(page, 'leveling', (el) => {
                const f = formVals(el);
                return {
                    enabled: !!f.lv_on, announce: !!f.lv_announce,
                    xpMin: +f.xpMin || 15, xpMax: +f.xpMax || 25, cooldown: +f.cooldown || 60, multiplier: +f.multiplier || 1,
                    channel: mounts.lvch.get() || null, message: f.lvmsg,
                    rewards: rewards.map((x, i) => ({ level: +f[`rl_${i}`] || 0, roleId: mounts[`rlr_${i}`]?.get() })),
                };
            });
        },

        async economy(page) {
            const s = CTX.settings;
            const items = [...(s.economy.shop || [])];
            page.innerHTML = `
                <div><div class="page-title">Economy</div><p class="page-desc">Currency, daily rewards, and the item shop.</p></div>
                <div class="card"><h3>Currency</h3><div class="grid2">
                    ${fldHtml('Currency name', txtIn('currency', s.economy.currency || ''), 'empty = default "coins"')}
                    ${fldHtml('Starting balance', numIn('startBalance', s.economy.startBalance, 0, 10000000), 'wallet for new members')}
                    ${fldHtml('Pay cap', numIn('payMax', s.economy.payMax, 1, 300000), 'max per payment — empty = 100,000, up to 300,000')}
                </div></div>
                <div class="card"><h3>Daily reward</h3><div class="grid2">
                    ${fldHtml('Base reward', numIn('dailyBase', s.economy.dailyBase, 0, 1000000), 'empty = 500')}
                    ${fldHtml('Streak bonus / day', numIn('dailyStreak', s.economy.dailyStreak, 0, 1000000), 'empty = 100')}
                    ${fldHtml('Max streak bonus', numIn('dailyMaxStreak', s.economy.dailyMaxStreak, 0, 10000000), 'empty = 1000')}
                </div></div>
                <div class="card"><h3>Shop items</h3><p class="sub mb">Your server's catalog — empty uses the built-in shop (cookie, coffee, ticket, gem, VIP).</p>
                    <div id="shopitems"></div><button class="btn sm mt" id="add-item">+ Add item</button></div>`;
            const siEl = $('#shopitems', page);
            const renderItems = () => {
                siEl.innerHTML = items.map((x, i) => `
                    <div class="modrow">
                        <input type="text" name="sn_${i}" value="${esc(x.name || '')}" placeholder="Item name" style="flex:0 0 160px">
                        <input type="number" name="sp_${i}" value="${x.price || ''}" placeholder="Price" min="1" style="flex:0 0 110px">
                        <input type="text" name="sd_${i}" value="${esc(x.description || '')}" placeholder="Description" class="grow">
                        <button class="btn sm danger" data-del="${i}">✕</button></div>`).join('') || '<p class="muted small">No custom items — the built-in shop is used.</p>';
                $$('#shopitems [data-del]', page).forEach((b) => (b.onclick = () => { items.splice(+b.dataset.del, 1); renderItems(); }));
            };
            renderItems();
            $('#add-item', page).onclick = () => { items.push({ name: '', price: '', description: '' }); renderItems(); };
            bindSave(page, 'economy', (el) => {
                const f = formVals(el);
                return {
                    currency: f.currency, startBalance: f.startBalance, payMax: f.payMax,
                    dailyBase: f.dailyBase, dailyStreak: f.dailyStreak, dailyMaxStreak: f.dailyMaxStreak,
                    shop: items.map((x, i) => ({ name: f[`sn_${i}`], price: +f[`sp_${i}`] || 0, description: f[`sd_${i}`] })),
                };
            });
        },

        async shop(page) {
            const s = CTX.settings.shop || {};
            // Live editor model — DOM rows mirror this array; collect() reads
            // the DOM back into payload shape so re-renders never lose input.
            const state = { sections: (s.sections || []).map((c) => ({ name: c.name || '', items: (c.items || []).map((i) => ({ ...i })) })) };

            const TYPE_OPTS = [
                { value: 'item', label: 'Item — collectible (lands in inventory)' },
                { value: 'role', label: 'Role — granted on buy' },
                { value: 'multiplier', label: 'Booster — timed coins/XP multiplier' },
                { value: 'crate', label: 'Crate — random drop per buy' },
            ];

            page.innerHTML = `
                <div><div class="page-title">Shop</div><p class="page-desc">Storefront text, custom sections, and per-item behavior.</p></div>
                <div class="card"><h3>Storefront</h3>
                    <div class="mb">${tgl('shop_on', 'Enable the shop', s.enabled !== false)}</div>
                    <div class="grid2">
                        ${fldHtml('Title', txtIn('shop_title', s.title, 'Shop'))}
                        ${fldHtml('Accent color', `<div class="clrrow"><input type="color" name="shop_pick" value="${esc(s.color || '#5865f2')}"><input type="text" name="shop_color" value="${esc(s.color || '')}" placeholder="#5865f2 — empty = default"></div>`)}
                    </div>
                    ${fldHtml('Description', txtIn('shop_desc', s.description), 'shown under the title when /shop opens')}
                </div>
                <div id="shopsecs"></div>
                <button class="btn sm" id="add-sec">+ Add section</button>
                <p class="muted small" style="margin-top:10px">Item ids are the shop's keys — <b>Item</b> entries land in inventory under their id
                    (e.g. <code class="mono">cookie</code>), <code class="mono">.shop buy &lt;id&gt;</code> purchases directly, and crates drop ids from their pool.</p>`;

            const pick = $('[name=shop_pick]', page), hex = $('[name=shop_color]', page);
            pick.oninput = () => (hex.value = pick.value);
            hex.oninput = () => { if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) pick.value = hex.value; };

            const itemRow = (x, si, ii) => {
                const p = `it_${si}_${ii}`;
                return `<div class="modrow shoprow" data-type="${esc(x.type || 'item')}">
                    ${selSlot(`${p}_t`)}
                    <input type="text" name="${p}_name" value="${esc(x.name || '')}" placeholder="Item name" style="flex:0 0 130px">
                    <input type="number" name="${p}_price" value="${x.price ?? ''}" placeholder="Price" min="0" style="flex:0 0 80px">
                    <input type="text" name="${p}_id" value="${esc(x.id || '')}" placeholder="id (auto)" title="Unique key — inventory entry, .shop buy <id>, crate pool reference" style="flex:0 0 110px">
                    <input type="text" name="${p}_desc" value="${esc(x.desc || '')}" placeholder="Description" class="grow">
                    <span data-fx="role">${selSlot(`${p}_role`)}</span>
                    <span data-fx="multiplier" style="display:contents">
                        ${selSlot(`${p}_kind`)}
                        <input type="number" name="${p}_mult" value="${x.mult ?? ''}" placeholder="×2" min="1" step="0.1" style="width:70px" title="Multiplier">
                        <input type="number" name="${p}_mins" value="${x.mins ?? ''}" placeholder="mins" min="1" style="width:80px" title="Duration (minutes)">
                    </span>
                    <span data-fx="crate" style="display:contents"><input type="text" name="${p}_pool" value="${esc(Array.isArray(x.pool) ? x.pool.join(', ') : x.pool || '')}" placeholder="cookie, gem, 50-200" style="min-width:180px" title="Comma-separated drops — item ids or coin amounts/ranges"></span>
                    <button class="btn sm" data-mv="-1" title="Move up">↑</button>
                    <button class="btn sm" data-mv="1" title="Move down">↓</button>
                    <button class="btn sm danger" data-del title="Remove">✕</button>
                </div>`;
            };

            const secCard = (c, si) => `
                <div class="card" data-sec="${si}">
                    <div class="modrow" style="margin-bottom:10px">
                        <input type="text" name="sec_${si}_name" value="${esc(c.name || '')}" placeholder="Section name" class="grow">
                        <button class="btn sm" data-smv="-1" title="Move up">↑</button>
                        <button class="btn sm" data-smv="1" title="Move down">↓</button>
                        <button class="btn sm danger" data-sdel title="Delete section">✕</button>
                    </div>
                    ${c.items.map((x, ii) => itemRow(x, si, ii)).join('') || '<p class="muted small">No items in this section yet.</p>'}
                    <button class="btn sm mt" data-additem>+ Add item</button>
                </div>`;

            const syncFx = (row) => {
                const t = row.dataset.type;
                row.querySelectorAll('[data-fx]').forEach((el) => { el.style.display = el.dataset.fx === t ? 'contents' : 'none'; });
            };

            const secsEl = $('#shopsecs', page);
            const render = () => {
                secsEl.innerHTML = state.sections.map(secCard).join('')
                    || '<div class="card"><p class="muted small">No sections — add one below to start selling.</p></div>';
                state.sections.forEach((c, si) => {
                    const card = secsEl.querySelector(`[data-sec="${si}"]`);
                    const rows = card.querySelectorAll('.shoprow');
                    c.items.forEach((x, ii) => {
                        const p = `it_${si}_${ii}`;
                        const row = rows[ii];
                        mountSelect(page, `${p}_t`, { options: TYPE_OPTS, value: x.type || 'item' });
                        mounts[`${p}_t`].addEventListener('change', () => {
                            row.dataset.type = mounts[`${p}_t`].get() || 'item';
                            syncFx(row);
                        });
                        mountSelect(page, `${p}_role`, { options: roOpts(DATA.roles), value: x.roleId, placeholder: 'Role…' });
                        mountSelect(page, `${p}_kind`, { options: [{ value: 'coins', label: 'Coins' }, { value: 'xp', label: 'XP / Levels' }], value: x.kind || 'coins' });
                        syncFx(row);
                    });
                });
            };

            // Read the live DOM into payload shape — used both by bindSave and
            // to checkpoint state before any structural re-render.
            const collect = () => {
                const f = formVals(page);
                const sections = [];
                $$('#shopsecs [data-sec]', page).forEach((card, si) => {
                    const items = [];
                    $$('.shoprow', card).forEach((row, ii) => {
                        const p = `it_${si}_${ii}`;
                        const type = mounts[`${p}_t`]?.get() || 'item';
                        const it = {
                            id: String(f[`${p}_id`] || '').trim(),
                            name: f[`${p}_name`],
                            desc: f[`${p}_desc`],
                            price: +f[`${p}_price`] || 0,
                            type,
                        };
                        if (type === 'role') it.roleId = mounts[`${p}_role`]?.get() || '';
                        else if (type === 'multiplier') { it.kind = mounts[`${p}_kind`]?.get() || 'coins'; it.mult = +f[`${p}_mult`] || 2; it.mins = +f[`${p}_mins`] || 60; }
                        else if (type === 'crate') it.pool = String(f[`${p}_pool`] || '').split(',').map((t) => t.trim()).filter(Boolean);
                        items.push(it);
                    });
                    sections.push({ name: f[`sec_${si}_name`], items });
                });
                return {
                    enabled: !!f.shop_on, title: f.shop_title, description: f.shop_desc, color: f.shop_color,
                    sections,
                };
            };
            const sync = () => { state.sections = collect().sections; };

            render();
            $('#add-sec', page).onclick = () => {
                sync();
                if (state.sections.length >= 10) return; // sane cap — menu fits 25 but pages get unwieldy
                state.sections.push({ name: '', items: [] });
                render();
            };
            secsEl.addEventListener('click', (e) => {
                const btn = e.target.closest('button');
                if (!btn) return;
                const card = btn.closest('[data-sec]');
                const si = +card.dataset.sec;
                if (btn.hasAttribute('data-additem')) {
                    sync();
                    if (state.sections[si].items.length >= 7) return; // CV2 container cap
                    state.sections[si].items.push({ type: 'item' });
                    render();
                } else if (btn.hasAttribute('data-sdel')) {
                    sync(); state.sections.splice(si, 1); render();
                } else if (btn.hasAttribute('data-smv')) {
                    sync();
                    const j = si + +btn.dataset.smv;
                    if (j < 0 || j >= state.sections.length) return;
                    [state.sections[si], state.sections[j]] = [state.sections[j], state.sections[si]];
                    render();
                } else if (btn.hasAttribute('data-del')) {
                    const ii = [...card.querySelectorAll('.shoprow')].indexOf(btn.closest('.shoprow'));
                    sync(); state.sections[si].items.splice(ii, 1); render();
                } else if (btn.hasAttribute('data-mv')) {
                    const items = state.sections[si].items;
                    const ii = [...card.querySelectorAll('.shoprow')].indexOf(btn.closest('.shoprow'));
                    const j = ii + +btn.dataset.mv;
                    if (j < 0 || j >= items.length) return;
                    sync();
                    [items[ii], items[j]] = [items[j], items[ii]];
                    render();
                }
            });

            bindSave(page, 'shop', collect);
        },

        async games(page) {
            const g = CTX.settings.games;
            const per = g.per || {};
            // Wager games take a bet and pay scaled by a multiplier; reward
            // games pay a flat prize. Empty per-game fields inherit defaults.
            const WAGER = [
                ['coinflip', 'Coinflip'], ['slots', 'Slots'], ['rps', 'Rock Paper Scissors'],
                ['roll', 'Dice Duel'], ['hilo', 'Higher or Lower'],
            ];
            const REWARD = [
                ['guess', 'Number Guess'], ['scramble', 'Word Scramble'],
            ];
            const perIn = (game, key) => `<input type="number" name="gp_${game}_${key}" value="${per[game]?.[key] ?? ''}" min="0" placeholder="default">`;
            page.innerHTML = `
                <div><div class="page-title">Games</div><p class="page-desc">Wagers and rewards — global defaults, plus a per-game override below.</p></div>
                <div class="card"><h3>Defaults</h3><p class="sub mb">Applied to every game unless it has an override below.</p><div class="grid2">
                    ${fldHtml('Guess reward', numIn('guessReward', g.guessReward, 0, 10000000), 'number guess win')}
                    ${fldHtml('Scramble reward', numIn('scrambleReward', g.scrambleReward, 0, 10000000), 'first correct answer')}
                    ${fldHtml('Win multiplier', numIn('winMultiplier', g.winMultiplier, 0, 100), 'scales wager wins — 1 = normal')}
                    ${fldHtml('Max bet', numIn('maxBet', g.maxBet, 0, 100000000), 'wager cap — 0 = unlimited')}
                </div></div>
                ${WAGER.map(([k, label]) => `
                <div class="card"><h3>${label}</h3><div class="grid2">
                    ${fldHtml('Max bet', perIn(k, 'maxBet'), 'wager cap — empty = use default')}
                    ${fldHtml('Win multiplier', perIn(k, 'winMultiplier'), 'payout scale — empty = use default')}
                </div></div>`).join('')}
                ${REWARD.map(([k, label]) => `
                <div class="card"><h3>${label}</h3><div class="grid2">
                    ${fldHtml('Reward', perIn(k, 'reward'), 'coins per win — empty = use default')}
                </div></div>`).join('')}`;
            bindSave(page, 'games', (el) => {
                const f = formVals(el);
                const perOut = {};
                [...WAGER, ...REWARD].forEach(([k]) => {
                    const entry = {};
                    if (f[`gp_${k}_reward`] !== '' && f[`gp_${k}_reward`] !== undefined) entry.reward = +f[`gp_${k}_reward`];
                    if (f[`gp_${k}_maxBet`] !== '' && f[`gp_${k}_maxBet`] !== undefined) entry.maxBet = +f[`gp_${k}_maxBet`];
                    if (f[`gp_${k}_winMultiplier`] !== '' && f[`gp_${k}_winMultiplier`] !== undefined) entry.winMultiplier = +f[`gp_${k}_winMultiplier`];
                    if (Object.keys(entry).length) perOut[k] = entry;
                });
                return {
                    guessReward: +f.guessReward || 0, scrambleReward: +f.scrambleReward || 0,
                    winMultiplier: +f.winMultiplier || 0, maxBet: +f.maxBet || 0,
                    per: perOut,
                };
            });
        },

        async tickets(page) {
            const t = CTX.settings.tickets || {};
            const topics = [...(t.topics || [])];
            page.innerHTML = `
                <div><div class="page-title">Tickets</div><p class="page-desc">Members pick a topic on the panel — a private channel opens under your category.</p></div>
                <div class="card"><h3>Setup</h3>
                    <div class="mb">${tgl('tk_on', 'Enable tickets', t.enabled)}</div>
                    <div class="grid2">
                        ${fldHtml('Ticket category', selSlot('tkcat'), 'new ticket channels land here')}
                        ${fldHtml('Log channel', selSlot('tklog'), 'open/close announcements — empty = silent')}
                    </div>
                    <div class="grid2">
                        ${fldHtml('Support roles', selSlot('tkroles'), 'can see, claim and close tickets')}
                        ${fldHtml('Max open per member', numIn('tkmax', t.maxOpen, 1, 10))}
                    </div>
                    ${fldHtml('Channel naming', txtIn('tkname', t.naming, 'ticket-{user}'), 'placeholders: {user} {count}')}
                </div>
                <div class="card"><h3>Topics</h3><p class="sub mb">The panel dropdown — up to 10. With none, the panel shows a single "Open a ticket" button.</p>
                    <div id="topics"></div><button class="btn sm mt" id="add-topic">+ Add topic</button></div>
                <div class="card"><h3>Panel card</h3><p class="sub mb">The message people see — CV2 container, classic embed, or plain text when the card is off. The topic dropdown is attached automatically.</p>
                    ${cardEditorHtml('tp', t.panel || {})}</div>
                <div class="card"><h3>Post panel</h3>
                    ${fldHtml('Channel', selSlot('tkpost'), 'sends the panel immediately — uses saved settings')}
                    <div class="mt"><button class="btn" id="post-panel">Post panel</button> <span class="hint" id="post-status"></span></div></div>`;

            mountSelect(page, 'tkcat', { options: [{ value: '', label: 'No category' }, ...(DATA.categories || []).map((c) => ({ value: c.id, label: c.name, icon: '▤' }))], value: t.categoryId || '', placeholder: 'No category' });
            mountSelect(page, 'tklog', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: t.logChannel || '', placeholder: 'Off' });
            mountSelect(page, 'tkroles', { multi: true, options: roOpts(DATA.roles), value: t.supportRoles || [], placeholder: 'Support roles…' });
            mountSelect(page, 'tkpost', { options: chOpts(DATA.channels), placeholder: 'Pick a channel…' });
            const card = setupCardEditor(page, 'tp', t.panel || {}, {
                extras: t.topics?.length
                    ? [{ type: 'select', label: 'Choose a topic…' }]
                    : [{ type: 'buttons', labels: ['Open a ticket'], color: 'primary' }],
                plain: 'Pick a topic below to open a ticket.',
            });

            const tpEl = $('#topics', page);
            // Re-renders rebuild from `topics`, so typed-but-unsaved input
            // must be pulled back into the array before add/remove.
            const syncTopics = () => topics.forEach((x, i) => {
                x.name = tpEl.querySelector(`[name="tn_${i}"]`)?.value ?? '';
                x.desc = tpEl.querySelector(`[name="td_${i}"]`)?.value ?? '';
            });
            const renderTopics = () => {
                tpEl.innerHTML = topics.map((x, i) => `
                    <div class="modrow">
                        <input type="text" name="tn_${i}" value="${esc(x.name || '')}" placeholder="Topic — e.g. General support" style="flex:0 0 200px">
                        <input type="text" name="td_${i}" value="${esc(x.desc || '')}" placeholder="Dropdown description" class="grow">
                        <button class="btn sm danger" data-del="${i}">✕</button></div>`).join('')
                    || '<p class="muted small">No topics — the panel falls back to a single open button.</p>';
                $$('#topics [data-del]', page).forEach((b) => (b.onclick = () => { syncTopics(); topics.splice(+b.dataset.del, 1); renderTopics(); }));
            };
            renderTopics();
            $('#add-topic', page).onclick = () => { if (topics.length < 10) { syncTopics(); topics.push({ name: '', desc: '' }); renderTopics(); } };

            $('#post-panel', page).onclick = async (e) => {
                const status = $('#post-status', page);
                const channel = mounts.tkpost.get();
                if (!channel) { status.textContent = '— pick a channel first'; return; }
                e.target.disabled = true;
                const r = await api(`/api/guilds/${guildId}/tickets/panel`, { body: { channel } }).catch(() => null);
                e.target.disabled = false;
                status.textContent = r?.ok ? '— posted!' : `— ${r?.error || 'failed (save your settings first)'}`;
            };

            bindSave(page, 'tickets', (el) => {
                const f = formVals(el);
                return {
                    enabled: !!f.tk_on,
                    categoryId: mounts.tkcat.get() || null,
                    logChannel: mounts.tklog.get() || null,
                    supportRoles: mounts.tkroles.get() || [],
                    maxOpen: +f.tkmax || 1,
                    naming: f.tkname,
                    topics: topics.map((x, i) => ({ name: f[`tn_${i}`], desc: f[`td_${i}`] })),
                    panel: card.collect(f),
                };
            });
        },

        async captcha(page) {
            const c = CTX.settings.captcha || {};
            page.innerHTML = `
                <div><div class="page-title">CAPTCHA</div><p class="page-desc">Keep bots out — members click Verify on the panel, then pick the characters shown in a scrambled image to get the role.</p></div>
                <div class="card"><h3>Setup</h3>
                    <div class="mb">${tgl('cp_on', 'Enable CAPTCHA verification', c.enabled)}</div>
                    <div class="grid2">
                        ${fldHtml('Verified role', selSlot('cprole'), 'granted when a member passes — required')}
                        ${fldHtml('Log channel', selSlot('cplog'), 'pass/fail announcements — empty = silent')}
                    </div>
                    <p class="sub">Tip: hide your channels from @everyone and let only the verified role see them — that's what makes the gate work.</p>
                </div>
                <div class="card"><h3>Panel card</h3><p class="sub mb">The message people verify from — CV2 container, classic embed, or plain text when the card is off. The Verify button is attached automatically.</p>
                    ${cardEditorHtml('cp', c.panel || {})}</div>
                <div class="card"><h3>Post panel</h3>
                    ${fldHtml('Channel', selSlot('cppost'), 'sends the panel immediately — uses saved settings')}
                    <div class="mt"><button class="btn" id="post-panel">Post panel</button> <span class="hint" id="post-status"></span></div></div>`;

            mountSelect(page, 'cprole', { options: roOpts(DATA.roles), value: c.roleId || '', placeholder: 'Pick a role…' });
            mountSelect(page, 'cplog', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: c.logChannel || '', placeholder: 'Off' });
            mountSelect(page, 'cppost', { options: chOpts(DATA.channels), placeholder: 'Pick a channel…' });
            const card = setupCardEditor(page, 'cp', c.panel || {}, {
                extras: [{ type: 'buttons', labels: ['Verify'], color: 'success' }],
                plain: 'Click **Verify** to prove you\'re human.',
            });

            $('#post-panel', page).onclick = async (e) => {
                const status = $('#post-status', page);
                const channel = mounts.cppost.get();
                if (!channel) { status.textContent = '— pick a channel first'; return; }
                e.target.disabled = true;
                const r = await api(`/api/guilds/${guildId}/captcha/panel`, { body: { channel } }).catch(() => null);
                e.target.disabled = false;
                status.textContent = r?.ok ? '— posted!' : `— ${r?.error || 'failed (save your settings first)'}`;
            };

            bindSave(page, 'captcha', (el) => {
                const f = formVals(el);
                return {
                    enabled: !!f.cp_on,
                    roleId: mounts.cprole.get() || null,
                    logChannel: mounts.cplog.get() || null,
                    panel: card.collect(f),
                };
            });
        },

        async voicemaster(page) {
            const v = CTX.settings.voicemaster || {};
            page.innerHTML = `
                <div><div class="page-title">VoiceMaster</div><p class="page-desc">Join-to-create voice channels — members who join the trigger channel get their own voice room and control it from the posted panel or by typing <code>.vc</code> in the channel's chat.</p></div>
                <div class="card"><h3>Setup</h3>
                    <div class="mb">${tgl('vm_on', 'Enable VoiceMaster', v.enabled)}</div>
                    <div class="grid2">
                        ${fldHtml('Trigger channel', selSlot('vmtrig'), 'joining this voice channel hands out a personal one')}
                        ${fldHtml('Category', selSlot('vmcat'), 'new voice channels land here — empty = same as trigger')}
                    </div>
                    <div class="grid2">
                        ${fldHtml('Channel naming', txtIn('vmname', v.naming, "{user}'s channel"), '{user} = username · {name} = display name')}
                        ${fldHtml('Default user limit', numIn('vmlimit', v.userLimit, 0, 99), '0 = unlimited')}
                    </div>
                    ${fldHtml('Default bitrate (kbps)', numIn('vmbit', v.bitrate, 0, 384), '0 = server default — capped by the server\'s boost level')}
                </div>
                <div class="card"><h3>Control panel</h3><p class="sub mb">The message members control their channel from — the button grid and bitrate picker attach automatically. Owners can also type <code>.vc</code> in their channel's built-in chat.</p>
                    ${cardEditorHtml('vmp', v.panel || {})}</div>
                <div class="card"><h3>Post panel</h3>
                    ${fldHtml('Channel', selSlot('vmpost'), 'sends the panel immediately — uses saved settings')}
                    <div class="mt"><button class="btn" id="post-panel">Post panel</button> <span class="hint" id="post-status"></span></div></div>`;

            mountSelect(page, 'vmtrig', { options: [{ value: '', label: 'Off' }, ...(DATA.voice || []).map((c) => ({ value: c.id, label: c.name, icon: '🔊' }))], value: v.triggerId || '', placeholder: 'Pick a voice channel…' });
            mountSelect(page, 'vmcat', { options: [{ value: '', label: 'Same as trigger' }, ...(DATA.categories || []).map((c) => ({ value: c.id, label: c.name, icon: '▤' }))], value: v.categoryId || '', placeholder: 'Same as trigger' });
            mountSelect(page, 'vmpost', { options: chOpts(DATA.channels), placeholder: 'Pick a channel…' });
            const card = setupCardEditor(page, 'vmp', v.panel || {}, {
                extras: VM_EXTRAS,
                plain: 'Join the trigger channel to get your own voice channel — manage it with the buttons below or by typing `.vc` in its chat.',
            });

            $('#post-panel', page).onclick = async (e) => {
                const status = $('#post-status', page);
                const channel = mounts.vmpost.get();
                if (!channel) { status.textContent = '— pick a channel first'; return; }
                e.target.disabled = true;
                const r = await api(`/api/guilds/${guildId}/voicemaster/panel`, { body: { channel } }).catch(() => null);
                e.target.disabled = false;
                status.textContent = r?.ok ? '— posted!' : `— ${r?.error || 'failed (save your settings first)'}`;
            };

            bindSave(page, 'voicemaster', (el) => {
                const f = formVals(el);
                return {
                    enabled: !!f.vm_on,
                    triggerId: mounts.vmtrig.get() || null,
                    categoryId: mounts.vmcat.get() || null,
                    naming: f.vmname,
                    userLimit: +f.vmlimit || 0,
                    bitrate: +f.vmbit || 0,
                    panel: card.collect(f),
                };
            });
        },

        async boosting(page) {
            const b = CTX.settings.boosts;
            page.innerHTML = `
                <div><div class="page-title">Boosting</div><p class="page-desc">Perks for members who boost the server.</p></div>
                <div class="card"><h3>Announcement</h3>
                    ${fldHtml('Channel', selSlot('bch'), 'empty = no announcement')}
                    ${fldHtml('Message', txtArea('bmsg', b.message), '{user} {username} {server} {boosts} — sent as plain text when the card below is off')}
                    ${cardEditorHtml('bc', b.card || {}, ['{boosts}'])}
                </div>
                <div class="card"><h3>Booster role</h3>
                    ${fldHtml('Role granted on boost', selSlot('brole'), 'empty = none')}
                </div>
                <div class="card"><h3>Booster perks</h3><p class="sub mb">Passive boosts for members while they boost the server. Multipliers stack on top of purchased boosters.</p>
                    <div class="grid2">
                        ${fldHtml('Game winnings ×', txtIn('pgames', b.perks?.games ?? 1), 'multiplier on all game payouts — 1 = off')}
                        ${fldHtml('Coin earnings ×', txtIn('pcoins', b.perks?.coins ?? 1), 'multiplier on daily/other earnings — 1 = off')}
                        ${fldHtml('XP gain ×', txtIn('pxp', b.perks?.xp ?? 1), 'multiplier on message XP — 1 = off')}
                        ${fldHtml('Shop discount %', txtIn('pshop', b.perks?.shop ?? 0), '0–90 — 0 = off')}
                    </div>
                </div>`;
            mountSelect(page, 'bch', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: b.channel || '', placeholder: 'Off' });
            mountSelect(page, 'brole', { options: [{ value: '', label: 'None' }, ...roOpts(DATA.roles)], value: b.roleId || '', placeholder: 'None' });
            const card = setupCardEditor(page, 'bc', b.card || {});
            bindSave(page, 'boosts', () => {
                const f = formVals(page);
                return {
                    channel: mounts.bch.get() || null,
                    message: f.bmsg,
                    roleId: mounts.brole.get() || null,
                    perkGames: f.pgames, perkCoins: f.pcoins, perkXp: f.pxp, perkShop: f.pshop,
                    card: card.collect(f),
                };
            });
        },

        async settings(page) {
            const s = CTX.settings;
            const overviewCards = ['members', 'commands', 'warns', 'tempbans', 'ping'];
            page.innerHTML = `
                <div><div class="page-title">Settings</div><p class="page-desc">Prefix, access, dashboard appearance and bot profile.</p></div>
                <div class="card"><h3>General</h3>${fldHtml('Command prefix', txtIn('prefix', s.prefix || ''), 'empty = default')}</div>
                <div class="card"><h3>Access roles</h3><p class="sub mb">Mod/admin role lists stored with this guild's config.</p>
                    <div class="grid2">
                        ${fldHtml('Mod roles', selSlot('modroles'))}
                        ${fldHtml('Admin roles', selSlot('adminroles'))}
                    </div></div>
                <div class="card"><h3>Overview cards</h3><p class="sub mb">Which stats show on the Overview page.</p>
                    <div class="flex">${overviewCards.map((c) => tgl(`oc_${c}`, c, (s.overview.cards || []).includes(c))).join('')}</div></div>
                <div class="card"><h3>Dashboard appearance</h3><p class="sub mb">Only affects this server's dashboard — accent color and a background image behind the panel.</p>
                    <div class="grid2">
                        ${fldHtml('Accent color', `<div class="clrrow"><input type="color" id="accentpick" value="${esc(/^#?[0-9a-f]{6}$/i.test(s.appearance.accent || '') ? '#' + s.appearance.accent.replace(/^#/, '') : '#f0a050')}"><input type="text" name="accent" value="${esc(s.appearance.accent || '')}" placeholder="#f0a050" maxlength="7"></div>`, 'hex — empty = default')}
                        ${fldHtml('Background image', `<div class="clrrow"><input type="text" name="bgimg" value="${esc(s.appearance.background || '')}" placeholder="https://…"><button type="button" class="btn sm" id="pick-bg">Browse…</button><input type="file" id="bgfile" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none"></div>`, 'URL or a file upload — empty = none')}
                        ${fldHtml('Theme', selSlot('theme'), 'glass = translucent blurred panels — pairs well with a background image')}
                    </div></div>
                <div class="card"><h3>Bot profile</h3><p class="sub mb">Everything here is per-server — nickname, avatar and banner change how Kotan looks in this guild only. Click the preview to change them.</p>
                    <div class="bpgrid">
                        <div>
                            ${fldHtml('Nickname in this server', txtIn('nickname', s.branding.nickname || '', CTX.bot?.username || 'Kotan'), 'empty = default name')}
                            <input type="file" id="bavatar" accept="image/png,image/jpeg,image/webp" style="display:none">
                            <input type="file" id="bbanner" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none">
                            <div class="flex">
                                <button class="btn sm" id="pick-avatar">Change avatar…</button>
                                <button class="btn sm" id="pick-banner">Add banner…</button>
                                <button class="btn sm danger" id="rm-avatar">Remove avatar</button>
                                <button class="btn sm danger" id="rm-banner">Remove banner</button>
                            </div>
                            <span class="muted small" id="avatar-status"></span>
                        </div>
                        <div class="dprev prof" id="profprev"></div>
                    </div></div>`;

            mountSelect(page, 'modroles', { multi: true, options: roOpts(DATA.roles), value: s.access.modRoles, placeholder: 'None' });
            mountSelect(page, 'adminroles', { multi: true, options: roOpts(DATA.roles), value: s.access.adminRoles, placeholder: 'None' });
            mountSelect(page, 'theme', {
                options: [{ value: '', label: 'Default' }, { value: 'glass', label: 'Glass' }],
                value: s.appearance.theme || '', placeholder: 'Default',
            });

            // Live Discord profile popout — nickname + accent/banner from the form.
            const nickIn = $('[name=nickname]', page);
            const updProf = () => {
                const nick = nickIn.value.trim() || CTX.bot?.username || 'Kotan';
                $('#profprev', page).innerHTML = svgProfile({
                    name: nick, username: `@${CTX.bot?.username || 'kotan'}`,
                    avatar: CTX.bot ? (CTX.bot.avatarUrl || dcdnAv(CTX.bot.id, CTX.bot.avatar)) : '',
                    banner: $('[name=accent]', page)?.value || s.appearance.accent,
                    bannerImg: CTX.bot?.bannerUrl,
                });
            };
            nickIn.oninput = updProf;
            $('[name=accent]', page)?.addEventListener('input', updProf);
            updProf();

            // Click the preview's avatar/banner zones or the buttons to upload.
            const status = $('#avatar-status', page);
            const wirePick = (inputSel, key, done) => {
                $(inputSel, page).onchange = async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 3 * 1024 * 1024) return (status.textContent = 'Too big — max ~3MB');
                    status.textContent = 'Uploading…';
                    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
                    const r = await api(`/api/guilds/${guildId}/branding/${key}`, { body: { [key]: dataUrl } });
                    if (r.ok) { done(r); updProf(); status.textContent = 'Updated — may take a minute to show in Discord.'; }
                    else status.textContent = r.error || 'Failed';
                    e.target.value = '';
                };
            };
            wirePick('#bavatar', 'avatar', (r) => { if (CTX.bot) CTX.bot.avatarUrl = r.avatarUrl || null; });
            wirePick('#bbanner', 'banner', (r) => { if (CTX.bot) CTX.bot.bannerUrl = r.bannerUrl || null; });
            $('#pick-avatar', page).onclick = () => $('#bavatar', page).click();
            $('#pick-banner', page).onclick = () => $('#bbanner', page).click();
            const brandDel = async (key) => {
                status.textContent = 'Removing…';
                const r = await api(`/api/guilds/${guildId}/branding/${key}`, { method: 'DELETE' });
                if (r.ok) {
                    if (CTX.bot) {
                        if (key === 'avatar') CTX.bot.avatarUrl = r.avatarUrl || null;
                        else CTX.bot.bannerUrl = r.bannerUrl || null;
                    }
                    updProf();
                    status.textContent = 'Removed — may take a minute to propagate.';
                } else status.textContent = r.error || 'Failed';
            };
            $('#rm-avatar', page).onclick = () => brandDel('avatar');
            $('#rm-banner', page).onclick = () => brandDel('banner');
            $('#profprev', page).addEventListener('click', (e) => {
                const z = e.target.closest('[data-pick]')?.dataset.pick;
                if (z === 'avatar') $('#bavatar', page).click();
                if (z === 'banner') $('#bbanner', page).click();
            });

            // Appearance: color picker stays in sync with the hex field both ways.
            const accentIn = $('[name=accent]', page);
            const accentPick = $('#accentpick', page);
            accentPick.oninput = () => { accentIn.value = accentPick.value; updProf(); };
            accentIn.addEventListener('input', () => {
                const v = accentIn.value.trim();
                if (/^#?[0-9a-f]{6}$/i.test(v)) accentPick.value = `#${v.replace(/^#/, '')}`;
            });

            // Wallpaper browse — uploads to the server, saves, applies live.
            $('#pick-bg', page).onclick = () => $('#bgfile', page).click();
            $('#bgfile', page).onchange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 6 * 1024 * 1024) return toast('Too big — max ~6MB', 'err');
                const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
                toast('Uploading wallpaper…');
                const r = await api(`/api/guilds/${guildId}/appearance/bg`, { body: { image: dataUrl } });
                if (r.ok) {
                    $('[name=bgimg]', page).value = r.url;
                    // Same fields (and key order) as the appearance collect()
                    // — save() rebaselines the section so the bar stays hidden.
                    if (await save('appearance', { accent: accentIn.value, background: r.url, theme: mounts.theme?.get() || '' })) applyAppearance();
                } else toast(r.error || 'Upload failed', 'err');
                e.target.value = '';
            };

            bindSave(page, 'general', (el) => ({ prefix: formVals(el).prefix }));
            bindSave(page, 'access', () => ({ modRoles: mounts.modroles.get(), adminRoles: mounts.adminroles.get() }));
            bindSave(page, 'overview', (el) => {
                const f = formVals(el);
                return { cards: overviewCards.filter((c) => f[`oc_${c}`]) };
            });
            bindSave(page, 'appearance', (el) => {
                const f = formVals(el);
                return { accent: f.accent, background: f.bgimg, theme: mounts.theme?.get() || '' };
            });
            bindSave(page, 'branding', (el) => ({ nickname: formVals(el).nickname }));
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
            DATA.categories = ch.categories || [];
            DATA.voice = ch.voice || [];
            DATA.roles = ro.roles || [];
        }
        // shell() rebuilds the sidebar — keep the nav's scroll position so
        // items near the bottom don't jump to the top on every click.
        const navScroll = $('.dnav')?.scrollTop ?? 0;
        shell(slug);
        const navEl = $('.dnav');
        if (navEl && navScroll) navEl.scrollTop = navScroll;
        const page = $('#page');
        const render = PAGES[slug] || PAGES.overview;
        // Drop select mounts from the previous page — stale elements would
        // otherwise leak into the next page's collects. Portal'd pops on
        // <body> outlive their triggers, so sweep them too.
        for (const k in mounts) delete mounts[k];
        $$('.dselpop').forEach((p) => p.remove());
        // Reset unsaved-changes tracking — registered sections and their
        // baselines belong to the page being replaced.
        saveSections = [];
        dirtyObs?.disconnect();
        dirtyObs = null;
        renderDirtyBar();
        try {
            await render(page);
            bindSubnav(page);
            // Watch for edits: input/change cover field values, childList
            // mutations cover rows/components added, removed or reordered.
            if (saveSections.length) {
                page.addEventListener('input', queueDirtyScan);
                page.addEventListener('change', queueDirtyScan);
                dirtyObs = new MutationObserver(queueDirtyScan);
                dirtyObs.observe(page, { childList: true, subtree: true });
            }
        } catch (e) {
            page.innerHTML = `<div class="card"><h3>Something went wrong</h3><p class="sub">${esc(e.message)}</p></div>`;
        }
    };

    // ---------- boot ----------
    if (!guildId) renderPicker();
    else { addEventListener('hashchange', router); router(); }
})();
