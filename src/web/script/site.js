/* ==========================================================================
   Kotan Public Script — Redesigned Experience
   Features: Universal theme customizer drawer, live interactive studio playground,
   FAQ accordion, mobile drawer, stats counter, docs search and copy.
   ========================================================================== */

(function () {
    'use strict';

    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const api = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    // ==========================================================================
    // Universal Theme Management
    // ==========================================================================
    const THEME_KEY = 'kotan-theme';
    const PALETTES = {
        indigo:  { accent: '#6366f1', accent2: '#4f46e5', label: 'Indigo' },
        sunset:  { accent: '#e8622e', accent2: '#c94e20', label: 'Sunset' },
        emerald: { accent: '#10b981', accent2: '#059669', label: 'Emerald' },
        crimson: { accent: '#f43f5e', accent2: '#e11d48', label: 'Ruby' },
        sakura:  { accent: '#ec4899', accent2: '#db2777', label: 'Sakura' },
        blurple: { accent: '#5865f2', accent2: '#4752c4', label: 'Blurple' },
        cyan:    { accent: '#06b6d4', accent2: '#0891b2', label: 'Cyan' },
        amber:   { accent: '#f59e0b', accent2: '#d97706', label: 'Amber' },
    };

    function loadTheme() {
        try {
            return JSON.parse(localStorage.getItem(THEME_KEY) || '{}');
        } catch {
            return {};
        }
    }

    let theme = loadTheme();

    function applyTheme(t = theme) {
        const root = document.documentElement;

        // Mode: dark (default), oled, light
        root.dataset.mode = t.mode || '';
        // Density
        root.dataset.density = t.density || '';
        // Motion
        root.dataset.motion = t.motion || '';
        // Glass
        root.dataset.glass = t.glass === 0 || t.glass === '0' ? '0' : '1';

        // Palette or custom accent
        if (t.palette && PALETTES[t.palette]) {
            root.dataset.palette = t.palette;
            const p = PALETTES[t.palette];
            root.style.setProperty('--accent', p.accent);
            root.style.setProperty('--accent-2', p.accent2);
            root.style.setProperty('--accent-soft', p.accent + '26');
            root.style.setProperty('--accent-glow', p.accent + '50');
        } else if (t.accent && /^#[0-9a-f]{6}$/i.test(t.accent)) {
            root.removeAttribute('data-palette');
            root.style.setProperty('--accent', t.accent);
            root.style.setProperty('--accent-2', t.accent2 || t.accent);
            root.style.setProperty('--accent-soft', t.accent + '26');
            root.style.setProperty('--accent-glow', t.accent + '50');
        } else {
            root.dataset.palette = 'indigo';
            const p = PALETTES.indigo;
            root.style.setProperty('--accent', p.accent);
            root.style.setProperty('--accent-2', p.accent2);
            root.style.setProperty('--accent-soft', p.accent + '26');
            root.style.setProperty('--accent-glow', p.accent + '50');
        }

        try {
            localStorage.setItem(THEME_KEY, JSON.stringify(t));
        } catch {}
    }

    // Apply immediately on boot
    applyTheme();

    // Listen for storage events across tabs
    window.addEventListener('storage', (e) => {
        if (e.key === THEME_KEY) {
            theme = loadTheme();
            applyTheme(theme);
            syncCustomizerUI();
        }
    });

    // ==========================================================================
    // Theme Customizer Drawer UI
    // ==========================================================================
    let themeDrawer = $('#theme-drawer');
    let themeBackdrop = $('#theme-backdrop');
    const openThemeBtn = $('#open-theme-btn');
    let closeThemeBtn = $('#close-theme-btn');

    function ensureThemeDrawer() {
        if (themeDrawer && themeBackdrop) return;
        themeBackdrop = document.createElement('div');
        themeBackdrop.className = 'theme-drawer-backdrop';
        themeBackdrop.id = 'theme-backdrop';
        document.body.appendChild(themeBackdrop);

        themeDrawer = document.createElement('aside');
        themeDrawer.className = 'theme-drawer';
        themeDrawer.id = 'theme-drawer';
        themeDrawer.setAttribute('aria-label', 'Theme Customizer');
        themeDrawer.innerHTML = `
            <div class="theme-drawer-head">
                <h3><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18v-18z"/></svg> Theme Customizer</h3>
                <button type="button" class="theme-close-btn" id="close-theme-btn" aria-label="Close theme customizer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
            </div>
            <div class="theme-drawer-body">
                <div>
                    <div class="theme-sec-title">Palette Presets</div>
                    <div class="palette-grid" id="palette-picker">
                        ${Object.entries(PALETTES).map(([k, v]) => `
                            <button type="button" class="palette-btn" data-palette="${k}">
                                <span class="palette-swatch" style="background:${v.accent}"></span>
                                <span>${v.label}</span>
                            </button>`).join('')}
                    </div>
                </div>
                <div>
                    <div class="theme-sec-title">Custom Accent Color</div>
                    <div style="display:flex;gap:10px;align-items:center;">
                        <input type="color" id="custom-accent-picker" style="width:48px;height:40px;border-radius:8px;border:1px solid var(--border);background:var(--panel-2);cursor:pointer;">
                        <input type="text" id="custom-accent-hex" placeholder="#6366f1" maxlength="7" style="flex:1;padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:var(--mono);font-size:14px;">
                    </div>
                </div>
                <div>
                    <div class="theme-sec-title">Color Mode</div>
                    <div class="segmented-control" id="mode-control">
                        <button type="button" class="segmented-btn" data-mode="">Dark</button>
                        <button type="button" class="segmented-btn" data-mode="oled">OLED</button>
                        <button type="button" class="segmented-btn" data-mode="light">Light</button>
                    </div>
                </div>
                <div>
                    <div class="theme-sec-title">Surface Style</div>
                    <div class="segmented-control" id="glass-control">
                        <button type="button" class="segmented-btn" data-glass="1">Frosted Glass</button>
                        <button type="button" class="segmented-btn" data-glass="0">Solid Modern</button>
                    </div>
                </div>
                <div>
                    <div class="theme-sec-title">Interface Density</div>
                    <div class="segmented-control" id="density-control">
                        <button type="button" class="segmented-btn" data-density="">Comfortable</button>
                        <button type="button" class="segmented-btn" data-density="compact">Compact</button>
                    </div>
                </div>
                <div>
                    <button type="button" class="btn outline" id="reset-theme-btn" style="width:100%;font-size:13px;">Reset to Defaults</button>
                </div>
            </div>`;
        document.body.appendChild(themeDrawer);
        bindThemeDrawerControls();
    }

    function syncCustomizerUI() {
        if (!themeDrawer) return;

        // Sync palettes
        $$('.palette-btn', themeDrawer).forEach((btn) => {
            btn.classList.toggle('active', (theme.palette || 'indigo') === btn.dataset.palette);
        });

        // Sync custom accent inputs
        const colPick = $('#custom-accent-picker', themeDrawer);
        const colHex = $('#custom-accent-hex', themeDrawer);
        const curAccent = theme.accent || (theme.palette ? PALETTES[theme.palette]?.accent : '#6366f1');
        if (colPick && colHex) {
            colPick.value = curAccent;
            colHex.value = curAccent;
        }

        // Sync mode segmented control
        $$('#mode-control .segmented-btn', themeDrawer).forEach((btn) => {
            btn.classList.toggle('active', (theme.mode || '') === btn.dataset.mode);
        });

        // Sync glass segmented control
        $$('#glass-control .segmented-btn', themeDrawer).forEach((btn) => {
            const isGlass = theme.glass !== 0 && theme.glass !== '0';
            btn.classList.toggle('active', btn.dataset.glass === (isGlass ? '1' : '0'));
        });

        // Sync density segmented control
        $$('#density-control .segmented-btn', themeDrawer).forEach((btn) => {
            btn.classList.toggle('active', (theme.density || '') === btn.dataset.density);
        });
    }

    function bindThemeDrawerControls() {
        if (!themeDrawer) return;
        closeThemeBtn = $('#close-theme-btn', themeDrawer);

        const closeDrawer = () => {
            themeDrawer?.classList.remove('open');
            themeBackdrop?.classList.remove('open');
        };

        closeThemeBtn?.addEventListener('click', closeDrawer);
        themeBackdrop?.addEventListener('click', closeDrawer);

        // Palette buttons
        $$('.palette-btn', themeDrawer).forEach((btn) => {
            btn.addEventListener('click', () => {
                theme.palette = btn.dataset.palette;
                delete theme.accent;
                delete theme.accent2;
                applyTheme();
                syncCustomizerUI();
            });
        });

        // Custom color picker
        const colPick = $('#custom-accent-picker', themeDrawer);
        const colHex = $('#custom-accent-hex', themeDrawer);

        if (colPick && colHex) {
            colPick.addEventListener('input', () => {
                const hex = colPick.value;
                colHex.value = hex;
                delete theme.palette;
                theme.accent = hex;
                theme.accent2 = hex;
                applyTheme();
                syncCustomizerUI();
            });

            colHex.addEventListener('input', () => {
                let v = colHex.value.trim();
                if (!v.startsWith('#')) v = '#' + v;
                if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                    colPick.value = v;
                    delete theme.palette;
                    theme.accent = v;
                    theme.accent2 = v;
                    applyTheme();
                    syncCustomizerUI();
                }
            });
        }

        // Mode switch
        $$('#mode-control .segmented-btn', themeDrawer).forEach((btn) => {
            btn.addEventListener('click', () => {
                theme.mode = btn.dataset.mode;
                applyTheme();
                syncCustomizerUI();
            });
        });

        // Glass switch
        $$('#glass-control .segmented-btn', themeDrawer).forEach((btn) => {
            btn.addEventListener('click', () => {
                theme.glass = btn.dataset.glass === '1' ? 1 : 0;
                applyTheme();
                syncCustomizerUI();
            });
        });

        // Density switch
        $$('#density-control .segmented-btn', themeDrawer).forEach((btn) => {
            btn.addEventListener('click', () => {
                theme.density = btn.dataset.density;
                applyTheme();
                syncCustomizerUI();
            });
        });

        // Reset
        $('#reset-theme-btn', themeDrawer)?.addEventListener('click', () => {
            theme = { palette: 'indigo', mode: '', glass: 1, density: '' };
            applyTheme();
            syncCustomizerUI();
        });
    }

    function initThemeCustomizer() {
        const openDrawer = () => {
            ensureThemeDrawer();
            syncCustomizerUI();
            themeDrawer?.classList.add('open');
            themeBackdrop?.classList.add('open');
        };

        openThemeBtn?.addEventListener('click', openDrawer);

        if (themeDrawer) {
            bindThemeDrawerControls();
        }
    }

    initThemeCustomizer();

    // ==========================================================================
    // Mobile Drawer Navigation
    // ==========================================================================
    const mobileToggle = $('#mobile-toggle');
    const mobileNav = $('#mobile-nav');

    if (mobileToggle && mobileNav) {
        mobileToggle.addEventListener('click', () => {
            mobileNav.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            if (!mobileToggle.contains(e.target) && !mobileNav.contains(e.target)) {
                mobileNav.classList.remove('open');
            }
        });
    }

    // ==========================================================================
    // Interactive Studio Playground (Homepage)
    // ==========================================================================
    const playgroundDisplay = $('#playground-display');
    const playgroundTabs = $$('#playground-tabs .studio-tab');

    const STUDIO_MOCKS = {
        welcome: `
            <div style="font-family:'gg sans','Segoe UI',sans-serif;color:#dbdee1;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:grid;place-items:center;color:#fff;font-weight:700;">K</div>
                    <div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-weight:700;color:#f2f3f5;font-size:15px;">Kotan</span>
                            <span style="background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;">BOT</span>
                            <span style="font-size:12px;color:#949ba4;">Today at 2:15 PM</span>
                        </div>
                    </div>
                </div>
                <div style="background:#2b2d31;border-radius:8px;border-left:4px solid var(--accent);padding:14px 16px;">
                    <h4 style="color:#f2f3f5;font-size:16px;margin-bottom:6px;display:flex;align-items:center;gap:6px;">Welcome to the server, @CyberProwler! <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/></svg></h4>
                    <p style="font-size:14px;color:#dbdee1;margin-bottom:12px;">You are member <strong>#1,489</strong>. Grab your roles in #roles and make yourself at home!</p>
                    <div style="background:#1e1f22;border-radius:6px;height:80px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.06);">
                        <span style="font-size:12px;color:#fff;font-weight:600;background:rgba(0,0,0,0.4);padding:4px 12px;border-radius:999px;"><span class="tag-dot"></span> Canvas Welcome Artwork <span class="tag-dot"></span></span>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:12px;">
                        <button type="button" class="btn primary sm" style="font-size:12px;padding:5px 12px;">Rules <span class="tag-dot"></span> #rules</button>
                        <button type="button" class="btn ghost sm" style="font-size:12px;padding:5px 12px;border:1px solid rgba(255,255,255,0.1);">Get Roles</button>
                    </div>
                </div>
            </div>`,

        voicemaster: `
            <div style="font-family:'gg sans','Segoe UI',sans-serif;color:#dbdee1;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:grid;place-items:center;color:#fff;font-weight:700;">K</div>
                    <div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-weight:700;color:#f2f3f5;font-size:15px;">VoiceMaster <span class="tag-dot"></span> Kotan</span>
                            <span style="background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;">BOT</span>
                            <span style="font-size:12px;color:#949ba4;">Voice Controller</span>
                        </div>
                    </div>
                </div>
                <div style="background:#2b2d31;border-radius:8px;border-left:4px solid var(--ok);padding:14px 16px;">
                    <h4 style="color:#f2f3f5;font-size:15px;margin-bottom:4px;display:flex;align-items:center;gap:6px;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>Voice Channel Controller: "Alex's Lounge"</h4>
                    <p style="font-size:13.5px;color:#949ba4;margin-bottom:12px;">Use the interactive buttons below to manage your temporary voice room.</p>
                    <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:8px;">
                        <button type="button" class="btn sm" style="background:#383a40;border:none;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>Lock Channel</button>
                        <button type="button" class="btn sm" style="background:#383a40;border:none;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>Set User Limit</button>
                        <button type="button" class="btn sm" style="background:#383a40;border:none;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>Rename Room</button>
                        <button type="button" class="btn sm" style="background:#383a40;border:none;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>Bitrate Boost</button>
                        <button type="button" class="btn sm" style="background:#383a40;border:none;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>Kick Member</button>
                        <button type="button" class="btn sm" style="background:#383a40;border:none;font-size:12px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5z"/></svg>Transfer Host</button>
                    </div>
                </div>
            </div>`,

        ticket: `
            <div style="font-family:'gg sans','Segoe UI',sans-serif;color:#dbdee1;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:grid;place-items:center;color:#fff;font-weight:700;">K</div>
                    <div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-weight:700;color:#f2f3f5;font-size:15px;">Support Desk <span class="tag-dot"></span> Kotan</span>
                            <span style="background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;">BOT</span>
                        </div>
                    </div>
                </div>
                <div style="background:#2b2d31;border-radius:8px;border-left:4px solid #38bdf8;padding:14px 16px;">
                    <h4 style="color:#f2f3f5;font-size:15px;margin-bottom:6px;">Need Assistance? Open a Support Ticket</h4>
                    <p style="font-size:13.5px;color:#dbdee1;margin-bottom:12px;">Select a topic below. A private support channel will be automatically generated with server staff.</p>
                    <div style="background:#1e1f22;padding:10px 14px;border-radius:6px;border:1px solid rgba(255,255,255,0.08);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:#949ba4;">
                        <span>Select topic... (General Support / Report Bug / Billing)</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                    </div>
                    <button type="button" class="btn primary sm" style="width:100%;font-size:13px;display:flex;align-items:center;justify-content:center;gap:6px;"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>Create Ticket</button>
                </div>
            </div>`,

        economy: `
            <div style="font-family:'gg sans','Segoe UI',sans-serif;color:#dbdee1;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <div style="width:40px;height:40px;border-radius:50%;background:var(--accent);display:grid;place-items:center;color:#fff;font-weight:700;">K</div>
                    <div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="font-weight:700;color:#f2f3f5;font-size:15px;">Kotan Economy</span>
                            <span style="background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;">BOT</span>
                        </div>
                    </div>
                </div>
                <div style="background:#2b2d31;border-radius:8px;border-left:4px solid #f59e0b;padding:16px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                        <div>
                            <span style="font-weight:700;font-size:16px;color:#f2f3f5;">@Alex</span>
                            <span style="font-size:12px;color:#f59e0b;margin-left:6px;font-weight:700;">LEVEL 34</span>
                        </div>
                        <span style="background:rgba(245,158,11,0.2);color:#f59e0b;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:5px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></svg>24,850 COINS</span>
                    </div>
                    <div style="background:#1e1f22;border-radius:999px;height:10px;overflow:hidden;margin-bottom:6px;">
                        <div style="background:linear-gradient(90deg, #f59e0b, #ef4444);width:78%;height:100%;border-radius:999px;"></div>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:11.5px;color:#949ba4;">
                        <span>XP: 7,820 / 10,000</span>
                        <span>Rank: #4 of 1,280</span>
                    </div>
                </div>
            </div>`,
    };

    if (playgroundDisplay && playgroundTabs.length) {
        const setPlaygroundTab = (tabKey) => {
            playgroundTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabKey));
            playgroundDisplay.innerHTML = STUDIO_MOCKS[tabKey] || STUDIO_MOCKS.welcome;
        };

        playgroundTabs.forEach((tab) => {
            tab.addEventListener('click', () => setPlaygroundTab(tab.dataset.tab));
        });

        // Initialize default tab
        setPlaygroundTab('welcome');
    }

    // ==========================================================================
    // FAQ Accordion
    // ==========================================================================
    $$('#faq-accordion .faq-item').forEach((item) => {
        const q = item.querySelector('.faq-q');
        q?.addEventListener('click', () => {
            const isOpen = item.classList.contains('open');
            $$('#faq-accordion .faq-item').forEach((i) => i.classList.remove('open'));
            if (!isOpen) item.classList.add('open');
        });
    });

    // ==========================================================================
    // Chrome, Auth, and Stats
    // ==========================================================================
    const navKey = { '/': 'home', '/doc': 'doc', '/uptime': 'uptime', '/dashboard': 'dash' }[location.pathname];
    if (navKey) $(`[data-nav="${navKey}"]`)?.classList.add('active');

    $('#yr') && ($('#yr').textContent = new Date().getFullYear());
    $$('#last-updated').forEach((el) => (el.textContent = el.dataset.v || '2026-10-09'));

    api('/api/me').then((d) => {
        if (!d) return;
        const slot = $('#nav-user');
        if (d.user) {
            if (!slot) return;
            const av = d.user.avatar
                ? `https://cdn.discordapp.com/avatars/${d.user.id}/${d.user.avatar}.png?size=64`
                : 'https://cdn.discordapp.com/embed/avatars/0.png';
            slot.innerHTML = `<img src="${esc(av)}" alt="" style="width:28px;height:28px;border-radius:50%;margin-left:6px;vertical-align:middle;"> <a class="btn sm ghost" href="/auth/logout">Sign out</a>`;
        } else {
            // Logged out
            $('[data-nav="dash"]')?.remove();
            $$('.js-cta').forEach((b) => {
                b.href = '/login';
                if (b.id === 'nav-cta-btn') b.textContent = 'Log In';
            });
        }
    });

    // Homepage stats cache & paint
    if ($('#stats')) {
        const statEls = $$('[data-stat]');
        const paint = (d) => statEls.forEach((el) => {
            const v = d?.[el.dataset.stat];
            if (typeof v === 'number') el.textContent = v.toLocaleString();
        });
        try { paint(JSON.parse(sessionStorage.getItem('kotan-stats'))); } catch {}
        api('/api/stats').then((d) => {
            if (!d) return;
            paint(d);
            try { sessionStorage.setItem('kotan-stats', JSON.stringify(d)); } catch {}
        });
    }

    // ==========================================================================
    // Documentation Page Behaviors
    // ==========================================================================
    const docBody = $('#doc-body');
    if (docBody) {
        api('/api/commands').then((d) => {
            if (!d) { docBody.innerHTML = '<p class="muted">Could not load commands.</p>'; return; }
            const prefix = d.prefix || '!';
            $('#prefix') && ($('#prefix').textContent = prefix);
            const byMod = {};
            for (const c of d.commands) (byMod[c.module] ||= []).push(c);
            const mods = d.modules.filter((m) => byMod[m.id]?.length);

            const meta = (c) => {
                const bits = [];
                if (c.aliases?.length) bits.push(`<span class="tag">aka ${c.aliases.map(esc).join(', ')}</span>`);
                if (c.cooldown) bits.push(`<span class="tag">${c.cooldown}s cooldown</span>`);
                for (const p of c.permissions || []) bits.push(`<span class="tag perm">${esc(p)}</span>`);
                return bits.length ? `<div class="meta">${bits.join('')}</div>` : '';
            };

            docBody.innerHTML = mods.map((m) => `
                <section class="doc-cat" id="mod-${esc(m.id)}" data-mod="${esc(m.id)}">
                    <h2>${esc(m.label)} <span class="count">${byMod[m.id].length}</span></h2>
                    <p>${esc(m.description)}</p>
                    <div class="cmd-grid">${byMod[m.id].map((c) => `
                        <div class="cmd" title="Click to copy command" data-q="${esc((c.name + ' ' + c.description + ' ' + m.label + ' ' + (c.aliases || []).join(' ')).toLowerCase())}">
                            <code class="usage">${esc(prefix)}${esc(c.name)}${c.usage ? ` <span class="u">${esc(c.usage)}</span>` : ''}</code>
                            <p>${esc(c.description)}</p>
                            ${meta(c)}
                            <span class="copied">copied</span>
                        </div>`).join('')}
                    </div>
                </section>`).join('');

            // Sidebar TOC
            const toc = $('#doc-toc');
            if (toc) {
                toc.innerHTML = mods.map((m) =>
                    `<a href="#mod-${esc(m.id)}" data-toc="${esc(m.id)}">${esc(m.label)}<span class="n">${byMod[m.id].length}</span></a>`).join('');
                const tocLinks = $$('a', toc);
                const spy = new IntersectionObserver((ents) => {
                    for (const e of ents) if (e.isIntersecting) {
                        tocLinks.forEach((l) => l.classList.toggle('on', l.dataset.toc === e.target.dataset.mod));
                    }
                }, { rootMargin: '-20% 0px -70% 0px' });
                $$('.doc-cat', docBody).forEach((s) => spy.observe(s));
            }

            // Click to copy command
            docBody.addEventListener('click', (e) => {
                const card = e.target.closest('.cmd');
                if (!card) return;
                const cmd = card.querySelector('.usage').childNodes[0].textContent.trim();
                navigator.clipboard?.writeText(cmd).catch(() => {});
                card.classList.add('copied');
                setTimeout(() => card.classList.remove('copied'), 1200);
            });

            // Filter search
            $('#doc-q')?.addEventListener('input', (e) => {
                const q = e.target.value.trim().toLowerCase();
                let visible = 0;
                $$('.cmd', docBody).forEach((el) => {
                    const show = !q || el.dataset.q.includes(q);
                    el.style.display = show ? '' : 'none';
                    if (show) visible++;
                });
                $$('.doc-cat', docBody).forEach((sec) => {
                    sec.style.display = $$('.cmd', sec).some((el) => el.style.display !== 'none') ? '' : 'none';
                });
                const empty = $('#doc-empty');
                if (empty) empty.style.display = visible ? 'none' : 'block';
                toc && (toc.parentElement.style.display = q ? 'none' : '');
            });

            // "/" shortcut for search
            document.addEventListener('keydown', (e) => {
                if (e.key === '/' && !/^(input|textarea|select)$/i.test(document.activeElement?.tagName)) {
                    e.preventDefault();
                    $('#doc-q')?.focus();
                }
            });
        });
    }

    // ==========================================================================
    // Login Redirect Flow
    // ==========================================================================
    if ($('#login-btn')) {
        const next = new URLSearchParams(location.search).get('next');
        if (next && next.startsWith('/')) $('#login-btn').href = `/auth/discord?next=${encodeURIComponent(next)}`;
        if (new URLSearchParams(location.search).get('error')) $('#err').style.display = 'block';
    }
})();
