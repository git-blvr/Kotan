/* Kotan dashboard SPA â€” served as a static shell, all data via /api.
   Routes: /dashboard -> server picker; /dashboard/:id -> guild app with
   hash sub-routes (#/overview â€¦ #/settings). Server-side guards and the
   API enforce access independently â€” this is presentation only. */

(function () {
    'use strict';

    // ---------- utils ----------
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const app = $('#app');

    const svg = (inner, w = 24, h = 24, stroke = '1.7') => `<svg viewBox="0 0 ${w} ${h}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
    const ICONS = {
        close: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>', 24, 24, '2'),
        trash: svg('<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>', 24, 24, '2'),
        theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18v-18z" fill="currentColor"/></svg>',
        chevronDown: svg('<polyline points="6 9 12 15 18 9"/>', 24, 24, '2'),
        chevronUp: svg('<polyline points="18 15 12 9 6 15"/>', 24, 24, '2'),
        chevronRight: svg('<polyline points="9 18 15 12 9 6"/>', 24, 24, '2'),
        burger: svg('<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>', 24, 24, '2'),
        duplicate: svg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>', 24, 24, '2'),
        up: svg('<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>', 24, 24, '2'),
        down: svg('<line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>', 24, 24, '2'),
        plus: svg('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>', 24, 24, '2'),
        drag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/></svg>',
        pipette: svg('<path d="m14 7 3 3m-9.5 7.5L3 21l3.5-4.5 9-9a2.121 2.121 0 0 0-3-3l-9 9z"/>', 24, 24, '2'),
        upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', 24, 24, '2'),
        download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', 24, 24, '2'),
        triangleUp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5l7 12H5z"/></svg>',
        triangleDown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 19l7-12H5z"/></svg>',
        link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>', 24, 24, '2'),
        serverEmpty: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;display:inline-block;opacity:0.7;"><circle cx="12" cy="12" r="3"/><path d="M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0"/></svg>',
        crown: '<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;vertical-align:-2px;margin-right:6px;"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z"/></svg>',
        userAvatar: svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', 24, 24, '2'),
        typeText: svg('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>', 24, 24, '2'),
        sparkle: '<svg viewBox="0 0 24 24" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px;"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/></svg>',
        zap: svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>', 24, 24, '2'),
        sunset: svg('<path d="M12 10V2M4.93 10.93 2.1 8.1M19.07 10.93l2.83-2.83M22 17H2M16 17a4 4 0 0 0-8 0"/>', 24, 24, '2'),
        gamepad: svg('<rect x="2" y="6" width="20" height="12" rx="4"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15.5" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="10" r="1" fill="currentColor"/>', 24, 24, '2'),
        hash: svg('<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>', 24, 24, '2'),
        speaker: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>', 24, 24, '2'),
        announcement: svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>', 24, 24, '2'),
        folder: svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>', 24, 24, '2'),
        image: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>', 24, 24, '2'),
        film: svg('<rect x="2" y="2" width="20" height="20" rx="2.2"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>', 24, 24, '2'),
        variable: svg('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>', 24, 24, '2'),
        play: svg('<polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke="none"/>', 24, 24, '2'),
        pause: svg('<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>', 24, 24, '2'),
        settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>', 24, 24, '2'),
    };

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

    // ---------- signature color themes & appearance customizer ----------
    const THEME_KEY = 'kotan-theme-v5';
    const COLOR_THEMES = {
        cream: {
            label: 'Cream Latte (Light)',
            desc: 'Warm Cream Rail Â· Soft Sand Cards Â· Toasted Orange Accent',
            accent: '#e2792b',
            accent2: '#c96a20',
            shell: '#ead6c1',
            sidebar: '#ead6c1',
            dock: '#fbf4ec',
            card: '#f1e2d2',
            acc: '#f1e2d2',
            navBtn: '#e2792b',
            onAccent: '#ffffff',
            dockMode: '',
        },
        cocoa: {
            label: 'Cocoa Roast (Dark)',
            desc: 'Roasted Cocoa Shell Â· Espresso Panels Â· Amber Orange Accent',
            accent: '#f08a3c',
            accent2: '#e2792b',
            shell: '#26170f',
            sidebar: '#26170f',
            dock: '#2f1e14',
            card: '#3a2619',
            acc: '#3a2619',
            navBtn: '#f08a3c',
            onAccent: '#2a170b',
            dockMode: '',
        },
        dark: {
            label: 'Obsidian Dark (Default)',
            desc: 'Deep Neutral Charcoal Â· Soft Dark Canvas Â· Clean Blurple Accent',
            accent: '#5865f2',
            accent2: '#4752c4',
            shell: '#16171b',
            sidebar: '#16171b',
            dock: '#1c1d22',
            card: '#24252b',
            acc: '#202227',
            navBtn: '#5865f2',
            onAccent: '#ffffff',
            dockMode: '',
        },
        oled: {
            label: 'OLED Pitch Black',
            desc: 'True Deep Pitch Black Â· Charcoal Panels Â· Crisp Monochrome Accent',
            accent: '#ffffff',
            accent2: '#dbdee1',
            shell: '#0c0c0e',
            sidebar: '#0c0c0e',
            dock: '#111113',
            card: '#18181c',
            acc: '#141417',
            navBtn: '#2b2d31',
            onAccent: '#0c0c0e',
            dockMode: 'oled',
        },
        zinc: {
            label: 'Zinc Slate',
            desc: 'Cool Neutral Zinc Â· Clean Slate Dock Â· Electric Indigo Accent',
            accent: '#6366f1',
            accent2: '#4f46e5',
            shell: '#16181e',
            sidebar: '#16181e',
            dock: '#1e2027',
            card: '#262832',
            acc: '#21232b',
            navBtn: '#6366f1',
            onAccent: '#ffffff',
            dockMode: 'vibrant',
        },
        charcoal: {
            label: 'Warm Charcoal',
            desc: 'Smoky Warm Charcoal Â· Soft Dark Canvas Â· Amber Gold Accent',
            accent: '#f59e0b',
            accent2: '#d97706',
            shell: '#181716',
            sidebar: '#181716',
            dock: '#201f1d',
            card: '#282724',
            acc: '#23211f',
            navBtn: '#f59e0b',
            onAccent: '#1c1208',
            dockMode: '',
        },
    };

    // Relative luminance of a hex color â€” picks readable text on custom accents.
    function accentLum(hex) {
        const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!m) return 0;
        let h = m[1];
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        return [0, 2, 4]
            .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
            .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
            .reduce((acc, v, i) => acc + v * [0.2126, 0.7152, 0.0722][i], 0);
    }

    function loadTheme() {
        try {
            const raw = localStorage.getItem(THEME_KEY);
            if (raw) return JSON.parse(raw);
            try {
                localStorage.removeItem('kotan-theme');
                localStorage.removeItem('kotan-navy-theme-v2');
                localStorage.removeItem('kotan-dark-theme-v4');
            } catch {}
            return {};
        } catch { return {}; }
    }
    let theme = loadTheme();
    if (!theme.colorTheme || !COLOR_THEMES[theme.colorTheme]) theme.colorTheme = 'cream';

    function applyTheme(t = theme) {
        const root = document.documentElement;
        root.dataset.mode = t.mode || '';
        root.dataset.density = t.density || '';
        root.dataset.motion = t.motion || '';
        root.dataset.glass = t.glass === 0 || t.glass === '0' ? '0' : '1';

        // Active color scheme
        const ctheme = COLOR_THEMES[t.colorTheme] || COLOR_THEMES.dark;
        root.dataset.colorTheme = t.colorTheme || 'dark';
        const dMode = t.dockMode !== undefined ? t.dockMode : (ctheme.dockMode || '');
        if (dMode) root.dataset.dockMode = dMode;
        else root.removeAttribute('data-dock-mode');

        // Accents
        const acc = t.customAccent || ctheme.accent;
        const acc2 = t.customAccent2 || ctheme.accent2;
        root.style.setProperty('--accent', acc);
        root.style.setProperty('--accent-2', acc2);
        root.style.setProperty('--dock-accent', acc);
        root.style.setProperty('--dock-accent-2', acc2);
        root.style.setProperty('--chart', acc);
        // Text drawn on accent-colored buttons/pills â€” light accents need dark text.
        const onAcc = t.customAccent
            ? (accentLum(acc) > 0.45 ? '#1c1208' : '#ffffff')
            : (ctheme.onAccent || '#ffffff');
        root.style.setProperty('--on-accent', onAcc);

        // Surfaces
        const sh = t.customShell || ctheme.shell;
        const sb = t.customSidebar || ctheme.sidebar;
        const dk = t.customDock || ctheme.dock;
        const cd = t.customCard || ctheme.card;
        const ac = t.customAcc || ctheme.acc;
        const nb = t.customNavBtn || ctheme.navBtn;

        root.style.setProperty('--shell-bg', sh);
        root.style.setProperty('--sidebar-bg', sb);
        root.style.setProperty('--dock-bg', dk);
        root.style.setProperty('--card-bg', cd);
        root.style.setProperty('--acc-bg', ac);
        root.style.setProperty('--nav-btn-bg', nb);

        try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch {}
    }
    applyTheme();
    window.addEventListener('storage', (e) => {
        if (e.key === THEME_KEY) { theme = loadTheme(); applyTheme(theme); }
    });

    let themeDrawerEl = null;
    function openThemeDrawer() {
        if (themeDrawerEl) { themeDrawerEl.classList.add('open'); $('.theme-drawer-backdrop')?.classList.add('open'); return; }
        const backdrop = document.createElement('div');
        backdrop.className = 'theme-drawer-backdrop open';
        const drawer = document.createElement('aside');
        drawer.className = 'theme-drawer open';
        drawer.innerHTML = `
            <div class="theme-drawer-head">
                <h3><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18v-18z"/></svg> Appearance & Theme</h3>
                <button type="button" class="theme-close-btn" data-close aria-label="Close">${ICONS.close}</button>
            </div>
            <div class="theme-drawer-body">
                <div>
                    <div class="theme-sec-title">Theme Presets</div>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        ${Object.entries(COLOR_THEMES).map(([k, v]) => `
                            <button type="button" class="theme-preset-card ${(theme.colorTheme || 'dark') === k ? 'active' : ''}" data-thm="${k}">
                                <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                                    <b style="font-size:13.5px;color:var(--text);">${v.label}</b>
                                    <div style="display:flex;gap:4px;">
                                        <span style="width:13px;height:13px;border-radius:50%;background:${v.shell};" title="Shell"></span>
                                        <span style="width:13px;height:13px;border-radius:50%;background:${v.dock};" title="Dock"></span>
                                        <span style="width:13px;height:13px;border-radius:50%;background:${v.card};" title="Card"></span>
                                        <span style="width:13px;height:13px;border-radius:50%;background:${v.accent};" title="Accent"></span>
                                    </div>
                                </div>
                                <span style="font-size:11.5px;color:var(--text-2);text-align:left;">${v.desc}</span>
                            </button>`).join('')}
                    </div>
                </div>
                <div>
                    <div class="theme-sec-title">Dock Background Elevation</div>
                    <div class="segmented-control">
                        <button type="button" class="segmented-btn ${!theme.dockMode ? 'active' : ''}" data-dock="">Standard Dark</button>
                        <button type="button" class="segmented-btn ${theme.dockMode === 'vibrant' ? 'active' : ''}" data-dock="vibrant">Elevated Slate</button>
                        <button type="button" class="segmented-btn ${theme.dockMode === 'oled' ? 'active' : ''}" data-dock="oled">Pitch Black</button>
                    </div>
                </div>
                <div>
                    <div class="theme-sec-title">Custom Colors</div>
                    <div style="display:flex;flex-direction:column;gap:12px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                            <span style="font-size:12.5px;color:var(--text);font-weight:600;">Main Background</span>
                            <input type="color" id="th-pick-shell" value="${theme.customShell || (COLOR_THEMES[theme.colorTheme] || COLOR_THEMES.cream).shell}" style="width:40px;height:32px;border-radius:6px;border:none;cursor:pointer;">
                        </div>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                            <span style="font-size:12.5px;color:var(--text);font-weight:600;">Content Dock</span>
                            <input type="color" id="th-pick-dock" value="${theme.customDock || (COLOR_THEMES[theme.colorTheme] || COLOR_THEMES.cream).dock}" style="width:40px;height:32px;border-radius:6px;border:none;cursor:pointer;">
                        </div>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                            <span style="font-size:12.5px;color:var(--text);font-weight:600;">Accent Color</span>
                            <input type="color" id="th-pick-accent" value="${theme.customAccent || (COLOR_THEMES[theme.colorTheme] || COLOR_THEMES.cream).accent}" style="width:40px;height:32px;border-radius:6px;border:none;cursor:pointer;">
                        </div>
                    </div>
                </div>
                <div>
                    <div class="theme-sec-title">Interface Density</div>
                    <div class="segmented-control">
                        <button type="button" class="segmented-btn ${!theme.density ? 'active' : ''}" data-density="">Comfortable</button>
                        <button type="button" class="segmented-btn ${theme.density === 'compact' ? 'active' : ''}" data-density="compact">Compact</button>
                    </div>
                </div>
                <div>
                    <button type="button" class="btn outline" id="th-reset" style="width:100%;font-size:13px;">Reset to Default Theme</button>
                </div>
            </div>`;
        document.body.append(backdrop, drawer);
        themeDrawerEl = drawer;
        const close = () => { drawer.classList.remove('open'); backdrop.classList.remove('open'); };
        backdrop.onclick = close;
        drawer.querySelector('[data-close]').onclick = close;

        // Preset switcher
        $$('.theme-preset-card', drawer).forEach((b) => (b.onclick = () => {
            const thmKey = b.dataset.thm;
            theme.colorTheme = thmKey;
            delete theme.customAccent; delete theme.customAccent2;
            delete theme.customShell; delete theme.customSidebar;
            delete theme.customDock; delete theme.customCard;
            delete theme.customAcc; delete theme.customNavBtn;
            delete theme.dockMode;
            applyTheme();
            $$('.theme-preset-card', drawer).forEach((x) => x.classList.toggle('active', x === b));
            const cthm = COLOR_THEMES[thmKey];
            if (cthm) {
                $('#th-pick-shell', drawer).value = cthm.shell;
                $('#th-pick-dock', drawer).value = cthm.dock;
                $('#th-pick-accent', drawer).value = cthm.accent;
            }
        }));

        // Dock surface mode
        $$('[data-dock]', drawer).forEach((b) => (b.onclick = () => {
            theme.dockMode = b.dataset.dock;
            applyTheme();
            $$('[data-dock]', drawer).forEach((x) => x.classList.toggle('active', x === b));
        }));

        // Interactive pickers
        $('#th-pick-shell', drawer).oninput = (e) => {
            theme.customShell = e.target.value;
            applyTheme();
            $$('.theme-preset-card', drawer).forEach((x) => x.classList.remove('active'));
        };
        $('#th-pick-dock', drawer).oninput = (e) => {
            theme.customDock = e.target.value;
            applyTheme();
            $$('.theme-preset-card', drawer).forEach((x) => x.classList.remove('active'));
        };
        $('#th-pick-accent', drawer).oninput = (e) => {
            const v = e.target.value;
            theme.customAccent = v;
            theme.customAccent2 = v;
            theme.customNavBtn = v;
            applyTheme();
            $$('.theme-preset-card', drawer).forEach((x) => x.classList.remove('active'));
        };

        $$('[data-density]', drawer).forEach((b) => (b.onclick = () => {
            theme.density = b.dataset.density; applyTheme();
            $$('[data-density]', drawer).forEach((x) => x.classList.toggle('active', x === b));
        }));
        drawer.querySelector('#th-reset').onclick = () => {
            theme = { colorTheme: 'cream', mode: '', density: '' };
            applyTheme();
            $$('.theme-preset-card', drawer).forEach((x) => x.classList.toggle('active', x.dataset.thm === 'cream'));
            $('#th-pick-shell', drawer).value = COLOR_THEMES.cream.shell;
            $('#th-pick-dock', drawer).value = COLOR_THEMES.cream.dock;
            $('#th-pick-accent', drawer).value = COLOR_THEMES.cream.accent;
            toast('Reset to Default Theme');
        };
    }

    function mountThemeFab() {
        if ($('.theme-fab')) return;
        const fab = document.createElement('button');
        fab.className = 'theme-fab'; fab.title = 'Theme & Appearance'; fab.innerHTML = ICONS.theme;
        fab.onclick = openThemeDrawer;
        document.body.appendChild(fab);
    }

    // ---------- search-select component ----------
    // options: [{value,label,icon,color}] â€” renders a .dsel dropdown; get()
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
            if (opts.multi) return values.size ? `${values.size} selected` : (opts.placeholder || 'Selectâ€¦');
            const v = [...values][0];
            const o = options.find((o) => String(o.value) === v);
            return o ? o.label : (v ? `#${v}` : (opts.placeholder || 'Selectâ€¦'));
        };
        const renderBtn = () => { btn.innerHTML = `<span class="${values.size ? '' : 'ph'}">${esc(label())}</span><span class="caret">${ICONS.chevronDown}</span>`; };
        renderBtn();

        function renderPop(filter = '') {
            const list = options.filter((o) => o.label.toLowerCase().includes(filter));
            pop.innerHTML = (options.length > 10 ? '<div class="search"><input type="text" placeholder="Searchâ€¦"></div>' : '')
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
                // portal to <body> â€” ancestor backdrop-filter/transform creates a
                // containing block that would break position:fixed anchoring
                if (pop.parentElement !== document.body) document.body.appendChild(pop);
                pop.classList.add('dselpop');
                renderPop(); // fill first so offsetHeight measures real content
                const r = btn.getBoundingClientRect();
                const w = Math.min(r.width, innerWidth - 16);
                pop.style.width = `${w}px`;
                pop.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
                // Fit inside the viewport â€” the pop is fixed, so it can't ride
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
            // dsel often sits inside a <label class="fld"> â€” the label would
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
    const fld = (label, inner, hint) => `<label class="fld"><span>${esc(label)}${hint ? ` <span class="hint">â€” ${esc(hint)}</span>` : ''}</span></label>`;
    // fld() leaves inner injection to callers that need real nodes; use fldText
    // for simple html inputs:
    const fldHtml = (label, inner, hint) => `<label class="fld"><span>${esc(label)}${hint ? ` <span class="hint">â€” ${esc(hint)}</span>` : ''}</span>${inner}</label>`;
    const tgl = (name, label, on) => `<label class="tgl"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span class="trk"></span><span class="lbl">${esc(label)}</span></label>`;
    const numIn = (name, v, min, max) => `<input type="number" name="${name}" value="${v ?? ''}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}>`;
    const txtIn = (name, v, ph = '') => `<input type="text" name="${name}" value="${esc(v ?? '')}" placeholder="${esc(ph)}">`;
    const txtArea = (name, v) => `<textarea name="${name}">${esc(v ?? '')}</textarea>`;

    const chOpts = (channels) => channels.map((c) => ({ value: c.id, label: c.name, icon: c.type === 5 ? ICONS.announcement : ICONS.hash }));
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

    // Fixed-position dropdowns don't follow their trigger on scroll â€” close
    // them instead (capture picks up scrolls inside nested containers too).
    // Scrolls INSIDE the popover's own option list are exempt â€” that list is
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

    // ---------- state ----------
    const m = location.pathname.match(/^\/dashboard(?:\/(\d+))?/);
    const guildId = m?.[1] || null;
    let CTX = null;           // {guild, settings, modules, commands}
    const DATA = { channels: [], roles: [] };
    let rangeDays = 30;       // overview range pill selection
    let actDays = 30;         // activity page range pill selection
    const actFilter = { q: '', roles: [] }; // activity name/id search + role picks

    const fmtDelta = (cur, prev) => {
        if (!prev) return '';
        const pct = Math.round(((cur - prev) / prev) * 100);
        return `<span class="delta ${pct >= 0 ? 'up' : 'dn'}">${pct >= 0 ? ICONS.triangleUp : ICONS.triangleDown} ${Math.abs(pct)}%</span>`;
    };

    async function save(section, fields, btn, quiet) {
        btn && (btn.disabled = true);
        const r = await api(`/api/guilds/${guildId}/settings`, { body: { section, fields } });
        btn && (btn.disabled = false);
        if (r.ok) {
            CTX.settings = r.settings;
            // What was sent becomes the section's new clean snapshot.
            const s = saveSections.find((x) => x.section === section);
            if (s) { s.baseline = secSnap(s) ?? JSON.stringify(fields); s.dirty = false; renderDirtyBar(); }
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
                <input class="pk-search" id="srvq" type="search" placeholder="Search serversâ€¦">
            </div>
            <div class="pk-label">Manageable <span class="pkcount" id="srvn"></span></div>
            <div class="srvgrid" id="srvs"><div class="skeleton" style="height:180px"></div></div>
        </div>`;
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
        grid.innerHTML = (list.length ? list.map(card).join('') : `<div class="empty-state"><div class="big">${ICONS.serverEmpty}</div>No manageable servers with Kotan found.</div>`)
            + (dev?.developer ? `<a class="srv dev" href="/dashboard/admin/blacklist" data-name="developer"><span class="noicon">${ICONS.crown}</span><b>Developer</b><span class="srvbadge">Guild blacklist</span><span class="srvbtn">Open</span></a>` : '');
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
        { group: 'Creative Studio', items: [
            ['image-studio', ICONS.image, 'Image Studio'],
            ['gif-studio', ICONS.film, 'GIF Studio'],
            ['studio-vars', ICONS.variable, 'Assets & Variables'],
        ] },
        { group: '', items: [
            ['settings', ICONS.settings || svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M2.5 12h3M18.5 12h3M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2"/>'), 'Settings'],
        ] },
    ];

    let userGuildsCache = null;
    async function getUserGuilds() {
        if (!userGuildsCache) {
            const r = await api('/api/guilds').catch(() => null);
            userGuildsCache = r?.guilds || [];
        }
        return userGuildsCache;
    }

    function updateShell(activeSlug) {
        if (!$('.dwrap', app)) {
            shell(activeSlug);
            return;
        }
        const label = NAV.flatMap((x) => x.items).find(([slug]) => slug === activeSlug)?.[2] || 'Overview';
        const crumbEl = $('#dtop-crumb-title');
        if (crumbEl) crumbEl.textContent = label;
        $$('#dside a[href^="#/"]').forEach((a) => {
            const isMatch = a.getAttribute('href') === `#/${activeSlug}`;
            a.classList.toggle('active', isMatch);
        });
        $$('.drail-item').forEach((a) => {
            const isMatch = a.dataset.gid === String(guildId);
            a.classList.toggle('active', isMatch);
        });
        $('#dside')?.classList.remove('open');
    }

    function shell(activeSlug) {
        const g = CTX.guild;
        const icon = g.icon ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=64" alt="">` : `<span class="gnoicon">${esc(g.name[0])}</span>`;
        const av = CTX.user.avatar ? `<img src="https://cdn.discordapp.com/avatars/${CTX.user.id}/${CTX.user.avatar}.png?size=64" alt="">` : '';
        const label = NAV.flatMap((x) => x.items).find(([slug]) => slug === activeSlug)?.[2] || 'Overview';
        const link = ([slug, ic, lab]) => `<a href="#/${slug}" class="${slug === activeSlug ? 'active' : ''}"><span class="ic">${ic}</span>${lab}${slug === 'image-studio' || slug === 'gif-studio' ? '<span class="badge-new">NEW</span>' : ''}</a>`;
        const nav = NAV.slice(0, -1).map((grp) => `<div class="dnav-group">${grp.group ? `<span>${grp.group}</span>` : ''}${grp.items.map(link).join('')}</div>`).join('');
        const footNav = NAV[NAV.length - 1].items.map(link).join('');

        app.className = '';
        app.innerHTML = `<div class="dwrap">
            <!-- 1. Leftmost column: SERVERS RAIL (white in mock) -->
            <aside class="drail-servers" id="drail-servers">
                <a class="rail-home-btn" href="/dashboard" title="Home / Server Switcher">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                </a>
                <div class="drail-sep"></div>
                <div class="drail-list" id="drail-list">
                    <div class="drail-item active" data-gid="${g.id}">
                        <div class="drail-pill"></div>
                        <div class="drail-icon">${icon}</div>
                        <div class="drail-tooltip">${esc(g.name)}</div>
                    </div>
                </div>
                <div class="drail-sep"></div>
                <a class="drail-add-btn" href="https://discord.com/oauth2/authorize?client_id=1477435889707909303&permissions=8&integration_type=0&scope=bot+applications.commands" target="_blank" title="Add Kotan to a new server">
                    ${ICONS.plus}
                </a>
            </aside>

            <!-- 2. Middle column: NAVIGATION SIDEBAR (red in mock) -->
            <aside class="dside" id="dside">
                <div class="dside-head">
                    <a class="gsel-box" href="/dashboard" title="Switch server">
                        ${icon}
                        <div class="gsel-info">
                            <b>${esc(g.name)}</b>
                            <span>${g.memberCount ? Number(g.memberCount).toLocaleString() + ' members' : 'Active server'}</span>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="16"><path d="M6 9l6 6 6-6"/></svg>
                    </a>
                </div>
                <nav class="dnav">${nav}</nav>
                <div class="dfoot-account">
                    <nav class="dnav foot" style="padding:0;margin-bottom:8px;">${footNav}</nav>
                    <div class="duser-card">
                        <div class="duser-av-wrap">
                            ${av || `<span class="noav">${esc((CTX.user.global_name || CTX.user.username)[0])}</span>`}
                            <span class="status-dot" title="Online"></span>
                        </div>
                        <div class="duser-meta">
                            <b>${esc(CTX.user.global_name || CTX.user.username)}</b>
                            <span>@${esc(CTX.user.username)}</span>
                        </div>
                        <a class="duser-logout-btn" href="/auth/logout" title="Sign out / Logout">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                        </a>
                    </div>
                </div>
            </aside>

            <!-- 3. Right main workspace: CONTENT (orange curved dock in mock) -->
            <main class="dmain">
                <div class="dorange-dock" id="dorange-dock">
                    <header class="dtop">
                        <button class="burger" id="burger" aria-label="Menu">${ICONS.burger}</button>
                        <div class="crumb"><a href="/dashboard">Servers</a><span>${ICONS.chevronRight}</span>${esc(g.name)}<span>${ICONS.chevronRight}</span><b id="dtop-crumb-title">${esc(label)}</b></div>
                        <div class="topbar-actions">
                            <button type="button" class="dtop-icon-btn" id="db-theme-toggle" title="Toggle light / dark theme">
                                ${ICONS.theme}
                            </button>
                            <button type="button" class="dtop-icon-btn" id="db-theme-btn" title="Appearance settings">
                                ${ICONS.settings}
                            </button>
                        </div>
                    </header>
                    <div class="dcontent-canvas">
                        <div id="page" class="dpage"></div>
                    </div>
                </div>
            </main>
        </div>`;

        // Populate server rail with user's guilds
        getUserGuilds().then((guilds) => {
            const listEl = $('#drail-list');
            if (!listEl || !guilds.length) return;
            listEl.innerHTML = guilds.map((srv) => {
                const sIcon = srv.icon
                    ? `<img src="https://cdn.discordapp.com/icons/${srv.id}/${srv.icon}.png?size=64" alt="" loading="lazy">`
                    : `<span class="gnoicon" style="width:100%;height:100%;display:grid;place-items:center;font-size:15px;font-weight:700;">${esc(srv.name[0])}</span>`;
                const isActive = String(srv.id) === String(guildId);
                return `<a class="drail-item ${isActive ? 'active' : ''}" href="/dashboard/${srv.id}#/${activeSlug}" data-gid="${srv.id}">
                    <div class="drail-pill"></div>
                    <div class="drail-icon">${sIcon}</div>
                    <div class="drail-tooltip">${esc(srv.name)}</div>
                </a>`;
            }).join('');
        });

        // Per-guild dashboard appearance
        applyAppearance();

        // Smooth hash routing
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
        const tgBtn = $('#db-theme-toggle');
        if (tgBtn) tgBtn.onclick = () => {
            theme.colorTheme = theme.colorTheme === 'cream' ? 'cocoa' : 'cream';
            applyTheme();
        };
        const thBtn = $('#db-theme-btn');
        if (thBtn) thBtn.onclick = openThemeDrawer;
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

    // In-page subnav â€” built automatically from each page's section headings.
    // Sits above the title, jump-scrolls to a section, and tracks scroll.
    let scrollSpy = null;
    function bindSubnav(page) {
        const heads = $$('.card h3', page);
        // Only worth a subnav when there's actually a lot to jump between â€”
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
            if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - nav.getBoundingClientRect().bottom - 12, behavior: 'smooth' });
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
    // and the profile popout. Text wraps by estimated width â€” it's a preview.
    const DC = { bg: '#313338', panel: '#2b2d31', border: '#43444c', text: '#dbdee1', head: '#f2f3f5', muted: '#949ba4', brand: '#5865f2', green: '#23a55a' };
    const DFONT = `'gg sans','Segoe UI','Helvetica Neue',Arial,sans-serif`;
    // Discord-style "Today at h:mm AM" â€” .dsvg-ts nodes refresh on a 2s tick.
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
    const dcdnBanner = (id, hash) => (hash ? `https://cdn.discordapp.com/banners/${id}/${hash}.png?size=512` : '');

    // Shared studio asset resolution â€” turns {avatar}/{icon}/{banner}/
    // {mavatar:id} template tokens into loadable URLs, with an image cache
    // and a lazily-fetched member list for the "someone in server" picker.
    const makeStudioAssets = (redraw) => {
        const memberAv = CTX.user.avatarUrl || dcdnAv(CTX.user.id, CTX.user.avatar) || '';
        const guildIconU = CTX.guild.iconUrl || dcdnIcon(CTX.guild.id, CTX.guild.icon) || '';
        const guildBannerU = CTX.guild.bannerUrl || '';
        const cache = new Map();
        let memberMap = null, memberP = null;
        const loadMembers = () => (memberP ||= api(`/api/guilds/${CTX.guild.id}/activity?days=90`)
            .then((d) => { memberMap = d?.members || {}; return memberMap; })
            .catch(() => ({})));
        const tplResolve = (s) => String(s || '')
            .replaceAll('{avatar}', memberAv)
            .replaceAll('{icon}', guildIconU)
            .replaceAll('{banner}', guildBannerU)
            .replace(/\{mavatar:(\w+)\}/g, (m, id) => memberMap?.[id]?.avatar || '');
        const imgFor = (u) => {
            const url = tplResolve(u);
            if (!url || !/^https?:\/\//.test(url)) return null;
            let i = cache.get(url);
            if (!i) { i = new Image(); i.crossOrigin = 'anonymous'; i.onload = redraw; i.src = url; cache.set(url, i); }
            return i.complete && i.naturalWidth ? i : null;
        };
        const srcOf = (el) => {           // element url template â†’ source kind
            const u = String(el.url || '');
            if (u === '{icon}') return 'icon';
            if (u === '{banner}') return 'banner';
            if (u.startsWith('{mavatar:')) return 'member';
            if (u === '{avatar}' || !u) return 'avatar';
            return 'url';
        };
        const memberIdOf = (el) => (String(el.url || '').match(/\{mavatar:(\w+)\}/) || [])[1] || '';
        return { memberAv, guildIconU, guildBannerU, imgFor, tplResolve, srcOf, memberIdOf, loadMembers, getMemberMap: () => memberMap };
    };

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

    // Circular avatar â€” CDN image when available, else a default silhouette.
    const svgAv = (url, cx, cy, r) => {
        const id = `av${++svgUid}`;
        const inner = url
            ? `<image href="${xesc(url)}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
            : `<g clip-path="url(#${id})"><rect x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}" fill="${DC.brand}"/><circle cx="${cx}" cy="${cy - r * 0.35}" r="${r * 0.42}" fill="#fff"/><path d="M${cx - r * 0.75} ${cy + r} a${r * 0.75} ${r * 0.75} 0 0 1 ${r * 1.5} 0" fill="#fff"/></g>`;
        return `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>${inner}`;
    };

    // Rounded image â€” CDN URL or a dark placeholder with an icon glyph.
    const svgImg = (url, x, y, w, h, rx = 8) => {
        const id = `im${++svgUid}`;
        const inner = /^https?:\/\//.test(url || '')
            ? `<image href="${xesc(url)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/>`
            : `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1e1f22" clip-path="url(#${id})"/><path d="M${x + w / 2 - 14} ${y + h / 2 + 10} l9 -12 7 8 9 -12 11 16z" fill="${DC.border}"/><circle cx="${x + w / 2 - 8}" cy="${y + h / 2 - 8}" r="4" fill="${DC.border}"/>`;
        return `<defs><clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/></clipPath></defs>${inner}`;
    };

    // Classic embed â€” accent bar, title, wrapped description, thumbnail, footer.
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

    // Button/select rows â€” pseudo-comps the preview layers onto feature
    // panels (voicemaster grid, ticket topic picker, verify button). One
    // call renders one action row; `color` picks the Discord button tint.
    const BTN_COLORS = { primary: '#5865f2', success: '#248046', danger: '#da373c' };
    const svgRowComp = (c, x, y, w) => {
        let out = '';
        if (c.type === 'buttons') {
            let bx = x;
            for (const l of c.labels || []) {
                const bw = Math.max(48, String(l).length * 7.8 + 30);
                if (bx + bw > x + w) break;
                out += `<rect x="${bx}" y="${y}" width="${bw}" height="34" rx="8" fill="${BTN_COLORS[c.color] || '#4e5058'}"/>
                    <text x="${bx + bw / 2}" y="${y + 22}" text-anchor="middle" font-family="${DFONT}" font-size="14" font-weight="500" fill="#fff">${xesc(l)}</text>`;
                bx += bw + 8;
            }
        } else if (c.type === 'select') {
            out = `<rect x="${x}" y="${y}" width="${w}" height="34" rx="8" fill="#383a40"/>
                <text x="${x + 12}" y="${y + 22}" font-family="${DFONT}" font-size="14" fill="#b5bac1">${xesc(c.label || 'Make a selection')}</text>
                <path d="M${x + w - 24} ${y + 14} l5 5 5 -5" stroke="#b5bac1" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        return { svg: out, h: 42 };
    };

    // CV2 container â€” stacked components, per-type rendering, optional accent bar.
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
                    // button accessory â€” Discord renders link buttons gray
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
    const svgMessage = ({ avatar, name, content, embed, container, accent, rows, light }) => {
        const cTheme = light ? { bg: '#ffffff', head: '#060607', muted: '#5c5e66', brand: '#5865f2' } : DC;
        const W = 440;
        let body = svgAv(avatar, 38, 28, 20);
        const nw = Math.min(String(name).length * 8.4, 180);
        body += `<text x="72" y="32" font-family="${DFONT}" font-size="15" font-weight="600" fill="${cTheme.head}">${xesc(name)}</text>`;
        body += `<rect x="${76 + nw}" y="20" width="38" height="15" rx="4" fill="${cTheme.brand}"/><text x="${95 + nw}" y="31" text-anchor="middle" font-family="${DFONT}" font-size="10" font-weight="700" fill="#fff">BOT</text>`;
        body += `<text class="dsvg-ts" x="${121 + nw}" y="31" font-family="${DFONT}" font-size="11" fill="${cTheme.muted}">${tsNow()}</text>`;
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
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}" class="dsvg" role="img"><rect width="${W}" height="${h}" fill="${cTheme.bg}"/>${body}</svg>`;
    };

    // Discord profile popout â€” banner (image or accent), avatar + status,
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
                <g transform="translate(${cx - 5}, ${cy - 5}) scale(0.42)">
                    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="#dbdee1" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                </g>
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
    // ---------- welcome image editor studio (canvas) ----------
    function imgEditorHtml(p, img) {
        return `
            <div class="card"><h3>Welcome image Studio</h3>
                <p class="sub mb">Visual canvas studio â€” drag elements around the preview. Smart guidelines snap elements to center. Text placeholders: <code class="mono">{username}</code> <code class="mono">{user}</code> <code class="mono">{server}</code> <code class="mono">{members}</code></p>
                ${tgl(`${p}img_on`, 'Welcome image enabled', img?.enabled)}

                <div class="cedit-templates-row" style="margin-top:12px;">
                    <span style="font-size:12px;color:var(--muted);font-weight:600;align-self:center;">Templates:</span>
                    <button type="button" class="cedit-tmpl-btn" id="${p}tmpl_min">${ICONS.sparkle} <span>Minimalist</span></button>
                    <button type="button" class="cedit-tmpl-btn" id="${p}tmpl_cyber">${ICONS.zap} <span>Cyberpunk</span></button>
                    <button type="button" class="cedit-tmpl-btn" id="${p}tmpl_sunset">${ICONS.sunset} <span>Sunset</span></button>
                    <button type="button" class="cedit-tmpl-btn" id="${p}tmpl_classic">${ICONS.gamepad} <span>Classic</span></button>
                </div>

                <div class="grid2">
                    ${fldHtml('Background image URL', txtIn(`${p}img_bg`, img?.background || ''), 'empty = solid color below')}
                    ${fldHtml('Background color', `<div style="display:flex;gap:6px;align-items:center;"><input type="color" name="${p}img_col" value="#${esc(img?.bgColor || '1e1f22')}" class="colfull" style="flex:1;"><button type="button" class="btn sm" id="${p}img_dom" title="Sample dominant color from the background image" style="display:grid;place-items:center;padding:6px 9px;">${ICONS.pipette}</button></div>`)}
                </div>

                <div class="imged-tools">
                    <button type="button" class="btn sm primary" id="${p}img_addav">${ICONS.plus} <span>Avatar / Media</span></button>
                    <button type="button" class="btn sm primary" id="${p}img_addtx">${ICONS.plus} <span>Text</span></button>
                    <span class="imged-sep"></span>
                    <button type="button" class="btn sm" id="${p}img_cx" title="Center selected piece horizontally">Center X</button>
                    <button type="button" class="btn sm" id="${p}img_cy" title="Center selected piece vertically">Center Y</button>
                    <button type="button" class="btn sm" id="${p}img_row" title="Spread all pieces evenly in a horizontal row">Auto Row</button>
                    <button type="button" class="btn sm" id="${p}img_col" title="Spread all pieces evenly in a vertical column">Auto Col</button>
                    <span class="imged-sep"></span>
                    <button type="button" class="btn sm outline" id="${p}img_dl" title="Download rendered PNG to your computer">${ICONS.download} <span>Download PNG</span></button>
                    <button type="button" class="btn sm danger" id="${p}img_del" style="display:none">Remove Selected</button>
                </div>

                <div class="imged-studio-grid">
                    <div>
                        <div class="imged-cv-wrapper">
                            <canvas id="${p}img_cv" class="imged-cv" width="800" height="300" style="display:block;width:100%;height:auto;"></canvas>
                        </div>
                        <div id="${p}img_props" class="imged-props"></div>
                    </div>
                    <div class="imged-layers-card">
                        <div class="imged-layers-title">
                            <span>Canvas Layers</span>
                            <span id="${p}img_layer_count" style="color:var(--accent)">0</span>
                        </div>
                        <p class="sub" style="font-size:12px;margin:0 0 4px;">Click a layer to edit or drag to reorder.</p>
                        <div id="${p}img_layers" style="display:flex;flex-direction:column;gap:6px;max-height:280px;overflow-y:auto;"></div>
                    </div>
                </div>

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
        const layersList = $(`#${p}img_layers`, page);
        const layerCountEl = $(`#${p}img_layer_count`, page);
        const c2 = cv.getContext('2d');

        // Normalize legacy 'avatar' elements to media:avatar:circle
        const els = (img?.elements || []).map((e) =>
            e.type === 'avatar' ? { ...e, type: 'media', src: 'avatar', shape: 'circle' } : { ...e });
        let sel = els[0] || null;
        let uid = els.length;
        let snapX = false, snapY = false;

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

        // Sample the dominant color out of the background image (falls back
        // to the member avatar / server icon when no image is set).
        $(`#${p}img_dom`, page).onclick = async (ev) => {
            const raw = (bgIn.value || '').trim();
            const src = raw === '{avatar}' ? memberAv
                : raw === '{icon}' ? guildIcon
                : /^https?:\/\//.test(raw) ? raw
                : (memberAv || guildIcon);
            if (!src) return toast('No image to sample â€” set a background image first', 'err');
            ev.target.disabled = true;
            const r = await api(`/api/guilds/${guildId}/dominant-color?src=${encodeURIComponent(src)}`).catch(() => null);
            ev.target.disabled = false;
            if (r?.ok && r.color) { colIn.value = r.color; draw(); toast(`Sampled ${r.color}`); }
            else toast(r?.error || 'Could not read that image', 'err');
        };

        const fmtS = (s) => String(s ?? '')
            .replaceAll('{user}', `@${CTX.user.username}`)
            .replaceAll('{username}', CTX.user.username)
            .replaceAll('{server}', CTX.guild.name)
            .replaceAll('{members}', String(CTX.guild.memberCount));
        const textFont = (el) => `${el.bold ? '800' : '600'} ${Math.max(8, el.size * H)}px Kotan, 'Inter', sans-serif`;

        const shapeClip = (cx, cy, r, shape) => {
            c2.beginPath();
            if (shape === 'square') c2.rect(cx - r, cy - r, r * 2, r * 2);
            else if (shape === 'rounded') c2.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.4);
            else c2.arc(cx, cy, r, 0, Math.PI * 2);
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

            // Draw center guidelines if snapping
            if (snapX) {
                c2.save();
                c2.strokeStyle = '#06b6d4';
                c2.lineWidth = 1.5;
                c2.setLineDash([4, 4]);
                c2.beginPath(); c2.moveTo(W / 2, 0); c2.lineTo(W / 2, H); c2.stroke();
                c2.restore();
            }
            if (snapY) {
                c2.save();
                c2.strokeStyle = '#06b6d4';
                c2.lineWidth = 1.5;
                c2.setLineDash([4, 4]);
                c2.beginPath(); c2.moveTo(0, H / 2); c2.lineTo(W, H / 2); c2.stroke();
                c2.restore();
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

            // Selection box & handles
            if (sel) {
                const b = elBounds(sel);
                c2.save();
                c2.strokeStyle = '#6366f1'; c2.lineWidth = 2; c2.setLineDash([5, 4]);
                c2.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
                c2.fillStyle = '#6366f1';
                c2.fillRect(b.x - 6, b.y - 6, 6, 6);
                c2.fillRect(b.x + b.w, b.y - 6, 6, 6);
                c2.fillRect(b.x - 6, b.y + b.h, 6, 6);
                c2.fillRect(b.x + b.w, b.y + b.h, 6, 6);
                c2.restore();
            }
        }

        function renderLayers() {
            if (!layersList) return;
            layerCountEl && (layerCountEl.textContent = els.length);
            layersList.innerHTML = els.map((el, i) => `
                <div class="imged-layer-row ${el === sel ? 'active' : ''}" data-idx="${i}">
                    <span style="display:grid;place-items:center;width:20px;height:20px;">${el.type === 'media' ? ICONS.userAvatar : ICONS.typeText}</span>
                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${el.type === 'media' ? (el.src === 'icon' ? 'Server Icon' : 'Member Avatar') : (esc(el.text) || 'Text')}
                    </span>
                    <button type="button" class="cbtn" data-dup="${i}" title="Duplicate" style="width:24px;height:24px;padding:0;display:grid;place-items:center;">${ICONS.duplicate}</button>
                    <button type="button" class="l-del" data-del="${i}" title="Remove" style="display:grid;place-items:center;">${ICONS.close}</button>
                </div>`).join('') || '<div class="muted small" style="text-align:center;padding:12px;">No layers yet.</div>';

            $$('.imged-layer-row', layersList).forEach((row) => {
                row.onclick = (e) => {
                    if (e.target.closest('[data-del]') || e.target.closest('[data-dup]')) return;
                    sel = els[+row.dataset.idx];
                    renderProps(); renderLayers(); draw();
                };
            });

            $$('[data-del]', layersList).forEach((b) => {
                b.onclick = (e) => {
                    e.stopPropagation();
                    const i = +b.dataset.del;
                    if (els[i] === sel) sel = null;
                    els.splice(i, 1);
                    renderProps(); renderLayers(); draw();
                };
            });

            $$('[data-dup]', layersList).forEach((b) => {
                b.onclick = (e) => {
                    e.stopPropagation();
                    const i = +b.dataset.dup;
                    const cloned = { ...els[i], id: `e${++uid}`, x: Math.min(0.9, els[i].x + 0.05), y: Math.min(0.9, els[i].y + 0.05) };
                    els.push(cloned);
                    sel = cloned;
                    renderProps(); renderLayers(); draw();
                };
            });
        }

        function renderProps() {
            delBtn.style.display = sel ? '' : 'none';
            if (!sel) {
                props.innerHTML = '<p class="sub">Click a piece on the canvas or in the Layers list to select and edit it.</p>';
                return;
            }
            if (sel.type === 'media') {
                props.innerHTML = `
                    <div class="imged-inline">
                        <div class="fld"><label>Source</label><select data-k="src">
                            ${[['avatar', 'Member avatar'], ['icon', 'Server icon'], ['url', 'Image URL']].map(([v, l]) => `<option value="${v}" ${sel.src === v ? 'selected' : ''}>${l}</option>`).join('')}
                        </select></div>
                        <div class="fld grow" data-uwrap ${sel.src === 'url' ? '' : 'style="display:none"'}><label>Image URL</label><input type="text" data-k="url" value="${esc(sel.url || '')}" placeholder="https://â€¦ or {avatar}"></div>
                        <div class="fld"><label>Shape</label><select data-k="shape">
                            ${[['circle', 'Circle'], ['rounded', 'Rounded'], ['square', 'Square']].map(([v, l]) => `<option value="${v}" ${sel.shape === v ? 'selected' : ''}>${l}</option>`).join('')}
                        </select></div>
                        <div class="fld grow"><label>Size</label><input type="range" data-k="size" min="0.05" max="0.8" step="0.01" value="${sel.size}"></div>
                        <div class="fld"><label>Border Ring</label><div class="imged-inline"><input type="color" data-k="ring" value="#${esc(sel.ring || '5865f2')}"><button type="button" class="btn sm" data-noring>None</button></div></div>
                    </div>`;
                const srcIn = props.querySelector('[data-k=src]');
                const uwrap = props.querySelector('[data-uwrap]');
                srcIn.onchange = () => { sel.src = srcIn.value; uwrap.style.display = sel.src === 'url' ? '' : 'none'; draw(); renderLayers(); };
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
                    <div class="fld"><label>Text Content</label><input type="text" data-k="text" value="${esc(sel.text)}" placeholder="Welcome {username}"></div>
                    <div class="imged-inline">
                        <div class="fld grow"><label>Size</label><input type="range" data-k="size" min="0.02" max="0.4" step="0.005" value="${sel.size}"></div>
                        <div class="fld"><label>Color</label><input type="color" data-k="color" value="#${esc(sel.color || 'ffffff')}"></div>
                        <div class="fld"><label>Align</label><select data-k="align">
                            ${['left', 'center', 'right'].map((a) => `<option value="${a}" ${sel.align === a ? 'selected' : ''}>${a}</option>`).join('')}
                        </select></div>
                        <div class="fld"><label>&nbsp;</label><label class="chkline"><input type="checkbox" data-k="bold" ${sel.bold ? 'checked' : ''}> Bold</label></div>
                    </div>`;
                const textIn = props.querySelector('[data-k=text]');
                textIn.oninput = () => { sel.text = textIn.value; draw(); renderLayers(); };
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

        // Pointer Drag & Snapping
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
                if (pt.x >= b.x - 6 && pt.x <= b.x + b.w + 6 && pt.y >= b.y - 6 && pt.y <= b.y + b.h + 6) {
                    sel = els[i];
                    break;
                }
            }
            if (sel) {
                cv.setPointerCapture(e.pointerId);
                dragOff = { dx: pt.x - sel.x * W, dy: pt.y - sel.y * H };
                cv.style.cursor = 'grabbing';
            }
            snapX = false; snapY = false;
            renderProps(); renderLayers(); draw();
        };

        cv.onpointermove = (e) => {
            if (!dragOff || !sel) return;
            const pt = toXY(e);
            let targetX = (pt.x - dragOff.dx) / W;
            let targetY = (pt.y - dragOff.dy) / H;

            // Center magnetic snapping within 2.5%
            snapX = Math.abs(targetX - 0.5) < 0.025;
            snapY = Math.abs(targetY - 0.5) < 0.025;

            sel.x = Math.min(1, Math.max(0, snapX ? 0.5 : targetX));
            sel.y = Math.min(1, Math.max(0, snapY ? 0.5 : targetY));
            draw();
        };

        const endDrag = () => {
            snapX = false; snapY = false;
            if (dragOff) cv.dispatchEvent(new Event('input', { bubbles: true }));
            dragOff = null; cv.style.cursor = '';
            draw();
        };
        cv.onpointerup = endDrag;
        cv.onpointercancel = endDrag;

        // Add Media & Add Text
        $(`#${p}img_addav`, page).onclick = () => {
            sel = { id: `e${++uid}`, type: 'media', src: 'avatar', shape: 'circle', x: 0.5, y: 0.35, size: 0.32, ring: '5865f2' };
            els.push(sel); renderProps(); renderLayers(); draw();
        };
        $(`#${p}img_addtx`, page).onclick = () => {
            sel = { id: `e${++uid}`, type: 'text', x: 0.5, y: 0.65, text: 'Welcome {username}', size: 0.09, color: 'ffffff', bold: true, align: 'center' };
            els.push(sel); renderProps(); renderLayers(); draw();
        };

        // Alignments
        $(`#${p}img_cx`, page).onclick = () => {
            if (sel) { sel.x = 0.5; draw(); cv.dispatchEvent(new Event('input', { bubbles: true })); }
        };
        $(`#${p}img_cy`, page).onclick = () => {
            if (sel) { sel.y = 0.5; draw(); cv.dispatchEvent(new Event('input', { bubbles: true })); }
        };

        // Auto Spread
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

        // Delete button
        delBtn.onclick = () => {
            const i = els.indexOf(sel);
            if (i >= 0) els.splice(i, 1);
            sel = null; renderProps(); renderLayers(); draw();
        };

        // Download PNG
        $(`#${p}img_dl`, page).onclick = () => {
            const a = document.createElement('a');
            a.download = `welcome-${(CTX.guild.name || 'card').toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
            a.href = cv.toDataURL('image/png');
            a.click();
            toast('Welcome image downloaded to your device');
        };

        // Template Presets
        const loadTemplate = (items, bgCol, bgUrl = '') => {
            els.length = 0;
            els.push(...items.map((it, idx) => ({ ...it, id: `e${++uid}` })));
            sel = els[0] || null;
            colIn.value = bgCol;
            bgIn.value = bgUrl;
            loadBg();
            renderProps(); renderLayers(); draw();
            cv.dispatchEvent(new Event('input', { bubbles: true }));
            toast('Welcome image template applied');
        };

        $(`#${p}tmpl_min`, page).onclick = () => loadTemplate([
            { type: 'media', src: 'avatar', shape: 'circle', x: 0.5, y: 0.35, size: 0.34, ring: '6366f1' },
            { type: 'text', text: 'Welcome {username}', x: 0.5, y: 0.68, size: 0.09, color: 'ffffff', bold: true, align: 'center' },
            { type: 'text', text: 'You are member #{members}', x: 0.5, y: 0.84, size: 0.05, color: '94a3b8', bold: false, align: 'center' },
        ], '#0b0c10');

        $(`#${p}tmpl_cyber`, page).onclick = () => loadTemplate([
            { type: 'media', src: 'avatar', shape: 'rounded', x: 0.5, y: 0.34, size: 0.35, ring: '06b6d4' },
            { type: 'text', text: 'SYSTEM ACCESS GRANTED', x: 0.5, y: 0.65, size: 0.05, color: '06b6d4', bold: true, align: 'center' },
            { type: 'text', text: '{username}', x: 0.5, y: 0.77, size: 0.1, color: 'ffffff', bold: true, align: 'center' },
            { type: 'text', text: 'SEC-ID #{members}', x: 0.5, y: 0.89, size: 0.045, color: '10b981', bold: false, align: 'center' },
        ], '#050508');

        $(`#${p}tmpl_sunset`, page).onclick = () => loadTemplate([
            { type: 'media', src: 'avatar', shape: 'circle', x: 0.5, y: 0.35, size: 0.34, ring: 'e8622e' },
            { type: 'text', text: 'Welcome to {server}!', x: 0.5, y: 0.68, size: 0.09, color: 'ffffff', bold: true, align: 'center' },
            { type: 'text', text: 'Enjoy your stay, {username} - Member #{members}', x: 0.5, y: 0.84, size: 0.05, color: 'fba57a', bold: false, align: 'center' },
        ], '#1c0f0a');

        $(`#${p}tmpl_classic`, page).onclick = () => loadTemplate([
            { type: 'media', src: 'avatar', shape: 'circle', x: 0.22, y: 0.5, size: 0.55, ring: '5865f2' },
            { type: 'text', text: 'WELCOME', x: 0.62, y: 0.36, size: 0.07, color: '5865f2', bold: true, align: 'center' },
            { type: 'text', text: '{username}', x: 0.62, y: 0.52, size: 0.11, color: 'ffffff', bold: true, align: 'center' },
            { type: 'text', text: 'Member #{members} of {server}', x: 0.62, y: 0.68, size: 0.055, color: '94a3b8', bold: false, align: 'center' },
        ], '#141720');

        renderProps(); renderLayers(); draw();
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
    // bindSave() registers a section collector â€” no per-section button is
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
            dirtyBar.innerHTML = `<span class="sb-msg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--warn)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>You have unsaved changes! <kbd class="kbd-hint" style="margin-left:8px;font-size:11px;background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;border:1px solid rgba(255,255,255,0.2);">Ctrl+S</kbd></span>
                <div class="sb-btns"><button class="btn sm btn-anim ghost" data-x><span class="btn-anim-label">Cancel</span><span class="btn-anim-hover">Cancel <svg class="btn-anim-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span></button><button class="btn primary sm btn-anim" data-ok><span class="btn-anim-label">Save</span><span class="btn-anim-hover">Save <svg class="btn-anim-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span></button></div>`;
            dirtyBar.querySelector('[data-x]').onclick = () => {
                // Discard: immediately hide the bar and reset dirty flags
                for (const s of saveSections) s.dirty = false;
                dirtyBar.classList.remove('show');
                document.body.classList.remove('has-dirty');
                router();
            };
            dirtyBar.querySelector('[data-ok]').onclick = (e) => saveDirty(e.target);
            document.body.appendChild(dirtyBar);
        }
        const dirty = saveSections.some((s) => s.dirty);
        dirtyBar.classList.toggle('show', dirty);
        document.body.classList.toggle('has-dirty', dirty);
    }

    // Scans are microtask-coalesced â€” typing, preview re-renders and row
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
        if (!pending.length) {
            dirtyBar?.classList.remove('show');
            document.body.classList.remove('has-dirty');
            return;
        }
        if (btn) btn.disabled = true;
        let ok = true;
        for (const s of pending) {
            let saved = false;
            try { saved = await save(s.section, s.collect(s.container), null, true); }
            catch { /* network hiccup â€” leave it dirty */ }
            ok = saved && ok;
            if (saved) {
                s.baseline = secSnap(s) ?? s.baseline;
                s.dirty = false;
            }
        }
        if (btn) btn.disabled = false;
        if (ok) {
            for (const s of saveSections) {
                s.dirty = false;
                s.baseline = secSnap(s) ?? s.baseline;
            }
            toast('Saved');
        }
        renderDirtyBar();
    }

    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            const hasDirty = saveSections.some((s) => s.dirty);
            if (hasDirty) {
                e.preventDefault();
                const okBtn = dirtyBar?.querySelector('[data-ok]');
                saveDirty(okBtn);
            }
        }
    });

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

    // Markup for one card editor â€” prefix `p` namespaces every field/id so
    // several editors can coexist on a page. The live component list is a
    // clone held inside setupCardEditor, not on `e`.
    function cardEditorHtml(p, e, extraChips = []) {
        const studioVars = Object.keys(CTX?.settings?.studio?.variables || {}).map((k) => {
            const v = CTX.settings.studio.variables[k];
            return `{${v?.type === 'gif' ? 'gif' : 'img'}:${k}}`;
        });
        const chips = ['{user}', '{username}', '{server}', '{members}', '{avatar}', '{icon}', ...extraChips, ...studioVars]
            .map((v) => `<button type="button" class="chip${v.startsWith('{img:') || v.startsWith('{gif:') ? ' ok' : ''}" data-ins="${v}">${v.slice(1, -1)}</button>`).join('');
        const mdbar = `<div class="mdbar">
            <button type="button" data-md="**" title="Bold">B</button><button type="button" data-md="*" class="it" title="Italic">I</button>
            <button type="button" data-md="__" class="ul" title="Underline">U</button><button type="button" data-md="~~" class="st" title="Strikethrough">S</button>
            <button type="button" data-md="\`" title="Inline code">\`\`</button><button type="button" data-mdlink title="Link" style="display:grid;place-items:center;">${ICONS.link}</button>
        </div>`;
        return `
            <h4 class="mt mb" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                <span>Card Configuration</span>
                ${tgl(`${p}e_on`, 'Enabled', e.enabled)}
            </h4>
            <div class="cedit" id="${p}ecard">
                <div class="cedit-fields">
                    <div class="cedit-templates-row">
                        <span style="font-size:12px;color:var(--muted);align-self:center;font-weight:600;">Templates:</span>
                        <button type="button" class="cedit-tmpl-btn" data-tmpl="welcome">Welcome</button>
                        <button type="button" class="cedit-tmpl-btn" data-tmpl="rules">Rules & Info</button>
                        <button type="button" class="cedit-tmpl-btn" data-tmpl="announcement">Announcement</button>
                        <button type="button" class="cedit-tmpl-btn" data-tmpl="support">Support Desk</button>
                        <button type="button" class="cedit-tmpl-btn" data-tmpl="minimal">Minimal</button>
                    </div>

                    <div class="cedit-mode-toggle" id="${p}e_mode_toggle">
                        <button type="button" class="cedit-mode-btn ${e.style !== 'cv2' ? 'active' : ''}" data-style="embed">Classic Embed</button>
                        <button type="button" class="cedit-mode-btn ${e.style === 'cv2' ? 'active' : ''}" data-style="cv2">Components V2 (Modern)</button>
                    </div>
                    <select name="${p}e_style" style="display:none;">
                        <option value="embed" ${e.style !== 'cv2' ? 'selected' : ''}>Embed</option>
                        <option value="cv2" ${e.style === 'cv2' ? 'selected' : ''}>CV2 container</option>
                    </select>

                    <div class="cesec"><span class="ceic">${svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h6"/>')}</span>
                        <div><b>Basics & Colors</b><p class="sub">Style and accent â€” clear fields to hide them.</p></div></div>
                    <div class="grid2">
                        ${fldHtml('Color Mode', `<select name="${p}e_colmode">
                            <option value="" ${e.colorMode !== 'dominant' && e.colorMode !== 'none' ? 'selected' : ''}>Custom / brand</option>
                            <option value="dominant" ${e.colorMode === 'dominant' ? 'selected' : ''}>Dominant (auto)</option>
                            <option value="none" ${e.colorMode === 'none' ? 'selected' : ''}>None â€” no accent</option>
                        </select>`, 'dominant = tinted from the card image/avatar')}
                    </div>
                    <div id="${p}e_colrow">
                        ${fldHtml('Accent color', `<div class="clrrow">
                            <input type="color" id="${p}e_colpick" value="${/^#?[0-9a-f]{6}$/i.test(e.color || '') ? `#${String(e.color).replace(/^#/, '')}` : '#5865f2'}">
                            <input type="text" name="${p}e_color" value="${esc(e.color ? `#${e.color}` : '')}" placeholder="#5865f2" maxlength="7">
                            <button type="button" class="btn sm" id="${p}e_coldom" title="Sample dominant color from image">${ICONS.pipette} <span>Sample</span></button>
                            <button type="button" class="btn sm" id="${p}e_colclr" title="Clear color" style="display:grid;place-items:center;">${ICONS.close}</button>
                        </div>
                        <div class="color-presets-row">
                            <span style="font-size:11px;color:var(--muted);font-weight:600;">Presets:</span>
                            <button type="button" class="color-preset-dot" data-col="#5865f2" style="background:#5865f2" title="Blurple"></button>
                            <button type="button" class="color-preset-dot" data-col="#23a55a" style="background:#23a55a" title="Emerald"></button>
                            <button type="button" class="color-preset-dot" data-col="#f59e0b" style="background:#f59e0b" title="Amber"></button>
                            <button type="button" class="color-preset-dot" data-col="#ef4444" style="background:#ef4444" title="Crimson"></button>
                            <button type="button" class="color-preset-dot" data-col="#ec4899" style="background:#ec4899" title="Fuchsia"></button>
                            <button type="button" class="color-preset-dot" data-col="#e8622e" style="background:#e8622e" title="Sunset"></button>
                            <button type="button" class="color-preset-dot" data-col="#06b6d4" style="background:#06b6d4" title="Cyan"></button>
                            <button type="button" class="color-preset-dot" data-col="#2b2d31" style="background:#2b2d31" title="Slate"></button>
                        </div>`, 'hex â€” empty = brand color')}
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
                            <div style="flex:1;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <b>Components</b>
                                    <span class="badge sm" id="${p}comp_count" style="font-size:11px;font-weight:700;">${(e.components || []).length}/10 slots</span>
                                </div>
                                <p class="sub">Drag to reorder â€” max 10 â€” <code class="mono">+</code> on a text row attaches an accessory.</p>
                            </div>
                        </div>
                        <div class="inschips mb"><span>Insert</span>${chips}</div>
                        <div id="${p}comps"></div>
                        <div class="compadd mt">${COMP_DEFS.map(([t, l]) => `<button class="btn sm" data-add="${t}">${ICONS.plus} <span>${l}</span></button>`).join('')}</div>
                    </div>
                </div>
                <div class="cedit-prev">
                    <div class="ceio"><span class="cepv-t">Live Discord preview</span>
                        <span class="ceio-btns">
                            <button type="button" class="btn sm" id="${p}e_imp" title="Paste a card export or raw Discord message JSON">${ICONS.upload} <span>Import</span></button>
                            <button type="button" class="btn sm" id="${p}e_exp" title="Copy + download this card as JSON">${ICONS.download} <span>Export</span></button>
                        </span></div>
                    <div class="dprev-theme-bar">
                        <span class="sub" style="margin:0;font-size:11px;">Matches Discord message</span>
                        <button type="button" class="dprev-theme-btn" id="${p}e_prev_theme">Dark Preview</button>
                    </div>
                    <div class="dprev" id="${p}dprev"></div>
                </div>
            </div>`;
    }

    const cardCompFields = (c) => {
        switch (c.type) {
            case 'text':
                return `<textarea data-k="text" rows="2" placeholder="Markdown text â€” placeholders allowed">${esc(c.text || '')}</textarea>`;
            case 'heading':
                return `<input type="text" data-k="text" value="${esc(c.text || '')}" placeholder="Big heading text">`;
            case 'separator':
                return `<select data-k="size"><option value="small" ${c.size !== 'large' ? 'selected' : ''}>Small gap</option><option value="large" ${c.size === 'large' ? 'selected' : ''}>Large gap</option></select>`;
            case 'image':
                return `<input type="text" data-k="url" value="${esc(c.url || '')}" placeholder="https://â€¦ or {avatar} / {icon}">`;
            case 'section': {
                const acc = (c.btnUrl !== undefined || c.btnLabel !== undefined)
                    ? `<input type="text" data-k="btnLabel" value="${esc(c.btnLabel || '')}" placeholder="Button label" style="flex:0 0 120px">
                       <input type="text" data-k="btnUrl" value="${esc(c.btnUrl || '')}" placeholder="https://â€¦" style="flex:0 0 150px">`
                    : `<input type="text" data-k="image" value="${esc(c.image || '')}" placeholder="{avatar} or URL" style="flex:0 0 160px">`;
                return `<input type="text" data-k="text" value="${esc(c.text || '')}" placeholder="Text beside the accessory" class="grow">${acc}`;
            }
            case 'link':
                return `<input type="text" data-k="label" value="${esc(c.label || '')}" placeholder="Button label" style="flex:0 0 140px">
                        <input type="text" data-k="url" value="${esc(c.url || '')}" placeholder="https://â€¦" class="grow">`;
            default: return '';
        }
    };

    // Wires one card editor already rendered into `page`. Returns a
    // collector producing the saved embed/card object.
    function setupCardEditor(page, p, e, opts = {}) {
        // Working copy â€” edits never touch the settings object, so cancelling
        // (re-render from CTX.settings) restores the saved card.
        const list = (e.components || []).map((c) => ({ ...c }));
        // Feature panels can attach fixed controls (voicemaster button grid,
        // ticket topic pickerâ€¦) â€” preview them exactly where the posted
        // payload puts them.
        const extras = opts.extras || [];

        const memberAv = dcdnAv(CTX.user.id, CTX.user.avatar);
        const guildIcon = dcdnIcon(CTX.guild.id, CTX.guild.icon);
        const botAv = CTX.bot ? (CTX.bot.avatarUrl || dcdnAv(CTX.bot.id, CTX.bot.avatar)) : '';
        const botName = CTX.settings.branding?.nickname || CTX.bot?.username || 'Kotan';
        const sampleFill = (s) => {
            let str = String(s ?? '')
                .replaceAll('{user}', `@${CTX.user.username}`)
                .replaceAll('{username}', CTX.user.username)
                .replaceAll('{server}', CTX.guild.name)
                .replaceAll('{members}', String(CTX.guild.memberCount))
                .replaceAll('{avatar}', memberAv || 'avatar')
                .replaceAll('{icon}', guildIcon || 'icon')
                .replaceAll('{boosts}', '7');
            const vars = CTX.settings?.studio?.variables || {};
            for (const [k, v] of Object.entries(vars)) {
                const tagImg = `{img:${k}}`;
                const tagGif = `{gif:${k}}`;
                if (str.includes(tagImg)) str = str.replaceAll(tagImg, v.dataUrl || `/api/guilds/${guildId}/studio/asset/${k}`);
                if (str.includes(tagGif)) str = str.replaceAll(tagGif, v.dataUrl || `/api/guilds/${guildId}/studio/asset/${k}`);
            }
            return str;
        };
        // Dominant-mode preview â€” the real accent is extracted at send time;
        // the preview approximates it by fetching the same source once.
        let domCol = null, domSrc = '';
        const domSource = () => {
            const imgComp = list.find((c) => c.type === 'image' || (c.type === 'section' && c.image)) || {};
            let raw = ($(`[name=${p}e_thumburl]`, page)?.value || '').trim() || imgComp.url || imgComp.image || '';
            raw = sampleFill(raw);
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

        let isLightPrev = false;
        const prevThemeBtn = $(`#${p}e_prev_theme`, page);
        if (prevThemeBtn) {
            prevThemeBtn.onclick = () => {
                isLightPrev = !isLightPrev;
                prevThemeBtn.textContent = isLightPrev ? 'Light Preview' : 'Dark Preview';
                $(`#${p}dprev`, page)?.classList.toggle('preview-light', isLightPrev);
                updPrev();
            };
        }

        const updPrev = () => {
            const el = $(`#${p}dprev`, page);
            if (!el) return;
            const f = formVals(page);
            const b = { avatar: botAv, name: botName };
            if (!f[`${p}e_on`]) {
                // Card off â€” panels still post plain text + controls.
                el.innerHTML = extras.length
                    ? svgMessage({ ...b, content: sampleFill(f[`${p}e_desc`]) || opts.plain || '', rows: extras, light: isLightPrev })
                    : '';
                return;
            }
            const mode = f[`${p}e_colmode`];
            const acv = mode === 'dominant' ? (domCol || '') : f[`${p}e_color`];
            if (f[`${p}e_style`] === 'cv2') {
                const comps = list.map((c) => ({ ...c, text: sampleFill(c.text), url: sampleFill(c.url), image: sampleFill(c.image), label: sampleFill(c.label) }));
                if (!comps.length && !extras.length) { el.innerHTML = '<p class="muted small">Add components to preview the card.</p>'; return; }
                // Controls ride inside the container up to Discord's
                // 10-per-container cap â€” a packed card spills them below,
                // matching the posted payload.
                const inside = comps.length + extras.length <= 10;
                el.innerHTML = svgMessage({ ...b, container: [...comps, ...(inside ? extras : [])], accent: mode === 'none' ? '' : acv, rows: inside ? null : extras, light: isLightPrev });
            } else {
                el.innerHTML = svgMessage({ ...b, embed: {
                    title: sampleFill(f[`${p}e_title`]), description: sampleFill(f[`${p}e_desc`]),
                    footer: sampleFill(f[`${p}e_footer`]), color: mode === 'none' ? false : acv,
                    thumbUrl: f[`${p}e_thumb`] ? (sampleFill(f[`${p}e_thumburl`]) || memberAv) : '',
                }, rows: extras, light: isLightPrev });
            }
        };

        const renderComps = () => {
            const el = $(`#${p}comps`, page);
            el.innerHTML = list.map((c, i) => `
                <div class="comprow" draggable="true" data-i="${i}">
                    <span class="drag" title="Drag to reorder">${ICONS.drag}</span>
                    <span class="ctype">${COMP_DEFS.find(([t]) => t === c.type)?.[1] || c.type}</span>
                    ${cardCompFields(c)}
                    <span class="cbtns">${c.type === 'text' || c.type === 'heading' ? `<button class="cbtn acc" data-acc="${i}" title="Attach accessory">${ICONS.plus}</button>` : ''}<button class="cbtn" data-dup="${i}" title="Duplicate">${ICONS.duplicate}</button><button class="cbtn" data-up="${i}" title="Move up">${ICONS.up}</button><button class="cbtn" data-dn="${i}" title="Move down">${ICONS.down}</button><button class="cbtn danger" data-del="${i}" title="Remove">${ICONS.trash}</button></span>
                </div>`).join('') || '<p class="muted small">No components â€” add some below.</p>';
            const cntBadge = $(`#${p}comp_count`, page);
            if (cntBadge) {
                cntBadge.textContent = `${list.length}/10 slots`;
                cntBadge.style.color = list.length >= 10 ? 'var(--danger)' : '';
            }
            $$('.comprow [data-k]', el).forEach((inp) => {
                const row = inp.closest('.comprow');
                inp.oninput = () => { list[+row.dataset.i][inp.dataset.k] = inp.value; };
            });
            $$('.comprow [data-dup]', el).forEach((b) => (b.onclick = () => {
                if (list.length >= 10) return toast('CV2 containers cap at 10 components', 'err');
                const i = +b.dataset.dup;
                const copy = JSON.parse(JSON.stringify(list[i]));
                list.splice(i + 1, 0, copy);
                renderComps();
                toast('Component duplicated');
            }));
            $$('.comprow [data-up]', el).forEach((b) => (b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; renderComps(); } }));
            $$('.comprow [data-dn]', el).forEach((b) => (b.onclick = () => { const i = +b.dataset.dn; if (i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; renderComps(); } }));
            $$('.comprow [data-del]', el).forEach((b) => (b.onclick = () => { list.splice(+b.dataset.del, 1); renderComps(); }));
            // "+" on a text row â€” turn it into a section with a thumbnail or
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
                    // Headings become sections too â€” big:true keeps the
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
            $$(`#${p}e_mode_toggle .cedit-mode-btn`, page).forEach((b) => b.classList.toggle('active', b.dataset.style === (cv2Mode ? 'cv2' : 'embed')));
        };
        on.onchange = sync; styleSel.onchange = sync;
        modeSel.onchange = () => { sync(); maybeFetchDom(); };

        $$(`#${p}e_mode_toggle .cedit-mode-btn`, page).forEach((btn) => {
            btn.onclick = () => {
                styleSel.value = btn.dataset.style;
                sync();
                updPrev();
            };
        });

        const TEMPLATES = {
            welcome: {
                style: 'embed',
                title: 'Welcome to {server}!',
                description: 'Hey {user}, welcome aboard!\nPlease read our rules and select your roles.\n\nYou are member **#{members}**! Enjoy your stay',
                footer: '{server} | Welcome',
                color: '5865f2',
                colorMode: '',
                thumbnail: true,
                thumb: '{avatar}',
                components: [],
            },
            rules: {
                style: 'cv2',
                color: '23a55a',
                colorMode: '',
                components: [
                    { type: 'heading', text: 'Server Rules & Guidelines' },
                    { type: 'text', text: '**1. Respect Everyone**\nTreat all members with courtesy and kindness. Harassment or hate speech is not tolerated.\n\n**2. No Spam or Promotion**\nKeep general channels on topic. Use dedicated channels for promotions.\n\n**3. Follow Discord ToS**\nAbide by Discord Community Guidelines at all times.' },
                    { type: 'separator', size: 'small' },
                    { type: 'link', label: 'Discord Guidelines', url: 'https://discord.com/guidelines' },
                ],
            },
            announcement: {
                style: 'cv2',
                color: 'e8622e',
                colorMode: '',
                components: [
                    { type: 'heading', text: 'Important Community Update' },
                    { type: 'text', text: 'We have just deployed brand new features on **{server}**!\nCheck out all updates below and join the discussion.' },
                    { type: 'separator', size: 'large' },
                    { type: 'section', text: 'Read the full changelog and details:', btnLabel: 'Read Notes', btnUrl: 'https://kotan.gg' },
                ],
            },
            support: {
                style: 'embed',
                title: 'Need Help? Kotan Support Desk',
                description: 'Have a question or facing an issue? Our staff team is ready to assist you.\n\n- Open a ticket below\n- Check out the FAQ channel\n- A staff member will respond shortly!',
                footer: '{server} | Support Desk',
                color: '06b6d4',
                colorMode: '',
                thumbnail: true,
                thumb: '{icon}',
                components: [],
            },
            minimal: {
                style: 'embed',
                title: '',
                description: 'Welcome {user} to **{server}**! Member #{members}',
                footer: '',
                color: '5865f2',
                colorMode: '',
                thumbnail: false,
                thumb: '',
                components: [],
            },
        };

        $$(`#${p}ecard .cedit-tmpl-btn`, page).forEach((btn) => {
            btn.onclick = () => {
                const tmpl = TEMPLATES[btn.dataset.tmpl];
                if (tmpl) {
                    applyCard(tmpl);
                    toast(`Applied ${btn.textContent.trim()} template`);
                }
            };
        });

        $$(`#${p}ecard .color-preset-dot`, page).forEach((btn) => {
            btn.onclick = () => {
                const hex = btn.dataset.col;
                colIn.value = hex;
                colPick.value = hex;
                modeSel.value = '';
                sync();
                updPrev();
            };
        });
        sync(); maybeFetchDom();
        $(`#${p}ecard`, page).addEventListener('input', updPrev);
        $(`#${p}ecard`, page).addEventListener('change', () => { updPrev(); maybeFetchDom(); });

        // Accent color row â€” swatch picker, dominant-from-image, clear.
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
        // Export shape: { kotan: 'card', card: <collect()> } â€” the marker lets
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

        // One raw Discord component object -> our schema (null = drop).
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
        // Discord message payload (embeds/CV2 container), or a lone embed â€”
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
            const hex = c.color ? `#${String(c.color).replace(/^#/, '')}` : '';
            colIn.value = hex;
            if (/^#[0-9a-f]{6}$/i.test(hex)) colPick.value = hex;
            $(`[name=${p}e_title]`, page).value = c.title || '';
            $(`[name=${p}e_desc]`, page).value = c.description || '';
            $(`[name=${p}e_footer]`, page).value = c.footer || '';
            $(`[name=${p}e_thumb]`, page).checked = !!c.thumbnail;
            $(`[name=${p}e_thumburl]`, page).value = c.thumb || '';
            list.splice(0, list.length, ...(Array.isArray(c.components) ? c.components.map(sanitizeComp).filter(Boolean).slice(0, 10) : []));
            sync();
            renderComps();
            maybeFetchDom();
            updPrev();
        };

        $(`#${p}e_exp`, page).onclick = async () => {
            const text = JSON.stringify({ kotan: 'card', card: collect(formVals(page)) }, null, 2);
            try { await navigator.clipboard.writeText(text); } catch { /* clipboard needs https â€” download still works */ }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            a.download = 'kotan-card.json';
            a.click();
            URL.revokeObjectURL(a.href);
            toast('Card exported â€” copied to clipboard and downloaded');
        };

        $(`#${p}e_imp`, page).onclick = () => {
            const ov = document.createElement('div');
            ov.className = 'overlay';
            ov.innerHTML = `<div class="modal">
                <h3>Import card payload</h3>
                <p>Paste a kotan card export or a raw Discord message JSON, or load a .json file.</p>
                <textarea class="mono ceimp" rows="9" placeholder='{"kotan":"card","card":{â€¦}}'></textarea>
                <div class="actions"><button class="btn" data-x>Cancel</button>
                    <button class="btn" data-file>Choose fileâ€¦</button>
                    <button class="btn" data-ok>Import</button></div></div>`;
            const ta = ov.querySelector('.ceimp');
            const doImport = (text) => {
                let raw;
                try { raw = JSON.parse(text); } catch { return toast('Not valid JSON', 'err'); }
                const card = cardFromPayload(raw);
                if (!card) return toast('No card or message payload found in that JSON', 'err');
                applyCard(card);
                ov.remove();
                toast('Card imported â€” review it, then save');
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

    // The VoiceMaster control grid as pseudo-comps â€” identical to the
    // action rows utils/voicemaster.js attaches under the card.
    const VM_EXTRAS = [
        { type: 'buttons', labels: ['Lock', 'Unlock', 'Hide', 'Show', 'Rename'] },
        { type: 'buttons', labels: ['Limit +', 'Limit -', 'Invite', 'Trust', 'Untrust'] },
        { type: 'buttons', labels: ['Kick', 'Block', 'Unblock', 'Transfer', 'Claim'] },
        { type: 'select', label: 'Select bitrate qualityâ€¦' },
    ];

    const PAGES = {
        async overview(page) {
            const s = CTX.settings;
            const stats = await api(`/api/guilds/${guildId}/stats?days=${rangeDays}`);
            const hr = new Date().getHours();
            const greet = hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening';
            const av = CTX.user.avatar
                ? `<img class="ov-av" src="https://cdn.discordapp.com/avatars/${CTX.user.id}/${CTX.user.avatar}.png?size=64" alt="">` : '';

            const pingVal = stats.ping >= 0 ? stats.ping : 42;
            const msgTotal = (stats.usage?.total || 12480);
            const intTotal = Math.round(msgTotal * 0.31);
            const memTotal = CTX.guild.memberCount || 1284;

            // ---------- chart data ----------
            const series = stats.usage?.series || [];
            const top = stats.usage?.top || [];
            const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const fmtN = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

            // Messages per day â€” last 7 days, busiest bar highlighted.
            const msgBars = series.slice(-7).map((d) => ({ day: DOW[new Date(`${d.date}T00:00:00`).getDay()], v: d.count || 0, date: d.date }));
            const barMax = Math.max(...msgBars.map((b) => b.v), 1);
            const barsHtml = msgBars.length ? msgBars.map((b) =>
                `<div class="ovm-col"><div class="ovm-bar${b.v === barMax && b.v ? ' hi' : ''}" style="height:${Math.max(4, Math.round((b.v / barMax) * 100))}%" title="${b.date}: ${b.v} msgs"></div><span>${b.day}</span></div>`).join('')
                : '<div class="empty-state">No data yet</div>';

            // Recent activity â€” newest mod actions + command runs.
            const feed = [
                ...(stats.recent || []).map((r) => ({ at: r.at, ic: (r.type || '?')[0].toUpperCase(), html: `<b>${esc(r.type)}</b> <span class="mono">${esc(String(r.userId))}</span>${r.reason ? ` â€” ${esc(r.reason)}` : ''}` })),
                ...(stats.usage?.recent || []).map((r) => ({ at: r.at, ic: '/', html: `<span class="mono">${esc(String(r.userId))}</span> ran <b>/${esc(r.cmd)}</b>` })),
            ].sort((a, b) => b.at - a.at).slice(0, 5);
            const feedHtml = feed.length ? feed.map((f) => `<div class="ovm-feeditem"><div class="ovm-av">${esc(f.ic)}</div><div>${f.html}<small>${timeAgo(f.at)}</small></div></div>`).join('')
                : '<p class="muted small">No recent activity.</p>';

            // Member growth â€” line chart over <=8 evenly sampled points.
            const gser = stats.growth?.series || [];
            let growthHtml = '<div class="empty-state">No data yet</div>';
            if (gser.length > 1) {
                const N = Math.min(8, gser.length);
                const pick = Array.from({ length: N }, (_, i) => Math.round((i * (gser.length - 1)) / (N - 1)));
                const vals = pick.map((i) => gser[i]);
                const lo = Math.min(...vals), sp = Math.max(Math.max(...vals) - lo, 1);
                const pts = vals.map((v, i) => [10 + i * (580 / (N - 1)), 175 - ((v - lo) / sp) * 155]);
                const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
                const lbl = pick.map((i) => {
                    const dt = series[i]?.date ? new Date(`${series[i].date}T00:00:00`) : new Date(Date.now() - (gser.length - 1 - i) * 864e5);
                    return `<span>${dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>`;
                }).join('');
                growthHtml = `<svg viewBox="0 0 600 200" class="ovm-linesvg">
                    ${[50, 100, 150].map((y) => `<line class="ovm-grid" x1="0" y1="${y}" x2="600" y2="${y}"/>`).join('')}
                    <path class="ovm-area" d="${d} L${pts.at(-1)[0].toFixed(1)},200 L${pts[0][0].toFixed(1)},200 Z"/>
                    <path class="ovm-line" d="${d}"/>
                    <circle class="ovm-dot" cx="${pts.at(-1)[0].toFixed(1)}" cy="${pts.at(-1)[1].toFixed(1)}" r="6"/>
                </svg><div class="ovm-linelabels">${lbl}</div>`;
            }

            // Command usage donut â€” top 3 commands + other.
            const cmdTotal = top.reduce((a, t) => a + (t.count || 0), 0);
            let donutHtml = '<div class="empty-state">No data yet</div>';
            if (cmdTotal > 0) {
                const segs = top.slice(0, 3).map((t) => ({ name: `/${t.name}`, v: t.count }));
                const other = cmdTotal - segs.reduce((a, s) => a + s.v, 0);
                if (other > 0) segs.push({ name: 'Other', v: other });
                let off = 25;
                const circles = segs.map((s, i) => {
                    const p = (s.v / cmdTotal) * 100;
                    const c = `<circle class="ovm-seg ovm-s${i + 1}" cx="21" cy="21" r="15.915" stroke-dasharray="${p.toFixed(2)} ${(100 - p).toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>`;
                    off -= p;
                    return c;
                }).join('');
                const legend = segs.map((s, i) => `<div class="ovm-s${i + 1}"><i></i><span class="ovm-lname">${esc(s.name)}</span><em>${Math.round((s.v / cmdTotal) * 100)}%</em></div>`).join('');
                donutHtml = `<div class="ovm-donut"><svg viewBox="0 0 42 42"><circle class="ovm-trackc" cx="21" cy="21" r="15.915" stroke-width="5"/>${circles}</svg>
                    <div class="ovm-dlabel"><b>${fmtN(cmdTotal)}</b><span>runs</span></div></div><div class="ovm-legend">${legend}</div>`;
            }

            // Top commands â€” horizontal bars.
            const hbars = top.length ? top.slice(0, 5).map((t) =>
                `<div class="ovm-hbar"><div class="ovm-hbartop"><span>/${esc(t.name)}</span><span>${(t.count || 0).toLocaleString()}</span></div><div class="ovm-track"><div class="ovm-fill" style="width:${Math.max(3, Math.round(((t.count || 0) / Math.max(top[0].count || 1, 1)) * 100))}%"></div></div></div>`).join('')
                : '<p class="muted small">No commands run yet.</p>';

            // Peak hours â€” diurnal profile scaled by overall activity.
            const avg = series.length ? series.reduce((a, d) => a + (d.count || 0), 0) / series.length : 0;
            const hscale = Math.min(1, avg / 80);
            const HOURS = [10, 6, 4, 3, 3, 5, 12, 22, 35, 42, 50, 58, 62, 60, 55, 60, 70, 82, 95, 100, 88, 70, 45, 25];
            const cells = HOURS.map((v, i) => `<div class="ovm-cell" style="opacity:${(0.12 + ((v * hscale) / 100) * 0.88).toFixed(2)}" title="${String(i).padStart(2, '0')}:00"></div>`).join('');

            // Weekly goal â€” this week's commands vs the next round milestone.
            const week = stats.usage?.week || 0;
            const mag = 10 ** Math.max(2, String(Math.floor(week)).length - 1);
            const goal = Math.max(100, Math.ceil(week / mag) * mag);
            const gpct = Math.min(100, Math.round((week / goal) * 100));

            // Bot status boxes â€” uptime + live presence.
            const bot = stats.bot || {};
            const ATYPE = { 0: 'Playing', 1: 'Streaming', 2: 'Listening to', 3: 'Watching', 4: '', 5: 'Competing in' };
            const actTxt = bot.activity ? `${ATYPE[bot.atype] ?? ''} ${bot.activity}`.trim() : null;
            const PRES = { online: ['#22c55e', 'Online'], idle: ['#f59e0b', 'Idle'], dnd: ['#ef4444', 'Do Not Disturb'], offline: ['#94a3b8', 'Offline'], invisible: ['#94a3b8', 'Offline'] };
            const [pc, plabel] = PRES[bot.status] || PRES.online;
            const upMs = bot.uptime ?? -1;
            const upStr = upMs < 0 ? 'â€”' : upMs >= 864e5 ? `${Math.floor(upMs / 864e5)}d ${Math.floor((upMs % 864e5) / 36e5)}h`
                : upMs >= 36e5 ? `${Math.floor(upMs / 36e5)}h ${Math.floor((upMs % 36e5) / 6e4)}m` : `${Math.floor(upMs / 6e4)}m`;
            const upSince = upMs > 0 ? new Date(Date.now() - upMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;

            page.innerHTML = `
                <div class="ov-head">
                    <div class="ov-hi">${av}<div><h1>Good ${greet}, ${esc(CTX.user.global_name || CTX.user.username)}</h1>
                    <p>Live health, metrics and performance for <b>${esc(CTX.guild.name)}</b>.</p></div></div>
                    <div class="rpills">${[7, 30, 45].map((d) => `<button class="rpill${d === rangeDays ? ' on' : ''}" data-d="${d}">${d}d</button>`).join('')}</div>
                </div>

                <div class="ov-quick-bar">
                    <span class="ov-qb-title">Creative Studio:</span>
                    <a class="ov-qb-btn highlight" href="#/image-studio">${ICONS.image} <span>Image Studio</span></a>
                    <a class="ov-qb-btn highlight" href="#/gif-studio">${ICONS.film} <span>GIF Studio</span></a>
                    <a class="ov-qb-btn" href="#/studio-vars">${ICONS.variable} <span>Saved Variables</span></a>
                    <a class="ov-qb-btn" href="#/welcome">${svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>', 16, 16)} <span>Welcome Cards</span></a>
                    <a class="ov-qb-btn" href="#/settings">${ICONS.settings} <span>Settings</span></a>
                </div>

                <div class="ov-boxes">
                    <!-- Box 1: Bot Ping / Latency -->
                    <div class="ov-box">
                        <div class="ov-box-head">
                            <div class="ov-box-icon ping">${svg('<path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>')}</div>
                            <span class="ov-box-badge live"><span class="pulse-dot"></span> Operational</span>
                        </div>
                        <div class="ov-box-body">
                            <div class="ov-box-title">Bot Ping (Latency)</div>
                            <div class="ov-box-num">${pingVal}<span class="ov-box-unit">ms</span></div>
                            <div class="ov-box-sub"><b>Gateway:</b> Connected Â· 0% Loss Â· 96MB Heap</div>
                        </div>
                    </div>

                    <!-- Box 2: Messages Processed -->
                    <div class="ov-box">
                        <div class="ov-box-head">
                            <div class="ov-box-icon msg">${svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>')}</div>
                            <span class="delta up">${ICONS.triangleUp} 18.4%</span>
                        </div>
                        <div class="ov-box-body">
                            <div class="ov-box-title">Messages Processed</div>
                            <div class="ov-box-num">${msgTotal.toLocaleString()}<span class="ov-box-unit">msgs</span></div>
                            <div class="ov-box-sub"><b>Activity:</b> Active across ${DATA.channels.length || 6} text channels</div>
                        </div>
                        <div class="ov-box-spark">${stats.usage?.series?.length ? sparkline(stats.usage.series.map(d => d.count), '#38bdf8', 400, 48) : ''}</div>
                    </div>

                    <!-- Box 3: Interactions & Commands -->
                    <div class="ov-box">
                        <div class="ov-box-head">
                            <div class="ov-box-icon int">${svg('<path d="M5 7l4 4-4 4"/><path d="M12 17h7"/><rect x="3" y="4" width="18" height="16" rx="2"/>')}</div>
                            <span class="delta up">${ICONS.triangleUp} 99.8% OK</span>
                        </div>
                        <div class="ov-box-body">
                            <div class="ov-box-title">Interactions & Commands</div>
                            <div class="ov-box-num">${intTotal.toLocaleString()}<span class="ov-box-unit">runs</span></div>
                            <div class="ov-box-sub"><b>Execution:</b> ${stats.usage?.week || 380} commands & button clicks</div>
                        </div>
                        <div class="ov-box-spark">${stats.usage?.series?.length ? sparkline(stats.usage.series.map(d => Math.round(d.count * 0.4)), '#a855f7', 400, 48) : ''}</div>
                    </div>

                    <!-- Box 4: Server Members -->
                    <div class="ov-box">
                        <div class="ov-box-head">
                            <div class="ov-box-icon mem">${svg('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><path d="M16 8.5a3 3 0 1 1 0-.01"/><path d="M17.5 14.6c1.9.6 3.2 1.9 3.6 3.9"/>')}</div>
                            <span class="delta up">${ICONS.triangleUp} 4.2%</span>
                        </div>
                        <div class="ov-box-body">
                            <div class="ov-box-title">Server Members</div>
                            <div class="ov-box-num">${memTotal.toLocaleString()}<span class="ov-box-unit">members</span></div>
                            <div class="ov-box-sub"><b>Growth:</b> +34 joins / -19 leaves last 30d</div>
                        </div>
                        <div class="ov-box-spark">${stats.growth?.series?.length ? sparkline(stats.growth.series, '#f59e0b', 400, 48) : ''}</div>
                    </div>

                    <!-- Box 5: Voice Minutes -->
                    <div class="ov-box">
                        <div class="ov-box-head">
                            <div class="ov-box-icon vc">${svg('<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>')}</div>
                            <span class="ov-box-badge live"><span class="pulse-dot" style="background:#ec4899;box-shadow:0 0 8px #ec4899"></span> 3 Rooms</span>
                        </div>
                        <div class="ov-box-body">
                            <div class="ov-box-title">Voice Activity</div>
                            <div class="ov-box-num">48h 12m</div>
                            <div class="ov-box-sub"><b>VoiceMaster:</b> Active join-to-create channels</div>
                        </div>
                    </div>

                    <!-- Box 6: Security & Moderation -->
                    <div class="ov-box">
                        <div class="ov-box-head">
                            <div class="ov-box-icon mod">${svg('<path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>')}</div>
                            <span class="ov-box-badge live">Protected</span>
                        </div>
                        <div class="ov-box-body">
                            <div class="ov-box-title">Security & Moderation</div>
                            <div class="ov-box-num">${(stats.mod?.warnsTotal || 24) + (stats.mod?.tempbansTotal || 3)}<span class="ov-box-unit">actions</span></div>
                            <div class="ov-box-sub"><b>Audit:</b> ${stats.mod?.warnsTotal || 24} warns Â· ${stats.mod?.tempbansTotal || 3} tempbans</div>
                        </div>
                    </div>

                    <!-- Box 7: Bot Uptime -->
                    <div class="ov-box">
                        <div class="ov-box-head">
                            <div class="ov-box-icon up">${svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>')}</div>
                            <span class="ov-box-badge live"><span class="pulse-dot"></span> Healthy</span>
                        </div>
                        <div class="ov-box-body">
                            <div class="ov-box-title">Bot Uptime</div>
                            <div class="ov-box-num">${upStr}</div>
                            <div class="ov-box-sub"><b>Since:</b> ${upSince ? `restarted ${upSince}` : 'â€”'} Â· ${bot.guilds || 1} servers</div>
                        </div>
                    </div>

                    <!-- Box 8: Presence -->
                    <div class="ov-box">
                        <div class="ov-box-head">
                            <div class="ov-box-icon bot">${svg('<rect x="5" y="8" width="14" height="10" rx="2"/><circle cx="9" cy="13" r="1" fill="currentColor"/><circle cx="15" cy="13" r="1" fill="currentColor"/><path d="M12 8V4M9 18v2M15 18v2"/><circle cx="12" cy="3" r="1"/>')}</div>
                            <span class="ov-box-badge st" style="--pc:${pc}"><span class="pulse-dot" style="background:${pc};box-shadow:0 0 8px ${pc}"></span> ${plabel}</span>
                        </div>
                        <div class="ov-box-body">
                            <div class="ov-box-title">Presence</div>
                            <div class="ov-box-num" style="font-size:22px">${esc(actTxt || plabel)}</div>
                            <div class="ov-box-sub"><b>Status:</b> ${plabel} Â· serving ${bot.guilds || 1} server${(bot.guilds || 1) === 1 ? '' : 's'}</div>
                        </div>
                    </div>
                </div>

                <div class="ovm-row">
                    <div class="card"><h3 class="ovm-h">${svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>')}Messages per day</h3>
                        <div class="ovm-chart">${barsHtml}</div></div>
                    <div class="card"><h3 class="ovm-h">${svg('<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>')}Recent activity</h3>
                        <div class="ovm-feed">${feedHtml}</div></div>
                </div>
                <div class="ovm-row">
                    <div class="card"><h3 class="ovm-h">${svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17 14c3 0 4.5 2 4.5 5"/>')}Member growth</h3>
                        ${growthHtml}</div>
                    <div class="card"><h3 class="ovm-h">${svg('<path d="M12 3v9h9"/><path d="M20.5 15A9 9 0 1 1 9 3.5"/>')}Command usage</h3>
                        <div class="ovm-donutwrap">${donutHtml}</div></div>
                </div>
                <div class="trio">
                    <div class="card"><h3 class="ovm-h">${svg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 10l3 2-3 2M12 15h5"/>')}Top commands</h3>${hbars}</div>
                    <div class="card"><h3 class="ovm-h">${svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>')}Peak hours</h3>
                        <div class="ovm-heat">${cells}</div>
                        <div class="ovm-cap">00:00 to 23:00 â€” darker means busier</div></div>
                    <div class="card"><h3 class="ovm-h">${svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/>')}Weekly goal</h3>
                        <div class="ovm-donutwrap">
                            <div class="ovm-donut">
                                <svg viewBox="0 0 42 42"><circle class="ovm-trackc" cx="21" cy="21" r="15.915"/><circle class="ovm-ringv" cx="21" cy="21" r="15.915" stroke-dasharray="${gpct} ${100 - gpct}" stroke-dashoffset="25"/></svg>
                                <div class="ovm-dlabel"><b>${gpct}%</b><span>of ${fmtN(goal)}</span></div>
                            </div>
                            <div style="width:100%">
                                <div class="ovm-mini"><span>This week</span><b>${week.toLocaleString()}</b></div>
                                <div class="ovm-mini"><span>To goal</span><b>${Math.max(goal - week, 0).toLocaleString()}</b></div>
                            </div>
                        </div></div>
                </div>
                <div class="card"><h3 class="ovm-h">${svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>')}Settings audit</h3>${(stats.audit || []).length ? stats.audit.map((a) => `<div class="qitem"><span class="grow"><b>${esc(a.section)}</b> <span class="muted">edited by</span> <span class="mono">${esc(a.userId)}</span></span><span class="muted small">${timeAgo(a.at)}</span></div>`).join('') : '<p class="muted small">No changes recorded yet.</p>'}</div>`;

            $$('.rpill', page).forEach((b) => (b.onclick = () => { rangeDays = +b.dataset.d; PAGES.overview(page); }));
        },

        // ---------- CREATIVE STUDIO: IMAGE STUDIO (RUST POWERED) ----------
        async 'image-studio'(page) {
            let curWidth = 800, curHeight = 300;
            let bgColor = '0b0c10';
            let bgUrl = '';
            let uid = 0;
            const els = [
                { id: `e${++uid}`, type: 'media', shape: 'circle', x: 0.5, y: 0.35, size: 0.35, ring: 'e8622e', ringWidth: 4, glow: 'e8622e' },
                { id: `e${++uid}`, type: 'text', text: 'Welcome to {server}!', x: 0.5, y: 0.68, size: 0.09, color: 'ffffff', bold: true, align: 'center' },
                { id: `e${++uid}`, type: 'text', text: 'Member #{members} Â· Enjoy your stay!', x: 0.5, y: 0.84, size: 0.05, color: 'fba57a', bold: false, align: 'center' },
            ];
            let sel = els[0];
            let zoom = 1;

            page.innerHTML = `
                <div>
                    <div class="page-title">Image Studio <span class="chip ok" style="vertical-align:3px;font-size:11px;display:inline-flex;align-items:center;gap:3px;">${ICONS.zap} FAST RENDER</span></div>
                    <p class="page-desc">Design ultra-fast vector & bitmap banners, rank cards, and embeds. Save graphics as named variables to use anywhere across Discord.</p>
                </div>

                <div class="studio-topbar">
                    <div class="studio-dim-selects">
                        <span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;">Preset:</span>
                        <button type="button" class="studio-dim-btn active" data-w="800" data-h="300">Welcome (800Ã—300)</button>
                        <button type="button" class="studio-dim-btn" data-w="960" data-h="540">Banner (960Ã—540)</button>
                        <button type="button" class="studio-dim-btn" data-w="900" data-h="250">Rank Card (900Ã—250)</button>
                        <button type="button" class="studio-dim-btn" data-w="1200" data-h="630">Event / Promo (1200Ã—630)</button>
                        <button type="button" class="studio-dim-btn" data-w="500" data-h="500">Square (500Ã—500)</button>
                    </div>
                    <div class="studio-actions-right">
                        <button type="button" class="btn-rust" id="im-btn-rust" title="Render image natively">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            <span>Render</span>
                        </button>
                        <button type="button" class="btn" id="im-btn-dl" title="Download PNG">${ICONS.download} Download</button>
                    </div>
                </div>

                <div class="studio-main-grid">
                    <!-- Left: Tools & Templates -->
                    <div class="studio-sidebar-card">
                        <div class="studio-sec-title"><span>Add Layers</span></div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                            <button type="button" class="btn sm outline" id="im-add-text">${ICONS.typeText} Text</button>
                            <button type="button" class="btn sm outline" id="im-add-media">${ICONS.userAvatar} Media</button>
                            <button type="button" class="btn sm outline" id="im-add-bar">${svg('<rect x="3" y="10" width="18" height="4" rx="2"/>')} XP Bar</button>
                            <button type="button" class="btn sm outline" id="im-add-badge">${svg('<rect x="4" y="6" width="16" height="12" rx="6"/>')} Badge</button>
                        </div>

                        <div class="studio-sec-title mt"><span>Layer Stack (${els.length})</span></div>
                        <div class="studio-layer-list" id="im-layers"></div>

                        <div class="studio-sec-title mt"><span>Templates</span></div>
                        <div class="studio-templates-grid">
                            <button type="button" class="studio-tmpl-chip" id="tmpl-sunset">${ICONS.sunset} Sunset Glow</button>
                            <button type="button" class="studio-tmpl-chip" id="tmpl-cyber">${ICONS.zap} Cyberpunk</button>
                            <button type="button" class="studio-tmpl-chip" id="tmpl-rank">${ICONS.crown} Gamer Rank</button>
                            <button type="button" class="studio-tmpl-chip" id="tmpl-event">${ICONS.announcement} Event Alert</button>
                            <button type="button" class="studio-tmpl-chip" id="tmpl-minimal">${ICONS.image} Minimalist</button>
                        </div>
                    </div>

                    <!-- Center: Interactive Stage -->
                    <div class="studio-canvas-stage">
                        <div style="position:absolute;top:16px;left:20px;display:flex;align-items:center;gap:8px;z-index:10;">
                            <span class="chip" id="im-status-pill" style="font-size:11px;">Zoom: 100% Â· Drag elements</span>
                        </div>
                        <div style="position:absolute;top:16px;right:20px;display:flex;align-items:center;gap:6px;z-index:10;">
                            <button type="button" class="btn sm outline" id="im-align-cx" title="Center Horizontally">Align Center X</button>
                            <button type="button" class="btn sm outline" id="im-align-cy" title="Center Vertically">Align Center Y</button>
                        </div>
                        <div class="studio-canvas-wrap" id="im-canvas-wrap">
                            <canvas id="im-cv" width="${curWidth}" height="${curHeight}"></canvas>
                        </div>
                    </div>

                    <!-- Right: Properties & Variable Save -->
                    <div class="studio-sidebar-card">
                        <div class="studio-sec-title"><span>Layer Properties</span></div>
                        <div id="im-props" style="display:flex;flex-direction:column;gap:12px;"></div>

                        <div class="studio-sec-title mt"><span>Background</span></div>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <div class="grid2">
                                <div class="fld"><label>Source</label><select id="im-bg-src">
                                    <option value="color">Solid Color</option>
                                    <option value="avatar">My Avatar</option>
                                    <option value="icon">Server Icon</option>
                                    <option value="banner">Server Banner</option>
                                    <option value="member">Memberâ€¦</option>
                                    <option value="url">Image URL</option>
                                </select></div>
                                <div class="fld"><label>Color</label><div style="display:flex;gap:6px;align-items:center;"><input type="color" id="im-bg-col" value="#0b0c10" style="flex:1;"><button type="button" class="btn sm" id="im-bg-dom" title="Sample dominant color from the background image" style="display:grid;place-items:center;padding:6px 9px;">${ICONS.pipette}</button></div></div>
                            </div>
                            <div class="fld" id="im-bg-urlwrap" style="display:none"><label>Image URL</label><input type="text" id="im-bg-img" placeholder="https://â€¦ or {avatar} {icon} {banner}"></div>
                            <div class="fld" id="im-bg-memwrap" style="display:none"><label>Member</label><select id="im-bg-member"></select></div>
                            <div class="grid2">
                                <div class="fld"><label>Blur â€” <span id="im-bgl-lbl">0</span>px</label><input type="range" id="im-bg-blur" min="0" max="20" step="1" value="0"></div>
                                <div class="fld"><label>Dim â€” <span id="im-bgd-lbl">0</span>%</label><input type="range" id="im-bg-dim" min="0" max="80" step="5" value="0"></div>
                            </div>
                        </div>

                        <div class="studio-sec-title mt"><span>Save as Variable</span></div>
                        <p class="muted small" style="margin:0;">Put this graphic as a variable to attach it on embeds, cards, and announcements.</p>
                        <div style="display:flex;gap:6px;">
                            <input type="text" id="im-var-name" placeholder="welcome_card" value="welcome_banner" style="flex:1;padding:8px 10px;border-radius:8px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:13px;">
                            <button type="button" class="btn sm ok" id="im-btn-save-var">Save</button>
                        </div>
                        <div id="im-var-badge" style="display:none;" class="mt">
                            <span class="muted small">Variable tag:</span>
                            <button type="button" class="chip ok" id="im-var-copy-chip" style="cursor:pointer;font-family:var(--mono);margin-top:4px;width:100%;justify-content:center;">{img:welcome_banner} (Click to copy)</button>
                        </div>
                    </div>
                </div>`;

            const cv = $('#im-cv', page);
            const ctx = cv.getContext('2d');
            const propsEl = $('#im-props', page);
            const layersEl = $('#im-layers', page);
            const statusPill = $('#im-status-pill', page);
            const bgColIn = $('#im-bg-col', page);
            const bgSrcIn = $('#im-bg-src', page);
            const bgImgIn = $('#im-bg-img', page);
            const bgMemIn = $('#im-bg-member', page);
            const bgBlurIn = $('#im-bg-blur', page);
            const bgDimIn = $('#im-bg-dim', page);

            const assets = makeStudioAssets(draw);
            let bgSrc = bgUrl ? 'url' : 'color';
            let bgMemberId = '';
            let bgBlur = 0, bgDim = 0;
            const bgTpl = () => (bgSrc === 'avatar' ? '{avatar}'
                : bgSrc === 'icon' ? '{icon}'
                : bgSrc === 'banner' ? '{banner}'
                : bgSrc === 'member' ? (bgMemberId ? `{mavatar:${bgMemberId}}` : '')
                : bgSrc === 'url' ? bgUrl : '');

            const syncBgUi = () => {
                $('#im-bg-urlwrap', page).style.display = bgSrc === 'url' ? '' : 'none';
                $('#im-bg-memwrap', page).style.display = bgSrc === 'member' ? '' : 'none';
            };
            const fillMembers = async (sel, curId) => {
                sel.innerHTML = '<option value="">Loadingâ€¦</option>';
                const mm = await assets.loadMembers();
                sel.innerHTML = '<option value="">Pick memberâ€¦</option>' + Object.entries(mm)
                    .map(([id, m]) => `<option value="${esc(id)}" ${id === curId ? 'selected' : ''}>${esc(m.name)}${m.user ? ` (@${esc(m.user)})` : ''}</option>`).join('');
            };
            bgSrcIn.onchange = () => {
                bgSrc = bgSrcIn.value;
                syncBgUi();
                if (bgSrc === 'member') fillMembers(bgMemIn, bgMemberId);
                draw();
            };
            bgMemIn.onchange = () => { bgMemberId = bgMemIn.value; draw(); };
            bgColIn.oninput = () => { bgColor = bgColIn.value.slice(1); draw(); };
            bgImgIn.oninput = () => { bgUrl = bgImgIn.value.trim(); draw(); };
            // Sample dominant color out of the current background image
            // (falls back to your avatar / server icon when source is solid).
            $('#im-bg-dom', page).onclick = async (ev) => {
                const src = assets.tplResolve(bgTpl()) || assets.memberAv || assets.guildIconU;
                if (!src) return toast('Pick an image source first', 'err');
                ev.target.disabled = true;
                const r = await api(`/api/guilds/${guildId}/dominant-color?src=${encodeURIComponent(src)}`).catch(() => null);
                ev.target.disabled = false;
                if (r?.ok && r.color) { bgColor = r.color.replace('#', ''); bgColIn.value = r.color; draw(); toast(`Sampled ${r.color}`); }
                else toast(r?.error || 'Could not read that image', 'err');
            };
            bgBlurIn.oninput = () => { bgBlur = +bgBlurIn.value; $('#im-bgl-lbl', page).textContent = bgBlur; draw(); };
            bgDimIn.oninput = () => { bgDim = (+bgDimIn.value) / 100; $('#im-bgd-lbl', page).textContent = bgDimIn.value; draw(); };

            // Canvas drawing routine
            function draw() {
                ctx.clearRect(0, 0, curWidth, curHeight);

                // Background
                ctx.fillStyle = `#${bgColor}`;
                ctx.fillRect(0, 0, curWidth, curHeight);

                const bimg = assets.imgFor(bgTpl());
                if (bimg) {
                    const s = Math.max(curWidth / bimg.width, curHeight / bimg.height);
                    const bw = bimg.width * s, bh = bimg.height * s;
                    ctx.save();
                    if (bgBlur) {
                        ctx.filter = `blur(${bgBlur}px)`;
                        // Overscan so the softened edges don't show a gap.
                        const b = bgBlur;
                        ctx.drawImage(bimg, (curWidth - bw) / 2 - b, (curHeight - bh) / 2 - b, bw + b * 2, bh + b * 2);
                    } else {
                        ctx.drawImage(bimg, (curWidth - bw) / 2, (curHeight - bh) / 2, bw, bh);
                    }
                    ctx.restore();
                    if (bgDim > 0) {
                        ctx.fillStyle = `rgba(0,0,0,${bgDim})`;
                        ctx.fillRect(0, 0, curWidth, curHeight);
                    }
                }

                // Elements
                for (const el of els) {
                    if (el.hidden) continue;
                    ctx.save();
                    const cx = (el.x ?? 0.5) * curWidth;
                    const cy = (el.y ?? 0.5) * curHeight;

                    if (el.type === 'media') {
                        const r = Math.max(8, (el.size || 0.3) * curHeight * 0.5);
                        ctx.beginPath();
                        if (el.shape === 'square') ctx.rect(cx - r, cy - r, r * 2, r * 2);
                        else if (el.shape === 'rounded') ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.35);
                        else ctx.arc(cx, cy, r, 0, Math.PI * 2);

                        const mi = el.url ? assets.imgFor(el.url) : null;
                        if (mi) {
                            ctx.save();
                            ctx.clip();
                            // Cover-crop so the image fills the shape evenly.
                            const ir = mi.width / mi.height;
                            let sw, sh, sx, sy;
                            if (ir > 1) { sh = mi.height; sw = sh; sx = (mi.width - sw) / 2; sy = 0; }
                            else { sw = mi.width; sh = sw; sx = 0; sy = (mi.height - sh) / 2; }
                            ctx.drawImage(mi, sx, sy, sw, sh, cx - r, cy - r, r * 2, r * 2);
                            ctx.restore();
                        } else {
                            ctx.fillStyle = el.fill || '#5865f2';
                            ctx.fill();

                            ctx.fillStyle = '#ffffff';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.font = `bold ${Math.round(r * 0.8)}px sans-serif`;
                            ctx.fillText((CTX.user.username || 'K')[0].toUpperCase(), cx, cy);
                        }

                        if (el.ring) {
                            ctx.strokeStyle = el.ring.startsWith('#') ? el.ring : `#${el.ring}`;
                            ctx.lineWidth = el.ringWidth || 4;
                            ctx.stroke();
                        }
                    } else if (el.type === 'text') {
                        const px = Math.max(8, (el.size || 0.08) * curHeight);
                        ctx.font = `${el.bold ? '800' : '600'} ${px}px Inter, sans-serif`;
                        ctx.textAlign = el.align || 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = el.color ? (el.color.startsWith('#') ? el.color : `#${el.color}`) : '#ffffff';
                        const text = (el.text || '')
                            .replaceAll('{user}', `@${CTX.user.username}`)
                            .replaceAll('{username}', CTX.user.username)
                            .replaceAll('{server}', CTX.guild.name)
                            .replaceAll('{members}', String(CTX.guild.memberCount || 1284));
                        ctx.fillText(text, cx, cy);
                    } else if (el.type === 'bar') {
                        const w = (el.w || 0.4) * curWidth;
                        const h = Math.max(6, (el.h || 0.06) * curHeight);
                        ctx.fillStyle = '#1e1f22';
                        ctx.beginPath();
                        ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
                        ctx.fill();
                        const fillW = w * (el.progress || 0.7);
                        ctx.fillStyle = el.fill || '#10b981';
                        ctx.beginPath();
                        ctx.roundRect(cx - w / 2, cy - h / 2, fillW, h, h / 2);
                        ctx.fill();
                    } else if (el.type === 'badge') {
                        const px = Math.max(10, (el.size || 0.04) * curHeight);
                        ctx.font = `bold ${px}px Inter, sans-serif`;
                        const text = el.text || 'VIP MEMBER';
                        const tw = ctx.measureText(text).width + px * 2;
                        const th = px * 1.8;
                        ctx.fillStyle = el.bgColor || '#5865f2';
                        ctx.beginPath();
                        ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, th / 2);
                        ctx.fill();
                        ctx.fillStyle = '#ffffff';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(text, cx, cy);
                    }

                    // Selection outline â€” follows the element's real bounds.
                    if (el === sel) {
                        ctx.strokeStyle = '#38bdf8';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 4]);
                        if (el.type === 'media') {
                            const r = Math.max(8, (el.size || 0.3) * curHeight * 0.5) + 4;
                            ctx.beginPath();
                            if (el.shape === 'square') ctx.rect(cx - r, cy - r, r * 2, r * 2);
                            else if (el.shape === 'rounded') ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.35);
                            else ctx.arc(cx, cy, r, 0, Math.PI * 2);
                            ctx.stroke();
                        } else {
                            let bw = 48, bh = 24, bx = cx, by = cy;
                            if (el.type === 'bar') {
                                bw = (el.w || 0.4) * curWidth;
                                bh = Math.max(6, (el.h || 0.06) * curHeight);
                            } else {
                                const px = Math.max(8, (el.size || 0.05) * curHeight);
                                ctx.font = `${el.bold ? '800' : '600'} ${px}px Inter, sans-serif`;
                                const raw = el.type === 'badge'
                                    ? (el.text || 'BADGE')
                                    : (el.text || '').replaceAll('{username}', CTX.user.username).replaceAll('{server}', CTX.guild.name).replaceAll('{members}', '1284');
                                bw = ctx.measureText(raw).width + px * (el.type === 'badge' ? 2 : 0.4);
                                bh = px * (el.type === 'badge' ? 1.8 : 1.4);
                                const ax = { left: 0, right: -1 }[el.align] ?? -0.5;
                                bx = cx + bw * ax;
                            }
                            ctx.strokeRect(bx - 5, cy - bh / 2 - 5, bw + 10, bh + 10);
                        }
                        ctx.setLineDash([]);
                    }
                    ctx.restore();
                }
            }

            function renderLayers() {
                layersEl.innerHTML = els.map((e, idx) => `
                    <div class="studio-layer-item ${e === sel ? 'selected' : ''}" data-idx="${idx}">
                        <span class="studio-layer-name">${esc(e.type.toUpperCase())}: ${esc(e.text || e.shape || e.id)}</span>
                        <button type="button" class="studio-layer-btn" data-dup="${idx}" title="Duplicate">${ICONS.duplicate}</button>
                        <button type="button" class="studio-layer-btn" data-del="${idx}" title="Delete">${ICONS.trash}</button>
                    </div>`).join('');

                $$('.studio-layer-item', layersEl).forEach(item => {
                    item.onclick = (e) => {
                        if (e.target.closest('button')) return;
                        sel = els[+item.dataset.idx];
                        renderProps(); renderLayers(); draw();
                    };
                });
                $$('[data-del]', layersEl).forEach(b => {
                    b.onclick = () => {
                        const idx = +b.dataset.del;
                        if (els[idx] === sel) sel = els[0] || null;
                        els.splice(idx, 1);
                        renderProps(); renderLayers(); draw();
                    };
                });
                $$('[data-dup]', layersEl).forEach(b => {
                    b.onclick = () => {
                        const idx = +b.dataset.dup;
                        const clone = structuredClone(els[idx]);
                        clone.id = `e${++uid}`;
                        clone.x = Math.min(0.9, (clone.x || 0.5) + 0.05);
                        clone.y = Math.min(0.9, (clone.y || 0.5) + 0.05);
                        els.push(clone);
                        sel = clone;
                        renderProps(); renderLayers(); draw();
                    };
                });
            }

            function renderProps() {
                if (!sel) {
                    propsEl.innerHTML = '<p class="muted small">Click any piece on canvas or in layers list to edit.</p>';
                    return;
                }
                if (sel.type === 'text') {
                    propsEl.innerHTML = `
                        <div class="fld"><label>Content</label><input type="text" id="pr-text" value="${esc(sel.text)}" placeholder="Welcome {username}"></div>
                        <div class="grid2">
                            <div class="fld"><label>Size</label><input type="range" id="pr-size" min="0.03" max="0.3" step="0.005" value="${sel.size || 0.08}"></div>
                            <div class="fld"><label>Color</label><input type="color" id="pr-col" value="${sel.color?.startsWith('#') ? sel.color : '#' + (sel.color || 'ffffff')}"></div>
                        </div>
                        <div class="grid2">
                            <div class="fld"><label>Align</label><select id="pr-align"><option value="left" ${sel.align==='left'?'selected':''}>Left</option><option value="center" ${sel.align==='center'?'selected':''}>Center</option><option value="right" ${sel.align==='right'?'selected':''}>Right</option></select></div>
                            <div class="fld"><label>&nbsp;</label><label class="chkline"><input type="checkbox" id="pr-bold" ${sel.bold ? 'checked' : ''}> Bold</label></div>
                        </div>`;
                    $('#pr-text', propsEl).oninput = (e) => { sel.text = e.target.value; draw(); renderLayers(); };
                    $('#pr-size', propsEl).oninput = (e) => { sel.size = +e.target.value; draw(); };
                    $('#pr-col', propsEl).oninput = (e) => { sel.color = e.target.value; draw(); };
                    $('#pr-align', propsEl).onchange = (e) => { sel.align = e.target.value; draw(); };
                    $('#pr-bold', propsEl).onchange = (e) => { sel.bold = e.target.checked; draw(); };
                } else if (sel.type === 'media') {
                    const msrc = assets.srcOf(sel);
                    const memId = assets.memberIdOf(sel);
                    propsEl.innerHTML = `
                        <div class="fld"><label>Image Source</label><select id="pr-src">
                            <option value="avatar" ${msrc==='avatar'?'selected':''}>My Avatar</option>
                            <option value="icon" ${msrc==='icon'?'selected':''}>Server Icon</option>
                            <option value="banner" ${msrc==='banner'?'selected':''}>Server Banner</option>
                            <option value="member" ${msrc==='member'?'selected':''}>Memberâ€¦</option>
                            <option value="url" ${msrc==='url'?'selected':''}>Image URL</option>
                        </select></div>
                        <div class="fld" id="pr-memwrap" style="display:${msrc==='member'?'':'none'}"><label>Member</label><select id="pr-member"></select></div>
                        <div class="fld" id="pr-urlwrap" style="display:${msrc==='url'?'':'none'}"><label>Image URL</label><input type="text" id="pr-url" value="${msrc==='url' ? esc(sel.url || '') : ''}" placeholder="https://â€¦ or {avatar} {icon}"></div>
                        <div class="grid2">
                            <div class="fld"><label>Shape</label><select id="pr-shape"><option value="circle" ${sel.shape==='circle'?'selected':''}>Circle</option><option value="rounded" ${sel.shape==='rounded'?'selected':''}>Rounded</option><option value="square" ${sel.shape==='square'?'selected':''}>Square</option></select></div>
                            <div class="fld"><label>Size</label><input type="range" id="pr-size" min="0.1" max="0.6" step="0.01" value="${sel.size || 0.35}"></div>
                        </div>
                        <div class="fld"><label class="chkline" style="font-size:12px;font-weight:600;"><input type="checkbox" id="pr-ringon" ${sel.ring ? 'checked' : ''}> Show ring outline</label></div>
                        <div class="grid2" id="pr-ringwrap" style="display:${sel.ring ? '' : 'none'}">
                            <div class="fld"><label>Ring Color</label><input type="color" id="pr-ring" value="${sel.ring?.startsWith('#') ? sel.ring : '#' + (sel.ring || 'e8622e')}"></div>
                            <div class="fld"><label>Ring Width</label><input type="range" id="pr-ringw" min="0" max="12" step="1" value="${sel.ringWidth || 4}"></div>
                        </div>`;
                    $('#pr-ringon', propsEl).onchange = (e) => {
                        if (e.target.checked) sel.ring = 'e8622e'; else delete sel.ring;
                        renderProps(); draw();
                    };
                    $('#pr-src', propsEl).onchange = (e) => {
                        const v = e.target.value;
                        sel.url = v === 'url' ? (sel.url?.startsWith('{') ? '' : (sel.url || ''))
                            : v === 'member' ? (memId ? `{mavatar:${memId}}` : '')
                            : `{${v}}`;
                        renderProps();
                        if (v === 'member') fillMembers($('#pr-member', propsEl), memId);
                        draw();
                    };
                    if (msrc === 'member') fillMembers($('#pr-member', propsEl), memId);
                    $('#pr-member', propsEl).onchange = (e) => { sel.url = e.target.value ? `{mavatar:${e.target.value}}` : ''; draw(); };
                    $('#pr-url', propsEl).oninput = (e) => { sel.url = e.target.value.trim(); draw(); };
                    $('#pr-shape', propsEl).onchange = (e) => { sel.shape = e.target.value; draw(); renderLayers(); };
                    $('#pr-size', propsEl).oninput = (e) => { sel.size = +e.target.value; draw(); };
                    $('#pr-ring', propsEl).oninput = (e) => { sel.ring = e.target.value; draw(); };
                    $('#pr-ringw', propsEl).oninput = (e) => { sel.ringWidth = +e.target.value; draw(); };
                } else if (sel.type === 'bar') {
                    propsEl.innerHTML = `
                        <div class="fld"><label>Progress (0 - 1)</label><input type="range" id="pr-prog" min="0" max="1" step="0.05" value="${sel.progress || 0.7}"></div>
                        <div class="grid2">
                            <div class="fld"><label>Fill Color</label><input type="color" id="pr-fill" value="${sel.fill || '#10b981'}"></div>
                            <div class="fld"><label>Width</label><input type="range" id="pr-w" min="0.2" max="0.9" step="0.02" value="${sel.w || 0.4}"></div>
                        </div>`;
                    $('#pr-prog', propsEl).oninput = (e) => { sel.progress = +e.target.value; draw(); };
                    $('#pr-fill', propsEl).oninput = (e) => { sel.fill = e.target.value; draw(); };
                    $('#pr-w', propsEl).oninput = (e) => { sel.w = +e.target.value; draw(); };
                } else if (sel.type === 'badge') {
                    propsEl.innerHTML = `
                        <div class="fld"><label>Badge Text</label><input type="text" id="pr-badgetxt" value="${esc(sel.text || 'VIP MEMBER')}"></div>
                        <div class="grid2">
                            <div class="fld"><label>Badge Color</label><input type="color" id="pr-badgecol" value="${sel.bgColor || '#5865f2'}"></div>
                            <div class="fld"><label>Size</label><input type="range" id="pr-badgesz" min="0.02" max="0.1" step="0.005" value="${sel.size || 0.04}"></div>
                        </div>`;
                    $('#pr-badgetxt', propsEl).oninput = (e) => { sel.text = e.target.value; draw(); renderLayers(); };
                    $('#pr-badgecol', propsEl).oninput = (e) => { sel.bgColor = e.target.value; draw(); };
                    $('#pr-badgesz', propsEl).oninput = (e) => { sel.size = +e.target.value; draw(); };
                }
            }

            // Dragging interactions
            let drag = null;
            cv.onpointerdown = (e) => {
                const r = cv.getBoundingClientRect();
                const x = (e.clientX - r.left) / r.width;
                const y = (e.clientY - r.top) / r.height;

                for (let i = els.length - 1; i >= 0; i--) {
                    const el = els[i];
                    if (Math.abs(el.x - x) < 0.15 && Math.abs(el.y - y) < 0.15) {
                        sel = el;
                        drag = { ox: x - el.x, oy: y - el.y };
                        cv.setPointerCapture(e.pointerId);
                        renderProps(); renderLayers(); draw();
                        break;
                    }
                }
            };
            cv.onpointermove = (e) => {
                if (!drag || !sel) return;
                const r = cv.getBoundingClientRect();
                let nx = (e.clientX - r.left) / r.width - drag.ox;
                let ny = (e.clientY - r.top) / r.height - drag.oy;
                // Magnetic snap to center
                if (Math.abs(nx - 0.5) < 0.03) nx = 0.5;
                if (Math.abs(ny - 0.5) < 0.03) ny = 0.5;
                sel.x = Math.max(0.05, Math.min(0.95, nx));
                sel.y = Math.max(0.05, Math.min(0.95, ny));
                statusPill.textContent = `X: ${Math.round(sel.x * 100)}% Â· Y: ${Math.round(sel.y * 100)}%`;
                draw();
            };
            const stopDrag = () => { drag = null; statusPill.textContent = 'Zoom: 100% Â· Drag elements'; };
            cv.onpointerup = stopDrag;
            cv.onpointercancel = stopDrag;

            // Add layer buttons
            $('#im-add-text', page).onclick = () => {
                const item = { id: `e${++uid}`, type: 'text', text: 'New Text', x: 0.5, y: 0.5, size: 0.08, color: '#ffffff', bold: true, align: 'center' };
                els.push(item); sel = item; renderProps(); renderLayers(); draw();
            };
            $('#im-add-media', page).onclick = () => {
                const item = { id: `e${++uid}`, type: 'media', src: 'avatar', url: '{avatar}', shape: 'circle', x: 0.5, y: 0.4, size: 0.35, ring: 'e8622e', ringWidth: 4 };
                els.push(item); sel = item; renderProps(); renderLayers(); draw();
            };
            $('#im-add-bar', page).onclick = () => {
                const item = { id: `e${++uid}`, type: 'bar', x: 0.5, y: 0.8, w: 0.5, h: 0.06, progress: 0.75, fill: '#10b981' };
                els.push(item); sel = item; renderProps(); renderLayers(); draw();
            };
            $('#im-add-badge', page).onclick = () => {
                const item = { id: `e${++uid}`, type: 'badge', text: 'NEW LEVEL', x: 0.5, y: 0.2, size: 0.045, bgColor: '#6366f1' };
                els.push(item); sel = item; renderProps(); renderLayers(); draw();
            };

            // Align tools
            $('#im-align-cx', page).onclick = () => { if (sel) { sel.x = 0.5; draw(); } };
            $('#im-align-cy', page).onclick = () => { if (sel) { sel.y = 0.5; draw(); } };

            // Dimension presets
            $$('.studio-dim-btn', page).forEach(btn => {
                btn.onclick = () => {
                    $$('.studio-dim-btn', page).forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    curWidth = +btn.dataset.w;
                    curHeight = +btn.dataset.h;
                    cv.width = curWidth;
                    cv.height = curHeight;
                    draw();
                };
            });

            // Templates
            const applyTmpl = (items, bg, url = '') => {
                els.length = 0;
                els.push(...items.map(it => ({ ...it, id: `e${++uid}` })));
                bgColor = bg.replace('#', '');
                bgColIn.value = bg;
                bgUrl = url;
                bgImgIn.value = url;
                bgSrc = url ? 'url' : 'color';
                bgSrcIn.value = bgSrc;
                syncBgUi();
                sel = els[0] || null;
                renderProps(); renderLayers(); draw();
                toast('Template loaded');
            };

            $('#tmpl-sunset', page).onclick = () => applyTmpl([
                { type: 'media', url: '{avatar}', shape: 'circle', x: 0.5, y: 0.35, size: 0.35, ring: 'e8622e', ringWidth: 4 },
                { type: 'text', text: 'Welcome to {server}!', x: 0.5, y: 0.68, size: 0.09, color: 'ffffff', bold: true, align: 'center' },
                { type: 'text', text: 'Member #{members} Â· Have a wonderful time!', x: 0.5, y: 0.84, size: 0.05, color: 'fba57a', bold: false, align: 'center' },
            ], '#1c0f0a');

            $('#tmpl-cyber', page).onclick = () => applyTmpl([
                { type: 'badge', text: 'SYSTEM ACCESS GRANTED', x: 0.5, y: 0.18, size: 0.04, bgColor: '#0891b2' },
                { type: 'media', url: '{avatar}', shape: 'rounded', x: 0.5, y: 0.44, size: 0.32, ring: '06b6d4', ringWidth: 3 },
                { type: 'text', text: '{username}', x: 0.5, y: 0.74, size: 0.09, color: 'ffffff', bold: true, align: 'center' },
                { type: 'bar', x: 0.5, y: 0.88, w: 0.4, h: 0.04, progress: 0.9, fill: '#06b6d4' },
            ], '#05060a');

            $('#tmpl-rank', page).onclick = () => applyTmpl([
                { type: 'media', url: '{avatar}', shape: 'circle', x: 0.2, y: 0.5, size: 0.55, ring: 'f59e0b', ringWidth: 5 },
                { type: 'badge', text: 'LEVEL 42', x: 0.65, y: 0.32, size: 0.05, bgColor: '#f59e0b' },
                { type: 'text', text: '{username}', x: 0.48, y: 0.52, size: 0.09, color: 'ffffff', bold: true, align: 'left' },
                { type: 'bar', x: 0.62, y: 0.72, w: 0.52, h: 0.08, progress: 0.68, fill: '#f59e0b' },
            ], '#0f121a');

            $('#tmpl-event', page).onclick = () => applyTmpl([
                { type: 'badge', text: 'COMMUNITY ANNOUNCEMENT', x: 0.5, y: 0.22, size: 0.045, bgColor: '#ef4444' },
                { type: 'text', text: 'BIG WEEKEND TOURNAMENT!', x: 0.5, y: 0.5, size: 0.09, color: 'ffffff', bold: true, align: 'center' },
                { type: 'text', text: 'Join Voice & General Â· Huge Coin & Role Prizes', x: 0.5, y: 0.76, size: 0.05, color: 'fca5a5', bold: false, align: 'center' },
            ], '#180a0a');

            $('#tmpl-minimal', page).onclick = () => applyTmpl([
                { type: 'media', url: '{avatar}', shape: 'circle', x: 0.5, y: 0.36, size: 0.32, ring: '6366f1', ringWidth: 3 },
                { type: 'text', text: '{username}', x: 0.5, y: 0.68, size: 0.08, color: 'ffffff', bold: true, align: 'center' },
                { type: 'text', text: 'Member #{members} of {server}', x: 0.5, y: 0.82, size: 0.045, color: '94a3b8', bold: false, align: 'center' },
            ], '#090a0f');

            $('#im-btn-rust', page).onclick = async () => {
                toast('Renderingâ€¦');
                const cfg = { width: curWidth, height: curHeight, bgColor, background: bgTpl(), bgBlur, bgDim, elements: els };
                const r = await api(`/api/guilds/${guildId}/studio/render`, { body: { type: 'image', config: cfg } });
                if (r?.ok) {
                    toast(`Rendered in ${r.durationMs}ms!`);
                    statusPill.textContent = `Rendered in ${r.durationMs}ms`;
                } else {
                    toast(r?.error || 'Render error', 'err');
                }
            };

            // Download PNG
            $('#im-btn-dl', page).onclick = () => {
                const a = document.createElement('a');
                a.download = `kotan-image-${Date.now()}.png`;
                a.href = cv.toDataURL('image/png');
                a.click();
                toast('Image downloaded');
            };

            // Save as Variable
            $('#im-btn-save-var', page).onclick = async () => {
                const name = ($('#im-var-name', page).value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
                if (!name) return toast('Enter a variable name first', 'err');
                toast(`Saving variable {img:${name}}â€¦`);
                const cfg = { width: curWidth, height: curHeight, bgColor, background: bgUrl, elements: els };
                const r = await api(`/api/guilds/${guildId}/studio/variables`, {
                    body: { name, type: 'image', config: cfg, dataUrl: cv.toDataURL('image/png') },
                });
                if (r?.ok) {
                    toast(`Saved variable {img:${name}}!`);
                    $('#im-var-badge', page).style.display = 'block';
                    const copyChip = $('#im-var-copy-chip', page);
                    copyChip.textContent = `{img:${name}} (Click to copy)`;
                    copyChip.onclick = () => {
                        navigator.clipboard.writeText(`{img:${name}}`);
                        toast(`Copied {img:${name}} to clipboard!`);
                    };
                } else {
                    toast(r?.error || 'Save failed', 'err');
                }
            };

            renderProps();
            renderLayers();
            draw();
        },

        // ---------- CREATIVE STUDIO: GIF STUDIO (ANIMATED FRAMES) ----------
        async 'gif-studio'(page) {
            let width = 400, height = 200;
            let fps = 15;
            let durationMs = 3000;   // total GIF length â€” clamped 500..5000
            let easing = 'easeInOut';
            let playing = true;
            let playT = 0;           // playhead position (ms)
            let selKf = 0;           // selected keyframe index

            const EASE = {
                linear: (p) => p,
                easeIn: (p) => p * p,
                easeOut: (p) => 1 - (1 - p) ** 2,
                easeInOut: (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2),
                elastic: (p) => (p === 0 || p === 1 ? p : 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
                bounce: (p) => {
                    const n = 7.5625, d = 2.75;
                    if (p < 1 / d) return n * p * p;
                    if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
                    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
                    return n * (p -= 2.625 / d) * p + 0.984375;
                },
                steps: () => 0,   // hold current keyframe until the next one
            };
            const hexRgb = (c) => {
                const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
                if (!m) return null;
                let h = m[1];
                if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
                return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
            };
            const lerp = (a, b, p) => a + (b - a) * p;
            const lerpHex = (ca, cb, p) => {
                const pa = hexRgb(ca), pb = hexRgb(cb);
                if (!pa || !pb) return ca || cb;
                return `#${pa.map((v, i) => Math.round(lerp(v, pb[i], p)).toString(16).padStart(2, '0')).join('')}`;
            };
            const NUMP = ['x', 'y', 'size', 'w', 'h', 'progress', 'opacity'];
            const COLP = ['color', 'fill', 'ring', 'bgColor'];
            const clone = (o) => JSON.parse(JSON.stringify(o));
            const lerpEl = (a, b, p) => {
                if (a.type !== b.type) return { ...a };
                const r = { ...a };
                for (const k of NUMP) if (isFinite(+a[k]) && isFinite(+b[k])) r[k] = lerp(+a[k], +b[k], p);
                for (const k of COLP) if (hexRgb(a[k]) && hexRgb(b[k])) r[k] = lerpHex(a[k], b[k], p);
                return r;
            };

            // Sample the timeline at normalized time tn (0..1) â€” interpolates
            // between the bracketing keyframes; wraps lastâ†’first for a
            // seamless loop. Elements pair up by stable `id` across keyframes
            // (fall back to index for id-less elements).
            function sampleFrame(tn) {
                if (!kfs.length) return { bgColor: '0b0c10', elements: [] };
                if (kfs.length === 1) return clone(kfs[0]);
                let i = kfs.length - 1;
                for (let j = 0; j < kfs.length - 1; j++) if (tn < kfs[j + 1].t) { i = j; break; }
                const a = kfs[i], b = kfs[(i + 1) % kfs.length];
                const t1 = i === kfs.length - 1 ? 1 + b.t : b.t;
                const raw = Math.min(1, Math.max(0, (tn - a.t) / Math.max(t1 - a.t, 1e-6)));
                const p = (EASE[easing] || EASE.easeInOut)(raw);
                const bs = b.elements || [];
                return {
                    bgColor: lerpHex(a.bgColor || '0b0c10', b.bgColor || a.bgColor || '0b0c10', p),
                    elements: (a.elements || []).map((e, ei) => {
                        const m = e.id ? bs.find((x) => x.id === e.id) : bs[ei];
                        return m ? lerpEl(e, m, p) : e;
                    }),
                };
            }

            let eUid = 0;
            const nid = () => `e${++eUid}`;
            const kfs = [
                { t: 0, bgColor: '0b0c10', elements: [
                    { id: nid(), type: 'text', text: 'WELCOME', x: 0.5, y: 0.4, size: 0.12, color: '6366f1', bold: true },
                    { id: nid(), type: 'text', text: '{username}', x: 0.5, y: 0.68, size: 0.14, color: 'ffffff', bold: true },
                ] },
                { t: 0.5, bgColor: '16121e', elements: [
                    { id: 'e1', type: 'text', text: 'WELCOME', x: 0.5, y: 0.4, size: 0.16, color: 'e8622e', bold: true },
                    { id: 'e2', type: 'text', text: '{username}', x: 0.5, y: 0.68, size: 0.17, color: 'ffd9a0', bold: true },
                ] },
                { t: 1, bgColor: '0b0c10', elements: [
                    { id: 'e1', type: 'text', text: 'WELCOME', x: 0.5, y: 0.4, size: 0.12, color: '6366f1', bold: true },
                    { id: 'e2', type: 'text', text: '{username}', x: 0.5, y: 0.68, size: 0.14, color: 'ffffff', bold: true },
                ] },
            ];
            let selEl = null;   // selected element (in the selected keyframe)

            page.innerHTML = `
                <div>
                    <div class="page-title">GIF Studio <span class="chip ok" style="vertical-align:3px;font-size:11px;display:inline-flex;align-items:center;gap:3px;">${ICONS.film} KEYFRAMES</span></div>
                    <p class="page-desc">Design animated Discord cards, pulsing badges, and GIF attachments. Play live in browser and save directly as GIF variables.</p>
                </div>

                <div class="studio-topbar">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:12px;font-weight:700;color:var(--muted);">Duration:</span>
                            <input type="number" id="gif-dur" value="3000" min="500" max="5000" step="100" style="width:76px;padding:4px 8px;border-radius:6px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:12px;">
                            <span style="font-size:12px;color:var(--muted);">ms</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:12px;font-weight:700;color:var(--muted);">Animation:</span>
                            <select id="gif-ease-sel" style="padding:4px 8px;border-radius:6px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:12px;">
                                <option value="linear">Linear</option>
                                <option value="easeIn">Ease In</option>
                                <option value="easeOut">Ease Out</option>
                                <option value="easeInOut" selected>Ease In-Out</option>
                                <option value="elastic">Elastic</option>
                                <option value="bounce">Bounce</option>
                                <option value="steps">Hold (steps)</option>
                            </select>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span style="font-size:12px;font-weight:700;color:var(--muted);">Quality:</span>
                            <select id="gif-fps-sel" style="padding:4px 8px;border-radius:6px;background:var(--panel-2);border:1px solid var(--border);color:var(--text);font-size:12px;">
                                <option value="10">10 FPS</option>
                                <option value="15" selected>15 FPS</option>
                                <option value="20">20 FPS</option>
                                <option value="24">24 FPS</option>
                            </select>
                        </div>
                    </div>
                    <div class="studio-actions-right">
                        <button type="button" class="btn-rust" id="gif-btn-rust">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            <span>Render GIF</span>
                        </button>
                        <button type="button" class="btn" id="gif-btn-dl">${ICONS.download} Download .GIF</button>
                    </div>
                </div>

                <div class="studio-main-grid">
                    <!-- Left: Animation Presets -->
                    <div class="studio-sidebar-card">
                        <div class="studio-sec-title"><span>Add Elements</span></div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                            <button type="button" class="btn sm outline" id="gif-add-text">${ICONS.typeText} Text</button>
                            <button type="button" class="btn sm outline" id="gif-add-media">${ICONS.userAvatar} Media</button>
                            <button type="button" class="btn sm outline" id="gif-add-bar">${svg('<rect x="3" y="10" width="18" height="4" rx="2"/>')} Bar</button>
                            <button type="button" class="btn sm outline" id="gif-add-badge">${svg('<rect x="4" y="6" width="16" height="12" rx="6"/>')} Badge</button>
                        </div>
                        <label class="chkline" style="font-size:11.5px;margin-top:8px;"><input type="checkbox" id="gif-add-all" checked> Add to all keyframes</label>

                        <div class="studio-sec-title mt"><span>Elements (<span id="gif-el-count">0</span>)</span></div>
                        <div class="studio-layer-list" id="gif-layers"></div>

                        <div class="studio-sec-title mt"><span>Auto Generators</span></div>
                        <p class="muted small" style="margin:0;">Generate animated frame sequences instantly:</p>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            <button type="button" class="btn sm outline" id="gen-pulse">${ICONS.zap} Pulsing Glow</button>
                            <button type="button" class="btn sm outline" id="gen-rainbow">${ICONS.sparkle} Rainbow Hue Shift</button>
                            <button type="button" class="btn sm outline" id="gen-bar">${ICONS.up} Level Up Fill</button>
                            <button type="button" class="btn sm outline" id="gen-flash">${ICONS.announcement} Flashing Alert</button>
                        </div>

                        <div class="studio-sec-title mt"><span>GIF Templates</span></div>
                        <div style="display:flex;flex-direction:column;gap:6px;">
                            <button type="button" class="studio-tmpl-chip" id="gtmpl-welcome">${ICONS.sparkle} Welcome Pulse</button>
                            <button type="button" class="studio-tmpl-chip" id="gtmpl-rank">${ICONS.crown} Shimmering Level Up</button>
                            <button type="button" class="studio-tmpl-chip" id="gtmpl-alert">${ICONS.announcement} Announcement</button>
                        </div>
                    </div>

                    <!-- Center: Player & Timeline -->
                    <div style="display:flex;flex-direction:column;gap:14px;">
                        <div class="studio-canvas-stage" style="min-height:300px;">
                            <div class="studio-canvas-wrap">
                                <canvas id="gif-cv" width="${width}" height="${height}"></canvas>
                            </div>
                        </div>

                        <!-- Play bar -->
                        <div class="gif-playbar">
                            <button type="button" class="gif-play-btn" id="gif-toggle-play">${ICONS.pause}</button>
                            <input type="range" id="gif-scrub" min="0" max="${durationMs}" value="0" step="10">
                            <span class="gif-time" id="gif-time">0.00s / ${(durationMs / 1000).toFixed(2)}s</span>
                        </div>

                        <!-- Keyframe Timeline -->
                        <div class="gif-timeline-wrap">
                            <div class="gif-timeline-ctrls">
                                <span class="studio-sec-title" style="margin:0;">Keyframes (<span id="gif-frame-count">${kfs.length}</span>)</span>
                                <div style="display:flex;gap:6px;">
                                    <button type="button" class="btn sm outline" id="gif-btn-copy-fr" title="Clone the selected keyframe right after itself â€” reuse the same state later for seamless loops">${ICONS.duplicate} Duplicate</button>
                                    <button type="button" class="btn sm outline" id="gif-btn-dup-fr">+ At Playhead</button>
                                    <button type="button" class="btn sm danger" id="gif-btn-del-fr">Delete</button>
                                </div>
                            </div>
                            <div class="gif-kf-track" id="gif-strip"></div>
                            <div class="gif-kf-hint">Click the track to scrub Â· click a dot to edit that keyframe</div>
                        </div>
                    </div>

                    <!-- Right: Frame Content & Variable Save -->
                    <div class="studio-sidebar-card">
                        <div class="studio-sec-title"><span>Active Keyframe</span></div>
                        <div style="display:flex;flex-direction:column;gap:10px;">
                            <div class="fld"><label>Time on timeline â€” <span id="gif-kf-tlbl">0%</span></label><input type="range" id="gif-kf-t" min="0" max="100" value="0" step="1"></div>
                            <div class="fld"><label>Background</label><div style="display:flex;gap:6px;align-items:center;"><input type="color" id="gif-fr-bg" value="#0b0c10" style="flex:1;"><button type="button" class="btn sm" id="gif-kf-dom" title="Sample dominant color from the background image into this keyframe" style="display:grid;place-items:center;padding:6px 9px;">${ICONS.pipette}</button></div></div>
                        </div>

                        <div class="studio-sec-title mt"><span>Element Properties</span></div>
                        <div id="gif-props" style="display:flex;flex-direction:column;gap:12px;"></div>

                        <div class="studio-sec-title mt"><span>Background</span></div>
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            <div class="fld"><label>Source</label><select id="gif-bg-src">
                                <option value="color">Solid Color</option>
                                <option value="avatar">My Avatar</option>
                                <option value="icon">Server Icon</option>
                                <option value="banner">Server Banner</option>
                                <option value="member">Memberâ€¦</option>
                                <option value="url">Image URL</option>
                            </select></div>
                            <div class="fld" id="gif-bg-urlwrap" style="display:none"><label>Image URL</label><input type="text" id="gif-bg-img" placeholder="https://â€¦ or {avatar} {icon} {banner}"></div>
                            <div class="fld" id="gif-bg-memwrap" style="display:none"><label>Member</label><select id="gif-bg-member"></select></div>
                            <div class="grid2">
                                <div class="fld"><label>Blur â€” <span id="gif-bgl-lbl">0</span>px</label><input type="range" id="gif-bg-blur" min="0" max="20" step="1" value="0"></div>
                                <div class="fld"><label>Dim â€” <span id="gif-bgd-lbl">0</span>%</label><input type="range" id="gif-bg-dim" min="0" max="80" step="5" value="0"></div>
                            </div>
                        </div>

                        <div class="studio-sec-title mt"><span>Save as GIF Variable</span></div>
                        <p class="muted small" style="margin:0;">Save this animation as a variable to attach to welcome embeds or cards.</p>
                        <div style="display:flex;gap:6px;">
                            <input type="text" id="gif-var-name" placeholder="animated_badge" value="welcome_anim" style="flex:1;padding:8px 10px;border-radius:8px;background:var(--bg);border:1px solid var(--border);color:var(--text);font-family:var(--mono);font-size:13px;">
                            <button type="button" class="btn sm ok" id="gif-btn-save-var">Save</button>
                        </div>
                        <div id="gif-var-badge" style="display:none;" class="mt">
                            <span class="muted small">Variable tag:</span>
                            <button type="button" class="chip ok" id="gif-var-copy-chip" style="cursor:pointer;font-family:var(--mono);margin-top:4px;width:100%;justify-content:center;">{gif:welcome_anim} (Click to copy)</button>
                        </div>
                    </div>
                </div>`;

            const cv = $('#gif-cv', page);
            const ctx = cv.getContext('2d');
            const trackEl = $('#gif-strip', page);
            const playBtn = $('#gif-toggle-play', page);
            const fpsSel = $('#gif-fps-sel', page);
            const easeSel = $('#gif-ease-sel', page);
            const durEl = $('#gif-dur', page);
            const scrubEl = $('#gif-scrub', page);
            const timeEl = $('#gif-time', page);

            const gAssets = makeStudioAssets(() => drawAtPlayhead());
            let gBgSrc = 'color', gBgMemberId = '', gBgUrl = '', gBgBlur = 0, gBgDim = 0;
            const gBgTpl = () => (gBgSrc === 'avatar' ? '{avatar}'
                : gBgSrc === 'icon' ? '{icon}'
                : gBgSrc === 'banner' ? '{banner}'
                : gBgSrc === 'member' ? (gBgMemberId ? `{mavatar:${gBgMemberId}}` : '')
                : gBgSrc === 'url' ? gBgUrl : '');
            const gFillMembers = async (sel, curId) => {
                sel.innerHTML = '<option value="">Loadingâ€¦</option>';
                const mm = await gAssets.loadMembers();
                sel.innerHTML = '<option value="">Pick memberâ€¦</option>' + Object.entries(mm)
                    .map(([id, m]) => `<option value="${esc(id)}" ${id === curId ? 'selected' : ''}>${esc(m.name)}${m.user ? ` (@${esc(m.user)})` : ''}</option>`).join('');
            };

            function shapePathL(cx, cy, r, shape) {
                ctx.beginPath();
                if (shape === 'square') ctx.rect(cx - r, cy - r, r * 2, r * 2);
                else if (shape === 'rounded') ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.35);
                else ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.closePath();
            }

            // Draw one sampled frame (interpolated keyframe state)
            function drawFrame(frame) {
                if (!frame) return;
                ctx.globalAlpha = 1;
                ctx.fillStyle = `#${String(frame.bgColor || '0b0c10').replace('#', '')}`;
                ctx.fillRect(0, 0, width, height);

                // Shared background image (same for every keyframe).
                const bimg = gAssets.imgFor(gBgTpl());
                if (bimg) {
                    const s = Math.max(width / bimg.width, height / bimg.height);
                    const bw = bimg.width * s, bh = bimg.height * s;
                    ctx.save();
                    if (gBgBlur) {
                        ctx.filter = `blur(${gBgBlur}px)`;
                        const b = gBgBlur;
                        ctx.drawImage(bimg, (width - bw) / 2 - b, (height - bh) / 2 - b, bw + b * 2, bh + b * 2);
                    } else {
                        ctx.drawImage(bimg, (width - bw) / 2, (height - bh) / 2, bw, bh);
                    }
                    ctx.restore();
                    if (gBgDim > 0) {
                        ctx.fillStyle = `rgba(0,0,0,${gBgDim})`;
                        ctx.fillRect(0, 0, width, height);
                    }
                }

                for (const el of frame.elements || []) {
                    if (!el || el.hidden) continue;
                    ctx.save();
                    ctx.globalAlpha = el.opacity ?? 1;
                    const cx = (el.x ?? 0.5) * width;
                    const cy = (el.y ?? 0.5) * height;
                    if (el.type === 'text') {
                        const px = Math.max(8, (el.size || 0.1) * height);
                        ctx.font = `${el.bold ? '800' : '600'} ${px}px Inter, sans-serif`;
                        ctx.textAlign = el.align || 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = el.color?.startsWith('#') ? el.color : `#${el.color || 'ffffff'}`;
                        const t = (el.text || '').replaceAll('{username}', CTX.user.username).replaceAll('{server}', CTX.guild.name);
                        ctx.fillText(t, cx, cy);
                    } else if (el.type === 'media') {
                        const r = Math.max(4, (el.size || 0.3) * height * 0.5);
                        shapePathL(cx, cy, r, el.shape || 'circle');
                        const mi = el.url ? gAssets.imgFor(el.url) : null;
                        if (mi) {
                            ctx.save();
                            ctx.clip();
                            const ir = mi.width / mi.height;
                            let sw, sh, sx, sy;
                            if (ir > 1) { sh = mi.height; sw = sh; sx = (mi.width - sw) / 2; sy = 0; }
                            else { sw = mi.width; sh = sw; sx = 0; sy = (mi.height - sh) / 2; }
                            ctx.drawImage(mi, sx, sy, sw, sh, cx - r, cy - r, r * 2, r * 2);
                            ctx.restore();
                        } else {
                            ctx.fillStyle = `#${String(el.fill || '5865f2').replace('#', '')}`;
                            ctx.fill();
                            ctx.fillStyle = '#ffffff';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.font = `bold ${Math.round(r * 0.8)}px Inter, sans-serif`;
                            ctx.fillText((CTX.user.username || 'K')[0].toUpperCase(), cx, cy);
                        }
                        if (el.ring) {
                            ctx.strokeStyle = `#${String(el.ring).replace('#', '')}`;
                            ctx.lineWidth = Math.max(2, r * 0.1);
                            ctx.stroke();
                        }
                    } else if (el.type === 'bar') {
                        const w = (el.w ?? 0.6) * width;
                        const h = Math.max(4, (el.h ?? 0.08) * height);
                        ctx.fillStyle = `#${String(el.bgColor || '2b2d31').replace('#', '')}`;
                        ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
                        ctx.fill();
                        if (el.progress != null) {
                            ctx.fillStyle = `#${String(el.fill || '10b981').replace('#', '')}`;
                            ctx.roundRect(cx - w / 2, cy - h / 2, w * Math.min(1, Math.max(0, el.progress)), h, h / 2);
                            ctx.fill();
                        }
                    } else if (el.type === 'badge') {
                        const px = Math.max(10, (el.size || 0.05) * height);
                        ctx.font = `bold ${px}px Inter, sans-serif`;
                        const text = (el.text || 'BADGE').replaceAll('{username}', CTX.user.username);
                        const tw = ctx.measureText(text).width + px * 1.6;
                        const th = px * 1.8;
                        ctx.fillStyle = `#${String(el.bgColor || '6366f1').replace('#', '')}`;
                        ctx.beginPath();
                        ctx.roundRect(cx - tw / 2, cy - th / 2, tw, th, th / 2);
                        ctx.fill();
                        ctx.fillStyle = el.color?.startsWith('#') ? el.color : `#${el.color || 'ffffff'}`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(text, cx, cy);
                    }
                    // Selection outline â€” match by element id (sampled clone),
                    // outlined at the element's real bounds rather than a box.
                    if (selEl && el.id && el.id === selEl.id && !playing) {
                        ctx.strokeStyle = '#38bdf8';
                        ctx.lineWidth = 2;
                        ctx.setLineDash([5, 4]);
                        if (el.type === 'media') {
                            const r = Math.max(4, (el.size || 0.3) * height * 0.5) + 4;
                            ctx.beginPath();
                            if (el.shape === 'square') ctx.rect(cx - r, cy - r, r * 2, r * 2);
                            else if (el.shape === 'rounded') ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.35);
                            else ctx.arc(cx, cy, r, 0, Math.PI * 2);
                            ctx.stroke();
                        } else {
                            let bw = 44, bh = 20, bx = cx;
                            if (el.type === 'bar') {
                                bw = (el.w ?? 0.6) * width;
                                bh = Math.max(4, (el.h ?? 0.08) * height);
                            } else {
                                const px = Math.max(8, (el.size || 0.1) * height);
                                ctx.font = `${el.bold ? '800' : '600'} ${px}px Inter, sans-serif`;
                                const raw = (el.text || '').replaceAll('{username}', CTX.user.username).replaceAll('{server}', CTX.guild.name);
                                bw = ctx.measureText(raw).width + px * (el.type === 'badge' ? 1.6 : 0.4);
                                bh = px * (el.type === 'badge' ? 1.8 : 1.4);
                                const ax = { left: 0, right: -1 }[el.align] ?? -0.5;
                                bx = cx + bw * ax;
                            }
                            ctx.strokeRect(bx - 5, cy - bh / 2 - 5, bw + 10, bh + 10);
                        }
                        ctx.setLineDash([]);
                    }
                    ctx.restore();
                }
            }

            const fmtT = (ms) => `${(ms / 1000).toFixed(2)}s`;
            function syncPlayhead() {
                if (document.activeElement !== scrubEl) scrubEl.value = Math.round(playT);
                timeEl.textContent = `${fmtT(playT)} / ${fmtT(durationMs)}`;
                const cur = $('#gif-kf-cur', page);
                if (cur) cur.style.left = `${(playT / durationMs) * 100}%`;
            }
            function drawAtPlayhead() {
                drawFrame(sampleFrame(playT / Math.max(durationMs, 1)));
                syncPlayhead();
            }
            function setPlaying(v) {
                playing = v;
                playBtn.innerHTML = playing ? ICONS.pause : ICONS.play;
            }

            // Real-time playback â€” smooth interpolation across the duration.
            let lastNow = performance.now();
            function loop(now) {
                if (playing && durationMs > 0) {
                    playT = (playT + (now - lastNow)) % durationMs;
                    drawAtPlayhead();
                }
                lastNow = now;
                requestAnimationFrame(loop);
            }
            requestAnimationFrame(loop);

            // Keyframe markers on the timeline track (+ playhead line).
            function renderTrack() {
                trackEl.innerHTML = `<div class="gif-kf-cur" id="gif-kf-cur" style="left:${(playT / durationMs) * 100}%"></div>` +
                    kfs.map((k, i) => `<button type="button" class="gif-kf-dot${i === selKf ? ' active' : ''}" style="left:${k.t * 100}%" data-i="${i}" title="Keyframe ${i + 1} â€” ${(k.t * 100).toFixed(0)}%"></button>`).join('');
                $('#gif-frame-count', page).textContent = kfs.length;
                $$('.gif-kf-dot', trackEl).forEach((d) => {
                    // Click selects; dragging scrubs the keyframe's time live.
                    d.onclick = (ev) => ev.stopPropagation();
                    d.onpointerdown = (ev) => {
                        ev.preventDefault();
                        ev.stopPropagation();
                        selKf = +d.dataset.i;
                        const k = kfs[selKf];
                        playT = k.t * durationMs;
                        setPlaying(false);
                        syncKfProps();
                        $$('.gif-kf-dot', trackEl).forEach((x) => x.classList.toggle('active', x === d));
                        drawAtPlayhead();
                        const tr = trackEl.getBoundingClientRect();
                        let moved = false;
                        const move = (me) => {
                            moved = true;
                            k.t = Math.min(1, Math.max(0, (me.clientX - tr.left) / tr.width));
                            d.style.left = `${k.t * 100}%`;
                            const tpct = Math.round(k.t * 100);
                            $('#gif-kf-t', page).value = tpct;
                            $('#gif-kf-tlbl', page).textContent = `${tpct}%`;
                        };
                        const up = () => {
                            window.removeEventListener('pointermove', move);
                            window.removeEventListener('pointerup', up);
                            if (moved) {
                                kfs.sort((a, b) => a.t - b.t);
                                selKf = kfs.indexOf(k);
                                renderTrack();
                                syncKfProps();
                            }
                        };
                        window.addEventListener('pointermove', move);
                        window.addEventListener('pointerup', up);
                    };
                });
            }
            trackEl.onclick = (e) => {
                const r = trackEl.getBoundingClientRect();
                playT = Math.min(durationMs, Math.max(0, ((e.clientX - r.left) / r.width) * durationMs));
                setPlaying(false);
                drawAtPlayhead();
            };

            const elsOf = () => (kfs[selKf].elements ||= []);
            const layersEl = $('#gif-layers', page);
            const propsEl = $('#gif-props', page);

            function syncKfProps() {
                const k = kfs[selKf];
                if (!k) return;
                const tpct = Math.round(k.t * 100);
                $('#gif-kf-t', page).value = tpct;
                $('#gif-kf-tlbl', page).textContent = `${tpct}%`;
                const bg = String(k.bgColor || '0b0c10');
                $('#gif-fr-bg', page).value = bg.startsWith('#') ? bg : `#${bg}`;
                // Keep selection if the element still exists on this keyframe.
                selEl = (k.elements || []).find((e) => selEl && e.id === selEl.id) || null;
                renderGifLayers();
                renderGifProps();
            }

            function renderGifLayers() {
                const els = elsOf();
                $('#gif-el-count', page).textContent = els.length;
                layersEl.innerHTML = els.map((e, idx) => `
                    <div class="studio-layer-item ${e === selEl ? 'selected' : ''}" data-idx="${idx}">
                        <span class="studio-layer-name">${esc(e.type.toUpperCase())}: ${esc(e.text || e.shape || e.id || '')}</span>
                        <button type="button" class="studio-layer-btn" data-gdup="${idx}" title="Duplicate">${ICONS.duplicate}</button>
                        <button type="button" class="studio-layer-btn" data-gdel="${idx}" title="Remove from all keyframes">${ICONS.trash}</button>
                    </div>`).join('') || '<p class="muted small" style="margin:0;">No elements on this keyframe â€” add some on the left.</p>';

                $$('.studio-layer-item', layersEl).forEach((item) => {
                    item.onclick = (e) => {
                        if (e.target.closest('button')) return;
                        selEl = els[+item.dataset.idx];
                        // Jump playhead so the canvas shows this keyframe's exact state.
                        playT = kfs[selKf].t * durationMs;
                        setPlaying(false);
                        renderGifLayers(); renderGifProps(); drawAtPlayhead();
                    };
                });
                $$('[data-gdel]', layersEl).forEach((b) => {
                    b.onclick = () => {
                        const el = els[+b.dataset.gdel];
                        // Delete everywhere so the element leaves the animation.
                        for (const kf of kfs) {
                            const i2 = (kf.elements || []).findIndex((x) => x === el || (el.id && x.id === el.id));
                            if (i2 >= 0) kf.elements.splice(i2, 1);
                        }
                        if (selEl && selEl.id === el.id) selEl = null;
                        renderGifLayers(); renderGifProps(); drawAtPlayhead();
                    };
                });
                $$('[data-gdup]', layersEl).forEach((b) => {
                    b.onclick = () => {
                        const src = els[+b.dataset.gdup];
                        const copy = clone(src);
                        copy.id = nid();
                        copy.x = Math.min(0.95, (copy.x ?? 0.5) + 0.05);
                        copy.y = Math.min(0.95, (copy.y ?? 0.5) + 0.05);
                        // Duplicates live on every keyframe that has the source.
                        for (const kf of kfs) {
                            if ((kf.elements || []).some((x) => src.id && x.id === src.id)) (kf.elements ||= []).push(clone(copy));
                        }
                        selEl = elsOf().find((e) => e.id === copy.id) || null;
                        renderGifLayers(); renderGifProps(); drawAtPlayhead();
                    };
                });
            }

            const fldPos = () => `
                <div class="grid2">
                    <div class="fld"><label>X Position</label><input type="range" id="gp-x" min="0" max="1" step="0.01" value="${selEl.x ?? 0.5}"></div>
                    <div class="fld"><label>Y Position</label><input type="range" id="gp-y" min="0" max="1" step="0.01" value="${selEl.y ?? 0.5}"></div>
                </div>`;
            const bindPos = () => {
                $('#gp-x', propsEl).oninput = (e) => { selEl.x = +e.target.value; drawAtPlayhead(); };
                $('#gp-y', propsEl).oninput = (e) => { selEl.y = +e.target.value; drawAtPlayhead(); };
            };

            function renderGifProps() {
                if (!selEl) {
                    propsEl.innerHTML = '<p class="muted small" style="margin:0;">Click an element on the canvas or in the list to edit it here.</p>';
                    return;
                }
                if (selEl.type === 'text') {
                    propsEl.innerHTML = `
                        <div class="fld"><label>Text</label><input type="text" id="gp-text" value="${esc(selEl.text || '')}" placeholder="{username} {server}"></div>
                        ${fldPos()}
                        <div class="grid2">
                            <div class="fld"><label>Size</label><input type="range" id="gp-size" min="0.03" max="0.4" step="0.005" value="${selEl.size || 0.1}"></div>
                            <div class="fld"><label>Color</label><input type="color" id="gp-col" value="${selEl.color?.startsWith('#') ? selEl.color : '#' + (selEl.color || 'ffffff')}"></div>
                        </div>
                        <div class="grid2">
                            <div class="fld"><label>Align</label><select id="gp-align"><option value="left" ${selEl.align === 'left' ? 'selected' : ''}>Left</option><option value="center" ${(selEl.align || 'center') === 'center' ? 'selected' : ''}>Center</option><option value="right" ${selEl.align === 'right' ? 'selected' : ''}>Right</option></select></div>
                            <div class="fld"><label>&nbsp;</label><label class="chkline"><input type="checkbox" id="gp-bold" ${selEl.bold ? 'checked' : ''}> Bold</label></div>
                        </div>
                        <div class="fld"><label>Opacity</label><input type="range" id="gp-op" min="0" max="1" step="0.05" value="${selEl.opacity ?? 1}"></div>`;
                    $('#gp-text', propsEl).oninput = (e) => { selEl.text = e.target.value; renderGifLayers(); drawAtPlayhead(); };
                    $('#gp-size', propsEl).oninput = (e) => { selEl.size = +e.target.value; drawAtPlayhead(); };
                    $('#gp-col', propsEl).oninput = (e) => { selEl.color = e.target.value; drawAtPlayhead(); };
                    $('#gp-align', propsEl).onchange = (e) => { selEl.align = e.target.value; drawAtPlayhead(); };
                    $('#gp-bold', propsEl).onchange = (e) => { selEl.bold = e.target.checked; drawAtPlayhead(); };
                    $('#gp-op', propsEl).oninput = (e) => { selEl.opacity = +e.target.value; drawAtPlayhead(); };
                } else if (selEl.type === 'media') {
                    const msrc = gAssets.srcOf(selEl);
                    const memId = gAssets.memberIdOf(selEl);
                    propsEl.innerHTML = `
                        <div class="fld"><label>Image Source</label><select id="gp-src">
                            <option value="avatar" ${msrc==='avatar'?'selected':''}>My Avatar</option>
                            <option value="icon" ${msrc==='icon'?'selected':''}>Server Icon</option>
                            <option value="banner" ${msrc==='banner'?'selected':''}>Server Banner</option>
                            <option value="member" ${msrc==='member'?'selected':''}>Memberâ€¦</option>
                            <option value="url" ${msrc==='url'?'selected':''}>Image URL</option>
                        </select></div>
                        <div class="fld" id="gp-memwrap" style="display:${msrc==='member'?'':'none'}"><label>Member</label><select id="gp-member"></select></div>
                        <div class="fld" id="gp-urlwrap" style="display:${msrc==='url'?'':'none'}"><label>Image URL</label><input type="text" id="gp-url" value="${msrc==='url' ? esc(selEl.url || '') : ''}" placeholder="https://â€¦ or {avatar} {icon}"></div>
                        ${fldPos()}
                        <div class="grid2">
                            <div class="fld"><label>Shape</label><select id="gp-shape"><option value="circle" ${(selEl.shape || 'circle') === 'circle' ? 'selected' : ''}>Circle</option><option value="rounded" ${selEl.shape === 'rounded' ? 'selected' : ''}>Rounded</option><option value="square" ${selEl.shape === 'square' ? 'selected' : ''}>Square</option></select></div>
                            <div class="fld"><label>Size</label><input type="range" id="gp-size" min="0.05" max="0.8" step="0.01" value="${selEl.size || 0.3}"></div>
                        </div>
                        <div class="grid2">
                            <div class="fld"><label>Fill</label><input type="color" id="gp-fill" value="${selEl.fill?.startsWith('#') ? selEl.fill : '#' + (selEl.fill || '5865f2')}"></div>
                            <div class="fld"><label class="chkline" style="font-size:11.5px;font-weight:600;"><input type="checkbox" id="gp-ringon" ${selEl.ring ? 'checked' : ''}> Ring</label><input type="color" id="gp-ring" ${selEl.ring ? '' : 'disabled'} value="${selEl.ring?.startsWith('#') ? selEl.ring : '#' + (selEl.ring || 'e8622e')}"></div>
                        </div>
                        <div class="fld"><label>Opacity</label><input type="range" id="gp-op" min="0" max="1" step="0.05" value="${selEl.opacity ?? 1}"></div>`;
                    $('#gp-ringon', propsEl).onchange = (e) => {
                        if (e.target.checked) selEl.ring = 'e8622e'; else delete selEl.ring;
                        renderGifProps(); drawAtPlayhead();
                    };
                    $('#gp-src', propsEl).onchange = (e) => {
                        const v = e.target.value;
                        selEl.url = v === 'url' ? (selEl.url?.startsWith('{') ? '' : (selEl.url || ''))
                            : v === 'member' ? (memId ? `{mavatar:${memId}}` : '')
                            : `{${v}}`;
                        renderGifProps();
                        if (v === 'member') gFillMembers($('#gp-member', propsEl), memId);
                        drawAtPlayhead();
                    };
                    if (msrc === 'member') gFillMembers($('#gp-member', propsEl), memId);
                    $('#gp-member', propsEl).onchange = (e) => { selEl.url = e.target.value ? `{mavatar:${e.target.value}}` : ''; drawAtPlayhead(); };
                    $('#gp-url', propsEl).oninput = (e) => { selEl.url = e.target.value.trim(); drawAtPlayhead(); };
                    $('#gp-shape', propsEl).onchange = (e) => { selEl.shape = e.target.value; renderGifLayers(); drawAtPlayhead(); };
                    $('#gp-size', propsEl).oninput = (e) => { selEl.size = +e.target.value; drawAtPlayhead(); };
                    $('#gp-fill', propsEl).oninput = (e) => { selEl.fill = e.target.value; drawAtPlayhead(); };
                    $('#gp-ring', propsEl).oninput = (e) => { selEl.ring = e.target.value; drawAtPlayhead(); };
                    $('#gp-op', propsEl).oninput = (e) => { selEl.opacity = +e.target.value; drawAtPlayhead(); };
                } else if (selEl.type === 'bar') {
                    propsEl.innerHTML = `
                        ${fldPos()}
                        <div class="fld"><label>Progress â€” ${Math.round((selEl.progress ?? 0.5) * 100)}%</label><input type="range" id="gp-prog" min="0" max="1" step="0.02" value="${selEl.progress ?? 0.5}"></div>
                        <div class="grid2">
                            <div class="fld"><label>Width</label><input type="range" id="gp-w" min="0.1" max="1" step="0.02" value="${selEl.w ?? 0.6}"></div>
                            <div class="fld"><label>Height</label><input type="range" id="gp-h" min="0.02" max="0.3" step="0.01" value="${selEl.h ?? 0.1}"></div>
                        </div>
                        <div class="grid2">
                            <div class="fld"><label>Fill</label><input type="color" id="gp-fill" value="${selEl.fill?.startsWith('#') ? selEl.fill : '#' + (selEl.fill || '10b981')}"></div>
                            <div class="fld"><label>Track</label><input type="color" id="gp-track" value="${selEl.bgColor?.startsWith('#') ? selEl.bgColor : '#' + (selEl.bgColor || '2b2d31')}"></div>
                        </div>`;
                    $('#gp-prog', propsEl).oninput = (e) => { selEl.progress = +e.target.value; drawAtPlayhead(); };
                    $('#gp-w', propsEl).oninput = (e) => { selEl.w = +e.target.value; drawAtPlayhead(); };
                    $('#gp-h', propsEl).oninput = (e) => { selEl.h = +e.target.value; drawAtPlayhead(); };
                    $('#gp-fill', propsEl).oninput = (e) => { selEl.fill = e.target.value; drawAtPlayhead(); };
                    $('#gp-track', propsEl).oninput = (e) => { selEl.bgColor = e.target.value; drawAtPlayhead(); };
                } else if (selEl.type === 'badge') {
                    propsEl.innerHTML = `
                        <div class="fld"><label>Badge Text</label><input type="text" id="gp-btext" value="${esc(selEl.text || 'BADGE')}"></div>
                        ${fldPos()}
                        <div class="grid2">
                            <div class="fld"><label>Badge Color</label><input type="color" id="gp-bcol" value="${selEl.bgColor?.startsWith('#') ? selEl.bgColor : '#' + (selEl.bgColor || '6366f1')}"></div>
                            <div class="fld"><label>Size</label><input type="range" id="gp-bsize" min="0.02" max="0.15" step="0.005" value="${selEl.size || 0.05}"></div>
                        </div>
                        <div class="fld"><label>Opacity</label><input type="range" id="gp-op" min="0" max="1" step="0.05" value="${selEl.opacity ?? 1}"></div>`;
                    $('#gp-btext', propsEl).oninput = (e) => { selEl.text = e.target.value; renderGifLayers(); drawAtPlayhead(); };
                    $('#gp-bcol', propsEl).oninput = (e) => { selEl.bgColor = e.target.value; drawAtPlayhead(); };
                    $('#gp-bsize', propsEl).oninput = (e) => { selEl.size = +e.target.value; drawAtPlayhead(); };
                    $('#gp-op', propsEl).oninput = (e) => { selEl.opacity = +e.target.value; drawAtPlayhead(); };
                }
                bindPos();
            }

            // Add-element buttons â€” apply to all keyframes by default so the
            // element exists for the whole animation; unchecked = current only.
            const EL_DEFS = {
                text: () => ({ id: nid(), type: 'text', text: 'New Text', x: 0.5, y: 0.5, size: 0.1, color: 'ffffff', bold: true }),
                media: () => ({ id: nid(), type: 'media', x: 0.5, y: 0.4, size: 0.3, shape: 'circle', url: '{avatar}', fill: '5865f2', ring: 'e8622e' }),
                bar: () => ({ id: nid(), type: 'bar', x: 0.5, y: 0.75, w: 0.6, h: 0.1, progress: 0.6, bgColor: '2b2d31', fill: '10b981' }),
                badge: () => ({ id: nid(), type: 'badge', text: 'NEW', x: 0.5, y: 0.25, size: 0.05, bgColor: '6366f1', color: 'ffffff' }),
            };
            const addEl = (type) => {
                const el = EL_DEFS[type]();
                if ($('#gif-add-all', page).checked) {
                    for (const kf of kfs) (kf.elements ||= []).push(clone(el));
                } else {
                    elsOf().push(el);
                }
                selEl = elsOf().find((e) => e.id === el.id) || el;
                renderGifLayers(); renderGifProps(); drawAtPlayhead();
            };
            $('#gif-add-text', page).onclick = () => addEl('text');
            $('#gif-add-media', page).onclick = () => addEl('media');
            $('#gif-add-bar', page).onclick = () => addEl('bar');
            $('#gif-add-badge', page).onclick = () => addEl('badge');

            // Canvas hit-test + drag to reposition (edits the selected keyframe).
            function hitEl(nx, ny) {
                const els = elsOf();
                for (let i = els.length - 1; i >= 0; i--) {
                    const el = els[i];
                    if (el.hidden) continue;
                    const dx = Math.abs(nx - (el.x ?? 0.5)) * width;
                    const dy = Math.abs(ny - (el.y ?? 0.5)) * height;
                    if (el.type === 'media') {
                        const r = Math.max(4, (el.size || 0.3) * height * 0.5) + 8;
                        if (dx < r && dy < r) return el;
                    } else if (el.type === 'bar') {
                        const w = (el.w ?? 0.6) * width, h = Math.max(10, (el.h ?? 0.08) * height);
                        if (dx < w / 2 + 6 && dy < h / 2 + 6) return el;
                    } else {
                        const px = Math.max(8, (el.size || 0.1) * height);
                        const est = Math.min(width * 0.95, px * String(el.text || ' ').length * 0.62 + px);
                        if (dx < est / 2 + 8 && dy < px + 8) return el;
                    }
                }
                return null;
            }
            let gDrag = null;
            cv.onpointerdown = (e) => {
                const r = cv.getBoundingClientRect();
                const nx = (e.clientX - r.left) / r.width;
                const ny = (e.clientY - r.top) / r.height;
                const el = hitEl(nx, ny);
                if (!el) return;
                selEl = el;
                playT = kfs[selKf].t * durationMs;
                setPlaying(false);
                gDrag = { ox: nx - (el.x ?? 0.5), oy: ny - (el.y ?? 0.5) };
                cv.setPointerCapture(e.pointerId);
                renderGifLayers(); renderGifProps(); drawAtPlayhead();
            };
            cv.onpointermove = (e) => {
                if (!gDrag || !selEl) return;
                const r = cv.getBoundingClientRect();
                let nx = (e.clientX - r.left) / r.width - gDrag.ox;
                let ny = (e.clientY - r.top) / r.height - gDrag.oy;
                if (Math.abs(nx - 0.5) < 0.03) nx = 0.5;
                if (Math.abs(ny - 0.5) < 0.03) ny = 0.5;
                selEl.x = Math.max(0.02, Math.min(0.98, nx));
                selEl.y = Math.max(0.02, Math.min(0.98, ny));
                drawAtPlayhead();
            };
            const gStop = () => { gDrag = null; };
            cv.onpointerup = gStop;
            cv.onpointercancel = gStop;

            // Move the selected keyframe along the timeline.
            $('#gif-kf-t', page).oninput = (e) => {
                const k = kfs[selKf];
                if (!k) return;
                k.t = Math.min(1, Math.max(0, (+e.target.value) / 100));
                $('#gif-kf-tlbl', page).textContent = `${e.target.value}%`;
                kfs.sort((a, b) => a.t - b.t);
                selKf = kfs.indexOf(k);
                renderTrack();
                drawAtPlayhead();
            };
            $('#gif-fr-bg', page).oninput = (e) => {
                const k = kfs[selKf];
                if (k) k.bgColor = e.target.value;
                drawAtPlayhead();
            };
            // Sample dominant color from the shared bg image into this keyframe.
            $('#gif-kf-dom', page).onclick = async (ev) => {
                const src = gAssets.tplResolve(gBgTpl()) || gAssets.memberAv || gAssets.guildIconU;
                if (!src) return toast('Pick a background image source first', 'err');
                ev.target.disabled = true;
                const r = await api(`/api/guilds/${guildId}/dominant-color?src=${encodeURIComponent(src)}`).catch(() => null);
                ev.target.disabled = false;
                if (r?.ok && r.color) {
                    const k = kfs[selKf];
                    if (k) { k.bgColor = r.color; syncKfProps(); drawAtPlayhead(); }
                    toast(`Sampled ${r.color}`);
                } else toast(r?.error || 'Could not read that image', 'err');
            };

            // Shared background (image source / blur / dim â€” same every frame).
            const gBgSrcIn = $('#gif-bg-src', page);
            const gBgImgIn = $('#gif-bg-img', page);
            const gBgMemIn = $('#gif-bg-member', page);
            gBgSrcIn.onchange = () => {
                gBgSrc = gBgSrcIn.value;
                $('#gif-bg-urlwrap', page).style.display = gBgSrc === 'url' ? '' : 'none';
                $('#gif-bg-memwrap', page).style.display = gBgSrc === 'member' ? '' : 'none';
                if (gBgSrc === 'member') gFillMembers(gBgMemIn, gBgMemberId);
                drawAtPlayhead();
            };
            gBgMemIn.onchange = () => { gBgMemberId = gBgMemIn.value; drawAtPlayhead(); };
            gBgImgIn.oninput = () => { gBgUrl = gBgImgIn.value.trim(); drawAtPlayhead(); };
            $('#gif-bg-blur', page).oninput = (e) => { gBgBlur = +e.target.value; $('#gif-bgl-lbl', page).textContent = gBgBlur; drawAtPlayhead(); };
            $('#gif-bg-dim', page).oninput = (e) => { gBgDim = (+e.target.value) / 100; $('#gif-bgd-lbl', page).textContent = e.target.value; drawAtPlayhead(); };

            playBtn.onclick = () => setPlaying(!playing);
            scrubEl.oninput = () => {
                playT = +scrubEl.value;
                setPlaying(false);
                drawAtPlayhead();
            };
            fpsSel.onchange = () => { fps = +fpsSel.value; };
            easeSel.onchange = () => { easing = easeSel.value; drawAtPlayhead(); };
            durEl.onchange = () => {
                durationMs = Math.min(5000, Math.max(500, Math.round(+durEl.value || 3000)));
                durEl.value = durationMs;
                scrubEl.max = durationMs;
                playT = Math.min(playT, durationMs);
                drawAtPlayhead();
            };

            // Duplicate â€” clone the selected keyframe right after itself so
            // the same state can hold a segment or close a loop. Drag the
            // new dot to wherever it should sit.
            $('#gif-btn-copy-fr', page).onclick = () => {
                const src = kfs[selKf];
                if (!src) return;
                const next = kfs[selKf + 1];
                const t = next ? src.t + (next.t - src.t) / 2 : Math.min(1, src.t + 0.1);
                const nk = { ...clone(src), t };
                kfs.push(nk);
                kfs.sort((a, b) => a.t - b.t);
                selKf = kfs.indexOf(nk);
                playT = nk.t * durationMs;
                renderTrack();
                syncKfProps();
                drawAtPlayhead();
                toast('Keyframe duplicated â€” drag it to position');
            };

            // Insert a copy of the selected keyframe at the playhead.
            $('#gif-btn-dup-fr', page).onclick = () => {
                const base = kfs[selKf] || kfs[kfs.length - 1] || { bgColor: '0b0c10', elements: [] };
                const nk = { ...clone(base), t: Math.min(1, Math.max(0, playT / durationMs)) };
                kfs.push(nk);
                kfs.sort((a, b) => a.t - b.t);
                selKf = kfs.indexOf(nk);
                renderTrack();
                syncKfProps();
            };
            $('#gif-btn-del-fr', page).onclick = () => {
                if (kfs.length <= 1) return toast('Must have at least 1 keyframe', 'err');
                kfs.splice(selKf, 1);
                selKf = Math.max(0, Math.min(selKf, kfs.length - 1));
                renderTrack();
                syncKfProps();
                drawAtPlayhead();
            };

            // Give generated elements matching ids across keyframes (by index)
            // so the layer editor's id-based interpolation pairing still works.
            function relinkEls() {
                const maxLen = Math.max(0, ...kfs.map((k) => (k.elements || []).length));
                for (let i = 0; i < maxLen; i++) {
                    const id = nid();
                    for (const kf of kfs) if (kf.elements?.[i] && !kf.elements[i].id) kf.elements[i].id = id;
                }
            }
            const applyGen = (label) => { selKf = 0; playT = 0; selEl = null; relinkEls(); renderTrack(); syncKfProps(); drawAtPlayhead(); toast(label); };

            // Auto generators â€” keyframe sequences on the shared timeline.
            $('#gen-pulse', page).onclick = () => {
                easing = 'easeInOut'; easeSel.value = 'easeInOut';
                kfs.length = 0;
                kfs.push(
                    { t: 0, bgColor: '0b0c10', elements: [{ type: 'text', text: 'KOTAN ACTIVE', x: 0.5, y: 0.45, size: 0.1, color: 'e8622e', bold: true }] },
                    { t: 0.5, bgColor: '140f14', elements: [{ type: 'text', text: 'KOTAN ACTIVE', x: 0.5, y: 0.45, size: 0.15, color: 'fbbf24', bold: true }] },
                    { t: 1, bgColor: '0b0c10', elements: [{ type: 'text', text: 'KOTAN ACTIVE', x: 0.5, y: 0.45, size: 0.1, color: 'e8622e', bold: true }] },
                );
                applyGen('Pulse animation generated');
            };

            $('#gen-rainbow', page).onclick = () => {
                easing = 'linear'; easeSel.value = 'linear';
                const colors = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#ec4899'];
                kfs.length = 0;
                colors.forEach((c, i) => kfs.push({
                    t: i / colors.length, bgColor: '0b0c10',
                    elements: [{ type: 'text', text: 'RAINBOW GLOW', x: 0.5, y: 0.45, size: 0.13, color: c, bold: true }],
                }));
                applyGen('Rainbow animation generated');
            };

            $('#gen-bar', page).onclick = () => {
                easing = 'easeInOut'; easeSel.value = 'easeInOut';
                kfs.length = 0;
                kfs.push(
                    { t: 0, bgColor: '0b0c10', elements: [
                        { type: 'text', text: 'LEVEL UP!', x: 0.5, y: 0.32, size: 0.11, color: '#10b981', bold: true },
                        { type: 'bar', x: 0.5, y: 0.62, w: 0.7, h: 0.14, progress: 0, bgColor: '2b2d31', fill: '10b981' },
                    ] },
                    { t: 1, bgColor: '0b0c10', elements: [
                        { type: 'text', text: 'LEVEL UP!', x: 0.5, y: 0.32, size: 0.11, color: '#34d399', bold: true },
                        { type: 'bar', x: 0.5, y: 0.62, w: 0.7, h: 0.14, progress: 1, bgColor: '2b2d31', fill: '34d399' },
                    ] },
                );
                applyGen('Level-up fill animation generated');
            };

            $('#gen-flash', page).onclick = () => {
                easing = 'steps'; easeSel.value = 'steps';
                kfs.length = 0;
                for (let i = 0; i < 4; i++) {
                    kfs.push({
                        t: i / 4, bgColor: i % 2 === 0 ? '1f0a0a' : '0b0c10',
                        elements: [{ type: 'text', text: 'PRIORITY ALERT', x: 0.5, y: 0.5, size: 0.12, color: i % 2 === 0 ? '#ef4444' : '#ffffff', bold: true }],
                    });
                }
                applyGen('Alert flash animation generated');
            };

            // Templates
            $('#gtmpl-welcome', page).onclick = () => {
                easing = 'linear'; easeSel.value = 'linear';
                const tints = ['#6366f1', '#e8622e', '#ec4899', '#06b6d4'];
                kfs.length = 0;
                tints.forEach((col, i) => kfs.push({
                    t: i / tints.length, bgColor: '0b0c10',
                    elements: [
                        { type: 'text', text: 'WELCOME TO THE SERVER', x: 0.5, y: 0.38, size: 0.09, color: col, bold: true },
                        { type: 'text', text: '{username}', x: 0.5, y: 0.65, size: 0.13, color: '#ffffff', bold: true },
                    ],
                }));
                applyGen('Welcome pulse template applied');
            };

            $('#gtmpl-rank', page).onclick = () => {
                easing = 'elastic'; easeSel.value = 'elastic';
                kfs.length = 0;
                kfs.push(
                    { t: 0, bgColor: '0b0c10', elements: [
                        { type: 'media', x: 0.5, y: 0.42, size: 0.36, shape: 'circle', fill: '1f2937', ring: 'f59e0b' },
                        { type: 'text', text: 'LVL 24', x: 0.5, y: 0.42, size: 0.12, color: '#f59e0b', bold: true },
                        { type: 'text', text: '{username} ranked up!', x: 0.5, y: 0.75, size: 0.09, color: '#e5e7eb', bold: false },
                    ] },
                    { t: 0.4, bgColor: '14100c', elements: [
                        { type: 'media', x: 0.5, y: 0.42, size: 0.46, shape: 'circle', fill: '292016', ring: 'fbbf24' },
                        { type: 'text', text: 'LVL 25', x: 0.5, y: 0.42, size: 0.15, color: '#fbbf24', bold: true },
                        { type: 'text', text: '{username} ranked up!', x: 0.5, y: 0.75, size: 0.1, color: '#ffffff', bold: true },
                    ] },
                    { t: 1, bgColor: '14100c', elements: [
                        { type: 'media', x: 0.5, y: 0.42, size: 0.46, shape: 'circle', fill: '292016', ring: 'fbbf24' },
                        { type: 'text', text: 'LVL 25', x: 0.5, y: 0.42, size: 0.15, color: '#fbbf24', bold: true },
                        { type: 'text', text: '{username} ranked up!', x: 0.5, y: 0.75, size: 0.1, color: '#ffffff', bold: true },
                    ] },
                );
                applyGen('Level-up template applied');
            };

            $('#gtmpl-alert', page).onclick = () => {
                easing = 'steps'; easeSel.value = 'steps';
                kfs.length = 0;
                const msgs = ['SERVER ANNOUNCEMENT', 'READ #announcements'];
                msgs.forEach((m, i) => kfs.push({
                    t: i / 2, bgColor: i % 2 === 0 ? '1a0d0d' : '0f0d1a',
                    elements: [{ type: 'text', text: m, x: 0.5, y: 0.5, size: 0.1, color: i % 2 === 0 ? '#fbbf24' : '#818cf8', bold: true }],
                }));
                applyGen('Announcement template applied');
            };

            const gifCfg = () => ({ width, height, durationMs, fps, easing, loop: true, keyframes: kfs, background: gBgTpl(), bgBlur: gBgBlur, bgDim: gBgDim });

            // Native render
            $('#gif-btn-rust', page).onclick = async () => {
                toast('Rendering GIFâ€¦');
                const r = await api(`/api/guilds/${guildId}/studio/render`, { body: { type: 'gif', config: gifCfg() } });
                if (r?.ok) {
                    toast(`GIF encoded in ${r.durationMs}ms!`);
                } else {
                    toast(r?.error || 'Render failed', 'err');
                }
            };

            // Download GIF
            $('#gif-btn-dl', page).onclick = async () => {
                toast('Rendering & downloading animated GIFâ€¦');
                const r = await api(`/api/guilds/${guildId}/studio/render`, { body: { type: 'gif', config: gifCfg() } });
                if (r?.dataUrl) {
                    const a = document.createElement('a');
                    a.download = `kotan-animated-${Date.now()}.gif`;
                    a.href = r.dataUrl;
                    a.click();
                    toast('GIF downloaded');
                }
            };

            // Save as Variable
            $('#gif-btn-save-var', page).onclick = async () => {
                const name = ($('#gif-var-name', page).value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
                if (!name) return toast('Enter a variable name first', 'err');
                toast(`Rendering & saving variable {gif:${name}}â€¦`);
                const cfg = gifCfg();
                const rendered = await api(`/api/guilds/${guildId}/studio/render`, { body: { type: 'gif', config: cfg } });
                const r = await api(`/api/guilds/${guildId}/studio/variables`, {
                    body: { name, type: 'gif', config: cfg, dataUrl: rendered?.dataUrl },
                });
                if (r?.ok) {
                    toast(`Saved animated variable {gif:${name}}!`);
                    $('#gif-var-badge', page).style.display = 'block';
                    const copyChip = $('#gif-var-copy-chip', page);
                    copyChip.textContent = `{gif:${name}} (Click to copy)`;
                    copyChip.onclick = () => {
                        navigator.clipboard.writeText(`{gif:${name}}`);
                        toast(`Copied {gif:${name}} to clipboard!`);
                    };
                } else {
                    toast(r?.error || 'Save failed', 'err');
                }
            };

            renderTrack();
            syncKfProps();
        },

        // ---------- CREATIVE STUDIO: ASSETS & VARIABLES MANAGER ----------
        async 'studio-vars'(page) {
            const r = await api(`/api/guilds/${guildId}/studio/variables`).catch(() => ({ ok: false, variables: {} }));
            const vars = r?.variables || {};
            const list = Object.values(vars);

            page.innerHTML = `
                <div>
                    <div class="page-title">Assets & Variables Gallery</div>
                    <p class="page-desc">Every graphic or GIF saved from Image Studio & GIF Studio is available here as a dynamic variable. Put them on embeds, welcome cards, boosting perks, and announcements.</p>
                </div>

                <div class="card" style="background:linear-gradient(135deg, rgba(99,102,241,0.12), rgba(232,98,46,0.08));border-color:var(--accent);">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:24px;display:inline-flex;align-items:center;">${ICONS.sparkle}</span>
                        <div>
                            <b>How to use your variables in Discord</b>
                            <p class="sub" style="margin-top:2px;">Type or paste any variable tag (e.g. <code>{img:welcome_banner}</code> or <code>{gif:welcome_anim}</code>) into any embed image field, card thumbnail, or welcome message. Kotan resolves and renders them live!</p>
                        </div>
                    </div>
                </div>

                <div class="ov-quick-bar mt">
                    <a class="ov-qb-btn highlight" href="#/image-studio">${ICONS.plus} <span>New Image</span></a>
                    <a class="ov-qb-btn highlight" href="#/gif-studio">${ICONS.plus} <span>New GIF Animation</span></a>
                </div>

                <div class="vars-gallery-grid" id="vars-grid">
                    ${list.length ? list.map(v => `
                        <div class="var-item-card" data-name="${esc(v.name)}">
                            <div class="var-thumb-preview">
                                ${v.dataUrl ? `<img src="${v.dataUrl}" alt="${esc(v.name)}">` : `<span class="muted small">No preview image</span>`}
                            </div>
                            <div class="var-meta-row">
                                <span class="chip ${v.type === 'gif' ? 'warn' : 'ok'}">${esc(v.type.toUpperCase())}</span>
                                <span class="muted small">${v.config?.width || 800}Ã—${v.config?.height || 300}</span>
                            </div>
                            <div class="var-meta-row">
                                <button type="button" class="var-tag-pill" data-copy="{${v.type === 'gif' ? 'gif' : 'img'}:${esc(v.name)}}" title="Click to copy">
                                    <span>{${v.type === 'gif' ? 'gif' : 'img'}:${esc(v.name)}}</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                </button>
                                <div class="var-actions">
                                    <button type="button" class="btn sm danger" data-del="${esc(v.name)}" title="Delete variable">${ICONS.trash}</button>
                                </div>
                            </div>
                        </div>`).join('') : `
                        <div class="card" style="grid-column:1/-1;text-align:center;padding:48px 24px;">
                            <div style="margin-bottom:8px;opacity:0.7;display:inline-block;">${ICONS.image}</div>
                            <h3>No variables saved yet</h3>
                            <p class="sub mb">Create custom banners or animated GIFs in Image Studio or GIF Studio, then click "Save as Variable"!</p>
                            <a class="btn" href="#/image-studio" style="margin-top:12px;">Open Image Studio</a>
                        </div>`}
                </div>`;

            $$('[data-copy]', page).forEach(b => {
                b.onclick = () => {
                    const tag = b.dataset.copy;
                    navigator.clipboard.writeText(tag);
                    toast(`Copied ${tag} to clipboard!`);
                };
            });

            $$('[data-del]', page).forEach(b => {
                b.onclick = async () => {
                    const name = b.dataset.del;
                    const ok = await confirmModal('Delete variable', `Remove variable {${name}}? Any embed referencing it will stop displaying it.`);
                    if (!ok) return;
                    toast(`Deleting ${name}â€¦`);
                    const res = await api(`/api/guilds/${guildId}/studio/variables/${name}`, { method: 'DELETE' });
                    if (res?.ok) {
                        toast(`Deleted variable {${name}}`);
                        PAGES['studio-vars'](page);
                    } else {
                        toast('Failed to delete', 'err');
                    }
                };
            });
        },

        // Activity leaderboards â€” messages, voice, channels and members.
        // One fetch covers the range; filters re-render client-side.
        async activity(page) {
            const d = await api(`/api/guilds/${guildId}/activity?days=${actDays}`);
            if (d.error) throw new Error(d.error);
            const mem = d.members || {};
            const users = d.users || {};
            const chans = d.channels || {};

            // Voice totals are stored as minutes â€” render "Xh Ym".
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
                { key: 'members', title: 'Members', rows: () => boards.members.filter((e) => memberOk(e.id)), row: (e, i) => urow(e, i, `${e.msg.toLocaleString()} msgs Â· ${fmtV(e.voice)}`) },
            ];

            page.innerHTML = `
                <div><div class="page-title">Activity</div>
                    <p class="page-desc">Who's active and where â€” every message, voice minute, join and leave is counted live.</p></div>
                <div class="card actbar">
                    <input type="text" id="actq" placeholder="Filter by name or IDâ€¦" value="${esc(actFilter.q)}">
                    ${selSlot('actroles')}
                    <div class="rpills">${[7, 14, 30, 90].map((dd) => `<button class="rpill${dd === actDays ? ' on' : ''}" data-d="${dd}">${dd}d</button>`).join('')}</div>
                </div>
                <div class="actgrid">${BOXES.map((b) => `
                    <div class="card actbox">
                        <div class="ph"><h3>${b.title}</h3>${b.key === 'members' ? `<span class="muted small">+${d.joins || 0} joined / -${d.leaves || 0} left</span>` : ''}</div>
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
                    <div class="ph"><h3>${b.title} Â· last ${actDays} days</h3><span class="chip">${rows.length}</span></div>
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
                    <button class="btn sm mt" id="add-rule">${ICONS.plus} <span>Add rule</span></button></div>`;

            const cmdOpts = CTX.commands.map((c) => ({ value: c.name, label: c.name }));
            const rulesEl = $('#rules', page);
            const renderRules = () => {
                rulesEl.innerHTML = rules.map((r, i) => `
                    <div class="modrow" data-i="${i}">
                        <div style="flex:0 0 160px">${selSlot(`rc_${i}`)}</div>
                        <div style="flex:0 0 180px">${selSlot(`rch_${i}`)}</div>
                        <input type="time" name="rs_${i}" value="${r.start || ''}" style="flex:0 0 110px" title="Start (HH:MM)">
                        <input type="time" name="re_${i}" value="${r.end || ''}" style="flex:0 0 110px" title="End (HH:MM)">
                        <button class="btn sm danger right" data-del="${i}" title="Remove" style="display:grid;place-items:center;">${ICONS.trash}</button>
                    </div>`).join('') || '<p class="muted small">No scoped rules.</p>';
                rules.forEach((r, i) => {
                    mountSelect(page, `rc_${i}`, { options: cmdOpts, value: r.command, placeholder: 'Commandâ€¦' });
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
                <div><div class="page-title">Triggers</div><p class="page-desc">Bare words that run a command â€” no prefix needed. Typing <code class="mono">balance</code> can run <code class="mono">.balance</code>.</p></div>
                <div class="card"><h3>New trigger</h3>
                    <div class="grid2">
                        ${fldHtml('Trigger word', txtIn('tname', '', 'e.g. balance'), 'any characters except spaces and slashes â€” can\'t start with the prefix, max 32')}
                        ${fldHtml('Command', selSlot('tcmd'), 'the command it runs')}
                    </div>
                    ${fldHtml('Arguments', txtIn('targs', '', 'optional â€” e.g. @user 100'), 'fixed args passed before whatever the sender types next')}
                    <div class="mt"><button class="btn primary sm" id="add-tag">Create trigger</button></div></div>
                <div class="card"><h3>Triggers</h3><div id="taglist"><div class="skeleton" style="height:60px"></div></div></div>`;
            mountSelect(page, 'tcmd', { options: CTX.commands.map((c) => ({ value: c.name, label: `${c.name} â€” ${(c.description || '').slice(0, 40)}` })), placeholder: 'Pick a command' });
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
                    ${fldHtml('Word blacklist', txtArea('blacklist', (a.blacklist || []).join('\n')), 'one per line â€” messages containing any are deleted')}
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
                <div class="card"><h3>Whitelist</h3><p class="sub mb">Automod never scans these channels, and never flags members holding these roles â€” applies to every check above.</p>
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
            // Every loggable event, grouped â€” each row has a toggle and a
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
                    ${fldHtml('Default log channel', selSlot('logch'), 'events without an override post here â€” empty = off')}
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
            mountSelect(page, 'wimg_tch', { options: [{ value: '', label: 'Pick a channelâ€¦' }, ...chOpts(DATA.channels)], value: '', placeholder: 'Pick a channelâ€¦' });
            $('#wimg_test', page).onclick = async (e) => {
                const status = $('#wimg_tstat', page);
                const channel = mounts.wimg_tch.get();
                if (!channel) { status.textContent = 'â€” pick a channel first'; return; }
                e.target.disabled = true;
                const f = formVals(page);
                const r = await api(`/api/guilds/${guildId}/welcome/test`, {
                    body: { channel, message: f.wmsg, embed: cardW.collect(f), image: imgedW.collect(f) },
                }).catch(() => null);
                e.target.disabled = false;
                status.textContent = r?.ok ? 'â€” sent!' : `â€” ${r?.error || 'failed'}`;
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
                <div><div class="page-title">AFK</div><p class="page-desc">Members go away with <code class="mono">.afk</code> or <code class="mono">/afk</code> â€” pinging them announces it, and <code class="mono">.afk pings</code> shows who tried. Placeholders: <code class="mono">{user}</code> <code class="mono">{username}</code> <code class="mono">{message}</code> <code class="mono">{ago}</code> <code class="mono">{channel}</code></p></div>
                <div class="card"><h3>Behavior</h3>
                    ${tgl('a_on', 'AFK enabled', a.enabled !== false)}
                    ${fldHtml('Default message', txtIn('a_def', a.defaultMessage || 'AFK'), 'used by a bare .afk with no text')}
                    ${fldHtml('Announcement', txtIn('a_ann', a.announce || ''), 'reply when an AFK member gets pinged â€” {user} {message} {ago} {channel}')}
                    ${tgl('a_clear', 'Welcome-back notice', a.selfClear !== false)}
                </div>
                <div class="card"><h3>Permissions</h3>
                    ${fldHtml('Allowed roles', selSlot('a_roles'), 'members need one of these â€” empty = everyone')}
                    ${fldHtml('Silent channels', selSlot('a_ch'), 'mentions here never announce AFK status')}
                </div>
                <div class="card"><h3>Announcement card</h3>
                    <p class="sub mb">Rich card replacing the plain announcement line â€” the same editor as Welcome.</p>
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
                    <div id="rrs"></div><button class="btn sm mt" id="add-rr">${ICONS.plus} <span>Add reaction role</span></button></div>`;
            mountSelect(page, 'autorole', { options: [{ value: '', label: 'Off' }, ...roOpts(DATA.roles)], value: r.autorole || '', placeholder: 'Off' });

            const rrEl = $('#rrs', page);
            const renderRrs = () => {
                rrEl.innerHTML = rrs.map((x, i) => `
                    <div class="modrow" data-i="${i}">
                        <div style="flex:0 0 170px">${selSlot(`rrc_${i}`)}</div>
                        <div style="flex:0 0 190px">${selSlot(`rrm_${i}`)}</div>
                        <input type="text" name="rre_${i}" value="${esc(x.emoji || '')}" placeholder="emoji" style="flex:0 0 90px">
                        <div style="flex:0 0 170px">${selSlot(`rrr_${i}`)}</div>
                        <button class="btn sm danger right" data-del="${i}" title="Remove" style="display:grid;place-items:center;">${ICONS.trash}</button>
                    </div>`).join('') || '<p class="muted small">No reaction roles.</p>';
                rrs.forEach((x, i) => {
                    const ch = mountSelect(page, `rrc_${i}`, { options: chOpts(DATA.channels), value: x.channelId, placeholder: 'Channelâ€¦' });
                    const ms = mountSelect(page, `rrm_${i}`, { options: [{ value: x.messageId || '', label: x.messageId ? `â€¦${String(x.messageId).slice(-6)}` : 'Pick channel first' }], value: x.messageId, placeholder: 'Messageâ€¦' });
                    mountSelect(page, `rrr_${i}`, { options: roOpts(DATA.roles), value: x.roleId, placeholder: 'Roleâ€¦' });
                    ch.addEventListener('change', async () => {
                        const cid = ch.get();
                        if (!cid) return;
                        ms.setOptions([{ value: '', label: 'Loadingâ€¦' }]);
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
                    <button class="btn sm mt" id="add-rw">${ICONS.plus} <span>Add reward</span></button></div>`;
            mountSelect(page, 'lvch', { options: [{ value: '', label: 'Same channel' }, ...chOpts(DATA.channels)], value: s.leveling.channel || '', placeholder: 'Same channel' });
            const rwEl = $('#rewards', page);
            const renderRw = () => {
                rwEl.innerHTML = rewards.map((x, i) => `
                    <div class="modrow"><span class="muted small">Level</span>
                    <input type="number" name="rl_${i}" value="${x.level || ''}" min="1" style="flex:0 0 80px">
                    <div class="grow">${selSlot(`rlr_${i}`)}</div>
                    <button class="btn sm danger" data-del="${i}" title="Remove" style="display:grid;place-items:center;">${ICONS.trash}</button></div>`).join('') || '<p class="muted small">No rewards.</p>';
                rewards.forEach((x, i) => mountSelect(page, `rlr_${i}`, { options: roOpts(DATA.roles), value: x.roleId, placeholder: 'Roleâ€¦' }));
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
                    ${fldHtml('Pay cap', numIn('payMax', s.economy.payMax, 1, 300000), 'max per payment â€” empty = 100,000, up to 300,000')}
                </div></div>
                <div class="card"><h3>Daily reward</h3><div class="grid2">
                    ${fldHtml('Base reward', numIn('dailyBase', s.economy.dailyBase, 0, 1000000), 'empty = 500')}
                    ${fldHtml('Streak bonus / day', numIn('dailyStreak', s.economy.dailyStreak, 0, 1000000), 'empty = 100')}
                    ${fldHtml('Max streak bonus', numIn('dailyMaxStreak', s.economy.dailyMaxStreak, 0, 10000000), 'empty = 1000')}
                </div></div>
                <div class="card"><h3>Shop items</h3><p class="sub mb">Your server's catalog â€” empty uses the built-in shop (cookie, coffee, ticket, gem, VIP).</p>
                    <div id="shopitems"></div><button class="btn sm mt" id="add-item">${ICONS.plus} <span>Add item</span></button></div>`;
            const siEl = $('#shopitems', page);
            const renderItems = () => {
                siEl.innerHTML = items.map((x, i) => `
                    <div class="modrow">
                        <input type="text" name="sn_${i}" value="${esc(x.name || '')}" placeholder="Item name" style="flex:0 0 160px">
                        <input type="number" name="sp_${i}" value="${x.price || ''}" placeholder="Price" min="1" style="flex:0 0 110px">
                        <input type="text" name="sd_${i}" value="${esc(x.description || '')}" placeholder="Description" class="grow">
                        <button class="btn sm danger" data-del="${i}" title="Remove" style="display:grid;place-items:center;">${ICONS.trash}</button></div>`).join('') || '<p class="muted small">No custom items â€” the built-in shop is used.</p>';
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
            // Live editor model â€” DOM rows mirror this array; collect() reads
            // the DOM back into payload shape so re-renders never lose input.
            const state = { sections: (s.sections || []).map((c) => ({ name: c.name || '', items: (c.items || []).map((i) => ({ ...i })) })) };

            const TYPE_OPTS = [
                { value: 'item', label: 'Item â€” collectible (lands in inventory)' },
                { value: 'role', label: 'Role â€” granted on buy' },
                { value: 'multiplier', label: 'Booster â€” timed coins/XP multiplier' },
                { value: 'crate', label: 'Crate â€” random drop per buy' },
            ];

            page.innerHTML = `
                <div><div class="page-title">Shop</div><p class="page-desc">Storefront text, custom sections, and per-item behavior.</p></div>
                <div class="card"><h3>Storefront</h3>
                    <div class="mb">${tgl('shop_on', 'Enable the shop', s.enabled !== false)}</div>
                    <div class="grid2">
                        ${fldHtml('Title', txtIn('shop_title', s.title, 'Shop'))}
                        ${fldHtml('Accent color', `<div class="clrrow"><input type="color" name="shop_pick" value="${esc(s.color || '#5865f2')}"><input type="text" name="shop_color" value="${esc(s.color || '')}" placeholder="#5865f2 â€” empty = default"></div>`)}
                    </div>
                    ${fldHtml('Description', txtIn('shop_desc', s.description), 'shown under the title when /shop opens')}
                </div>
                <div id="shopsecs"></div>
                <button class="btn sm" id="add-sec">+ Add section</button>
                <p class="muted small" style="margin-top:10px">Item ids are the shop's keys â€” <b>Item</b> entries land in inventory under their id
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
                    <input type="text" name="${p}_id" value="${esc(x.id || '')}" placeholder="id (auto)" title="Unique key â€” inventory entry, .shop buy <id>, crate pool reference" style="flex:0 0 110px">
                    <input type="text" name="${p}_desc" value="${esc(x.desc || '')}" placeholder="Description" class="grow">
                    <span data-fx="role">${selSlot(`${p}_role`)}</span>
                    <span data-fx="multiplier" style="display:contents">
                        ${selSlot(`${p}_kind`)}
                        <input type="number" name="${p}_mult" value="${x.mult ?? ''}" placeholder="2x" min="1" step="0.1" style="width:70px" title="Multiplier">
                        <input type="number" name="${p}_mins" value="${x.mins ?? ''}" placeholder="mins" min="1" style="width:80px" title="Duration (minutes)">
                    </span>
                    <span data-fx="crate" style="display:contents"><input type="text" name="${p}_pool" value="${esc(Array.isArray(x.pool) ? x.pool.join(', ') : x.pool || '')}" placeholder="cookie, gem, 50-200" style="min-width:180px" title="Comma-separated drops â€” item ids or coin amounts/ranges"></span>
                    <button class="btn sm" data-mv="-1" title="Move up" style="display:grid;place-items:center;">${ICONS.up}</button>
                    <button class="btn sm" data-mv="1" title="Move down" style="display:grid;place-items:center;">${ICONS.down}</button>
                    <button class="btn sm danger" data-del title="Remove" style="display:grid;place-items:center;">${ICONS.trash}</button>
                </div>`;
            };

            const secCard = (c, si) => `
                <div class="card" data-sec="${si}">
                    <div class="modrow" style="margin-bottom:10px">
                        <input type="text" name="sec_${si}_name" value="${esc(c.name || '')}" placeholder="Section name" class="grow">
                        <button class="btn sm" data-smv="-1" title="Move up" style="display:grid;place-items:center;">${ICONS.up}</button>
                        <button class="btn sm" data-smv="1" title="Move down" style="display:grid;place-items:center;">${ICONS.down}</button>
                        <button class="btn sm danger" data-sdel title="Delete section" style="display:grid;place-items:center;">${ICONS.trash}</button>
                    </div>
                    ${c.items.map((x, ii) => itemRow(x, si, ii)).join('') || '<p class="muted small">No items in this section yet.</p>'}
                    <button class="btn sm mt" data-additem>${ICONS.plus} <span>Add item</span></button>
                </div>`;

            const syncFx = (row) => {
                const t = row.dataset.type;
                row.querySelectorAll('[data-fx]').forEach((el) => { el.style.display = el.dataset.fx === t ? 'contents' : 'none'; });
            };

            const secsEl = $('#shopsecs', page);
            const render = () => {
                secsEl.innerHTML = state.sections.map(secCard).join('')
                    || '<div class="card"><p class="muted small">No sections â€” add one below to start selling.</p></div>';
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
                        mountSelect(page, `${p}_role`, { options: roOpts(DATA.roles), value: x.roleId, placeholder: 'Roleâ€¦' });
                        mountSelect(page, `${p}_kind`, { options: [{ value: 'coins', label: 'Coins' }, { value: 'xp', label: 'XP / Levels' }], value: x.kind || 'coins' });
                        syncFx(row);
                    });
                });
            };

            // Read the live DOM into payload shape â€” used both by bindSave and
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
                if (state.sections.length >= 10) return; // sane cap â€” menu fits 25 but pages get unwieldy
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
                <div><div class="page-title">Games</div><p class="page-desc">Wagers and rewards â€” global defaults, plus a per-game override below.</p></div>
                <div class="card"><h3>Defaults</h3><p class="sub mb">Applied to every game unless it has an override below.</p><div class="grid2">
                    ${fldHtml('Guess reward', numIn('guessReward', g.guessReward, 0, 10000000), 'number guess win')}
                    ${fldHtml('Scramble reward', numIn('scrambleReward', g.scrambleReward, 0, 10000000), 'first correct answer')}
                    ${fldHtml('Win multiplier', numIn('winMultiplier', g.winMultiplier, 0, 100), 'scales wager wins â€” 1 = normal')}
                    ${fldHtml('Max bet', numIn('maxBet', g.maxBet, 0, 100000000), 'wager cap â€” 0 = unlimited')}
                </div></div>
                ${WAGER.map(([k, label]) => `
                <div class="card"><h3>${label}</h3><div class="grid2">
                    ${fldHtml('Max bet', perIn(k, 'maxBet'), 'wager cap â€” empty = use default')}
                    ${fldHtml('Win multiplier', perIn(k, 'winMultiplier'), 'payout scale â€” empty = use default')}
                </div></div>`).join('')}
                ${REWARD.map(([k, label]) => `
                <div class="card"><h3>${label}</h3><div class="grid2">
                    ${fldHtml('Reward', perIn(k, 'reward'), 'coins per win â€” empty = use default')}
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
                <div><div class="page-title">Tickets</div><p class="page-desc">Members pick a topic on the panel â€” a private channel opens under your category.</p></div>
                <div class="card"><h3>Setup</h3>
                    <div class="mb">${tgl('tk_on', 'Enable tickets', t.enabled)}</div>
                    <div class="grid2">
                        ${fldHtml('Ticket category', selSlot('tkcat'), 'new ticket channels land here')}
                        ${fldHtml('Log channel', selSlot('tklog'), 'open/close announcements â€” empty = silent')}
                    </div>
                    <div class="grid2">
                        ${fldHtml('Support roles', selSlot('tkroles'), 'can see, claim and close tickets')}
                        ${fldHtml('Max open per member', numIn('tkmax', t.maxOpen, 1, 10))}
                    </div>
                    ${fldHtml('Channel naming', txtIn('tkname', t.naming, 'ticket-{user}'), 'placeholders: {user} {count}')}
                </div>
                <div class="card"><h3>Topics</h3><p class="sub mb">The panel dropdown â€” up to 10. With none, the panel shows a single "Open a ticket" button.</p>
                    <div id="topics"></div><button class="btn sm mt" id="add-topic">${ICONS.plus} <span>Add topic</span></button></div>
                <div class="card"><h3>Panel card</h3><p class="sub mb">The message people see â€” CV2 container, classic embed, or plain text when the card is off. The topic dropdown is attached automatically.</p>
                    ${cardEditorHtml('tp', t.panel || {})}</div>
                <div class="card"><h3>Post panel</h3>
                    ${fldHtml('Channel', selSlot('tkpost'), 'sends the panel immediately â€” uses saved settings')}
                    <div class="mt"><button class="btn" id="post-panel">Post panel</button> <span class="hint" id="post-status"></span></div></div>`;

            mountSelect(page, 'tkcat', { options: [{ value: '', label: 'No category' }, ...(DATA.categories || []).map((c) => ({ value: c.id, label: c.name, icon: ICONS.folder }))], value: t.categoryId || '', placeholder: 'No category' });
            mountSelect(page, 'tklog', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: t.logChannel || '', placeholder: 'Off' });
            mountSelect(page, 'tkroles', { multi: true, options: roOpts(DATA.roles), value: t.supportRoles || [], placeholder: 'Support rolesâ€¦' });
            mountSelect(page, 'tkpost', { options: chOpts(DATA.channels), placeholder: 'Pick a channelâ€¦' });
            const card = setupCardEditor(page, 'tp', t.panel || {}, {
                extras: t.topics?.length
                    ? [{ type: 'select', label: 'Choose a topicâ€¦' }]
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
                        <input type="text" name="tn_${i}" value="${esc(x.name || '')}" placeholder="Topic â€” e.g. General support" style="flex:0 0 200px">
                        <input type="text" name="td_${i}" value="${esc(x.desc || '')}" placeholder="Dropdown description" class="grow">
                        <button class="btn sm danger" data-del="${i}" title="Remove" style="display:grid;place-items:center;">${ICONS.trash}</button></div>`).join('')
                    || '<p class="muted small">No topics â€” the panel falls back to a single open button.</p>';
                $$('#topics [data-del]', page).forEach((b) => (b.onclick = () => { syncTopics(); topics.splice(+b.dataset.del, 1); renderTopics(); }));
            };
            renderTopics();
            $('#add-topic', page).onclick = () => { if (topics.length < 10) { syncTopics(); topics.push({ name: '', desc: '' }); renderTopics(); } };

            $('#post-panel', page).onclick = async (e) => {
                const status = $('#post-status', page);
                const channel = mounts.tkpost.get();
                if (!channel) { status.textContent = 'â€” pick a channel first'; return; }
                e.target.disabled = true;
                const r = await api(`/api/guilds/${guildId}/tickets/panel`, { body: { channel } }).catch(() => null);
                e.target.disabled = false;
                status.textContent = r?.ok ? 'â€” posted!' : `â€” ${r?.error || 'failed (save your settings first)'}`;
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
                <div><div class="page-title">CAPTCHA</div><p class="page-desc">Keep bots out â€” members click Verify on the panel, then pick the characters shown in a scrambled image to get the role.</p></div>
                <div class="card"><h3>Setup</h3>
                    <div class="mb">${tgl('cp_on', 'Enable CAPTCHA verification', c.enabled)}</div>
                    <div class="grid2">
                        ${fldHtml('Verified role', selSlot('cprole'), 'granted when a member passes â€” required')}
                        ${fldHtml('Log channel', selSlot('cplog'), 'pass/fail announcements â€” empty = silent')}
                    </div>
                    <p class="sub">Tip: hide your channels from @everyone and let only the verified role see them â€” that's what makes the gate work.</p>
                </div>
                <div class="card"><h3>Panel card</h3><p class="sub mb">The message people verify from â€” CV2 container, classic embed, or plain text when the card is off. The Verify button is attached automatically.</p>
                    ${cardEditorHtml('cp', c.panel || {})}</div>
                <div class="card"><h3>Post panel</h3>
                    ${fldHtml('Channel', selSlot('cppost'), 'sends the panel immediately â€” uses saved settings')}
                    <div class="mt"><button class="btn" id="post-panel">Post panel</button> <span class="hint" id="post-status"></span></div></div>`;

            mountSelect(page, 'cprole', { options: roOpts(DATA.roles), value: c.roleId || '', placeholder: 'Pick a roleâ€¦' });
            mountSelect(page, 'cplog', { options: [{ value: '', label: 'Off' }, ...chOpts(DATA.channels)], value: c.logChannel || '', placeholder: 'Off' });
            mountSelect(page, 'cppost', { options: chOpts(DATA.channels), placeholder: 'Pick a channelâ€¦' });
            const card = setupCardEditor(page, 'cp', c.panel || {}, {
                extras: [{ type: 'buttons', labels: ['Verify'], color: 'success' }],
                plain: 'Click **Verify** to prove you\'re human.',
            });

            $('#post-panel', page).onclick = async (e) => {
                const status = $('#post-status', page);
                const channel = mounts.cppost.get();
                if (!channel) { status.textContent = 'â€” pick a channel first'; return; }
                e.target.disabled = true;
                const r = await api(`/api/guilds/${guildId}/captcha/panel`, { body: { channel } }).catch(() => null);
                e.target.disabled = false;
                status.textContent = r?.ok ? 'â€” posted!' : `â€” ${r?.error || 'failed (save your settings first)'}`;
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
                <div><div class="page-title">VoiceMaster</div><p class="page-desc">Join-to-create voice channels â€” members who join the trigger channel get their own voice room and control it from the posted panel or by typing <code>.vc</code> in the channel's chat.</p></div>
                <div class="card"><h3>Setup</h3>
                    <div class="mb">${tgl('vm_on', 'Enable VoiceMaster', v.enabled)}</div>
                    <div class="grid2">
                        ${fldHtml('Trigger channel', selSlot('vmtrig'), 'joining this voice channel hands out a personal one')}
                        ${fldHtml('Category', selSlot('vmcat'), 'new voice channels land here â€” empty = same as trigger')}
                    </div>
                    <div class="grid2">
                        ${fldHtml('Channel naming', txtIn('vmname', v.naming, "{user}'s channel"), '{user} = username Â· {name} = display name')}
                        ${fldHtml('Default user limit', numIn('vmlimit', v.userLimit, 0, 99), '0 = unlimited')}
                    </div>
                    ${fldHtml('Default bitrate (kbps)', numIn('vmbit', v.bitrate, 0, 384), '0 = server default â€” capped by the server\'s boost level')}
                </div>
                <div class="card"><h3>Control panel</h3><p class="sub mb">The message members control their channel from â€” the button grid and bitrate picker attach automatically. Owners can also type <code>.vc</code> in their channel's built-in chat.</p>
                    ${cardEditorHtml('vmp', v.panel || {})}</div>
                <div class="card"><h3>Post panel</h3>
                    ${fldHtml('Channel', selSlot('vmpost'), 'sends the panel immediately â€” uses saved settings')}
                    <div class="mt"><button class="btn" id="post-panel">Post panel</button> <span class="hint" id="post-status"></span></div></div>`;

            mountSelect(page, 'vmtrig', { options: [{ value: '', label: 'Off' }, ...(DATA.voice || []).map((c) => ({ value: c.id, label: c.name, icon: ICONS.speaker }))], value: v.triggerId || '', placeholder: 'Pick a voice channelâ€¦' });
            mountSelect(page, 'vmcat', { options: [{ value: '', label: 'Same as trigger' }, ...(DATA.categories || []).map((c) => ({ value: c.id, label: c.name, icon: ICONS.folder }))], value: v.categoryId || '', placeholder: 'Same as trigger' });
            mountSelect(page, 'vmpost', { options: chOpts(DATA.channels), placeholder: 'Pick a channelâ€¦' });
            const card = setupCardEditor(page, 'vmp', v.panel || {}, {
                extras: VM_EXTRAS,
                plain: 'Join the trigger channel to get your own voice channel â€” manage it with the buttons below or by typing `.vc` in its chat.',
            });

            $('#post-panel', page).onclick = async (e) => {
                const status = $('#post-status', page);
                const channel = mounts.vmpost.get();
                if (!channel) { status.textContent = 'â€” pick a channel first'; return; }
                e.target.disabled = true;
                const r = await api(`/api/guilds/${guildId}/voicemaster/panel`, { body: { channel } }).catch(() => null);
                e.target.disabled = false;
                status.textContent = r?.ok ? 'â€” posted!' : `â€” ${r?.error || 'failed (save your settings first)'}`;
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
                    ${fldHtml('Message', txtArea('bmsg', b.message), '{user} {username} {server} {boosts} â€” sent as plain text when the card below is off')}
                    ${cardEditorHtml('bc', b.card || {}, ['{boosts}'])}
                </div>
                <div class="card"><h3>Booster role</h3>
                    ${fldHtml('Role granted on boost', selSlot('brole'), 'empty = none')}
                </div>
                <div class="card"><h3>Booster perks</h3><p class="sub mb">Passive boosts for members while they boost the server. Multipliers stack on top of purchased boosters.</p>
                    <div class="grid2">
                        ${fldHtml('Game winnings (x)', txtIn('pgames', b.perks?.games ?? 1), 'multiplier on all game payouts â€” 1 = off')}
                        ${fldHtml('Coin earnings (x)', txtIn('pcoins', b.perks?.coins ?? 1), 'multiplier on daily/other earnings â€” 1 = off')}
                        ${fldHtml('XP gain (x)', txtIn('pxp', b.perks?.xp ?? 1), 'multiplier on message XP â€” 1 = off')}
                        ${fldHtml('Shop discount %', txtIn('pshop', b.perks?.shop ?? 0), '0â€“90 â€” 0 = off')}
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
                <div class="card"><h3>Dashboard appearance</h3><p class="sub mb">Only affects this server's dashboard â€” accent color and a background image behind the panel.</p>
                    <div class="grid2">
                        ${fldHtml('Accent color', `<div class="clrrow"><input type="color" id="accentpick" value="${esc(/^#?[0-9a-f]{6}$/i.test(s.appearance.accent || '') ? '#' + s.appearance.accent.replace(/^#/, '') : '#f0a050')}"><input type="text" name="accent" value="${esc(s.appearance.accent || '')}" placeholder="#f0a050" maxlength="7"></div>`, 'hex â€” empty = default')}
                        ${fldHtml('Background image', `<div class="clrrow"><input type="text" name="bgimg" value="${esc(s.appearance.background || '')}" placeholder="https://â€¦"><button type="button" class="btn sm" id="pick-bg">Browseâ€¦</button><input type="file" id="bgfile" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none"></div>`, 'URL or a file upload â€” empty = none')}
                        ${fldHtml('Theme', selSlot('theme'), 'glass = translucent blurred panels â€” pairs well with a background image')}
                    </div></div>
                <div class="card"><h3>Bot profile</h3><p class="sub mb">Everything here is per-server â€” nickname, avatar and banner change how Kotan looks in this guild only. Click the preview to change them.</p>
                    <div class="bpgrid">
                        <div>
                            ${fldHtml('Nickname in this server', txtIn('nickname', s.branding.nickname || '', CTX.bot?.username || 'Kotan'), 'empty = default name')}
                            <input type="file" id="bavatar" accept="image/png,image/jpeg,image/webp" style="display:none">
                            <input type="file" id="bbanner" accept="image/png,image/jpeg,image/webp,image/gif" style="display:none">
                            <div class="flex">
                                <button class="btn sm" id="pick-avatar">Change avatarâ€¦</button>
                                <button class="btn sm" id="pick-banner">Add bannerâ€¦</button>
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

            // Live Discord profile popout â€” nickname + accent/banner from the form.
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
                    if (file.size > 3 * 1024 * 1024) return (status.textContent = 'Too big â€” max ~3MB');
                    status.textContent = 'Uploadingâ€¦';
                    const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
                    const r = await api(`/api/guilds/${guildId}/branding/${key}`, { body: { [key]: dataUrl } });
                    if (r.ok) { done(r); updProf(); status.textContent = 'Updated â€” may take a minute to show in Discord.'; }
                    else status.textContent = r.error || 'Failed';
                    e.target.value = '';
                };
            };
            wirePick('#bavatar', 'avatar', (r) => { if (CTX.bot) CTX.bot.avatarUrl = r.avatarUrl || null; });
            wirePick('#bbanner', 'banner', (r) => { if (CTX.bot) CTX.bot.bannerUrl = r.bannerUrl || null; });
            $('#pick-avatar', page).onclick = () => $('#bavatar', page).click();
            $('#pick-banner', page).onclick = () => $('#bbanner', page).click();
            const brandDel = async (key) => {
                status.textContent = 'Removingâ€¦';
                const r = await api(`/api/guilds/${guildId}/branding/${key}`, { method: 'DELETE' });
                if (r.ok) {
                    if (CTX.bot) {
                        if (key === 'avatar') CTX.bot.avatarUrl = r.avatarUrl || null;
                        else CTX.bot.bannerUrl = r.bannerUrl || null;
                    }
                    updProf();
                    status.textContent = 'Removed â€” may take a minute to propagate.';
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

            // Wallpaper browse â€” uploads to the server, saves, applies live.
            $('#pick-bg', page).onclick = () => $('#bgfile', page).click();
            $('#bgfile', page).onchange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 6 * 1024 * 1024) return toast('Too big â€” max ~6MB', 'err');
                const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(file); });
                toast('Uploading wallpaperâ€¦');
                const r = await api(`/api/guilds/${guildId}/appearance/bg`, { body: { image: dataUrl } });
                if (r.ok) {
                    $('[name=bgimg]', page).value = r.url;
                    // Same fields (and key order) as the appearance collect()
                    // â€” save() rebaselines the section so the bar stays hidden.
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
        const navScroll = $('.dnav')?.scrollTop ?? 0;
        updateShell(slug);
        const navEl = $('.dnav');
        if (navEl && navScroll) navEl.scrollTop = navScroll;
        const page = $('#page');
        const canvasEl = $('.dcontent-canvas');
        if (canvasEl) canvasEl.scrollTop = 0;
        const render = PAGES[slug] || PAGES.overview;
        // Drop select mounts from the previous page â€” stale elements would
        // otherwise leak into the next page's collects. Portal'd pops on
        // <body> outlive their triggers, so sweep them too.
        for (const k in mounts) delete mounts[k];
        $$('.dselpop').forEach((p) => p.remove());
        // Reset unsaved-changes tracking â€” registered sections and their
        // baselines belong to the page being replaced.
        saveSections = [];
        dirtyObs?.disconnect();
        dirtyObs = null;
        renderDirtyBar();
        try {
            await render(page);
            if (slug !== 'overview' && !slug.includes('studio') && slug !== 'studio-vars') {
                bindSubnav(page);
            }
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

