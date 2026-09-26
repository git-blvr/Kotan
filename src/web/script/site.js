/* Shared public-page behavior: theme boot, nav state, user chip,
   homepage stats, docs search, legal dates. */

(function () {
    'use strict';

    // --- theme (applied as early as defer allows; dark is the CSS default) ---
    const theme = (() => {
        try { return JSON.parse(localStorage.getItem('kotan-theme') || '{}'); } catch { return {}; }
    })();
    const root = document.documentElement;
    if (theme.mode) root.dataset.mode = theme.mode;
    if (theme.density) root.dataset.density = theme.density;
    if (theme.motion) root.dataset.motion = theme.motion;
    if (theme.accent) {
        root.style.setProperty('--accent', theme.accent);
        root.style.setProperty('--accent-soft', theme.accent + '24');
    }

    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const api = (path) => fetch(path).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    // --- chrome ---
    const navKey = { '/': 'home', '/doc': 'doc', '/uptime': 'uptime', '/dashboard': 'dash' }[location.pathname];
    if (navKey) $(`[data-nav="${navKey}"]`)?.classList.add('active');
    $('#yr') && ($('#yr').textContent = new Date().getFullYear());
    $$('#last-updated').forEach((el) => (el.textContent = el.dataset.v || '2025-09-22'));

    api('/api/me').then((d) => {
        if (!d) return;
        const slot = $('#nav-user');
        if (d.user) {
            if (!slot) return;
            const av = d.user.avatar
                ? `https://cdn.discordapp.com/avatars/${d.user.id}/${d.user.avatar}.png?size=64`
                : 'https://cdn.discordapp.com/embed/avatars/0.png';
            slot.innerHTML = `<img src="${av}" alt=""> <span>${esc(d.user.username)}</span> <a class="btn sm ghost" href="/auth/logout">Sign out</a>`;
        } else {
            // logged out: "Dashboard" → "Log in", and every CTA points at /login
            const dashLink = $('[data-nav="dash"]');
            if (dashLink) { dashLink.textContent = 'Log in'; dashLink.href = '/login'; }
            $$('.js-cta').forEach((b) => { b.textContent = 'Log in'; b.href = '/login'; });
        }
    });

    // --- homepage stats ---
    if ($('#stats')) {
        api('/api/stats').then((d) => {
            if (!d) return;
            $$('[data-stat]').forEach((el) => {
                const v = d[el.dataset.stat];
                el.textContent = typeof v === 'number' ? v.toLocaleString() : '—';
            });
        });
    }

    // --- docs ---
    const docBody = $('#doc-body');
    if (docBody) {
        api('/api/commands').then((d) => {
            if (!d) { docBody.innerHTML = '<p class="muted">Could not load commands.</p>'; return; }
            $('#prefix').textContent = d.prefix || '!';
            const byMod = {};
            for (const c of d.commands) (byMod[c.module] ||= []).push(c);
            docBody.innerHTML = d.modules
                .filter((m) => byMod[m.id]?.length)
                .map((m) => `
                    <section class="doc-cat" data-mod="${esc(m.id)}">
                        <h2>${esc(m.label)} <span class="count">${byMod[m.id].length}</span></h2>
                        <p>${esc(m.description)}</p>
                        <div class="cmd-grid">${byMod[m.id].map((c) => `
                            <div class="card cmd" data-q="${esc((c.name + ' ' + c.description + ' ' + m.label).toLowerCase())}">
                                <code>${esc(d.prefix || '!')}${esc(c.name)}</code>
                                <p>${esc(c.description)}</p>
                            </div>`).join('')}
                        </div>
                    </section>`).join('');

            $('#doc-q').addEventListener('input', (e) => {
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
                $('#doc-empty').style.display = visible ? 'none' : 'block';
            });
        });
    }

    // --- login page ---
    if ($('#login-btn')) {
        const next = new URLSearchParams(location.search).get('next');
        if (next && next.startsWith('/')) $('#login-btn').href = `/auth/discord?next=${encodeURIComponent(next)}`;
        if (new URLSearchParams(location.search).get('error')) $('#err').style.display = 'block';
    }
})();
