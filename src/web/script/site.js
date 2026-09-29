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
            // logged out: drop the Dashboard link; CTAs become "Log in"
            $('[data-nav="dash"]')?.remove();
            const LOGIN_IC = '<svg class="cta-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>';
            $$('.js-cta').forEach((b) => {
                b.href = '/login';
                if (b.classList.contains('nav-cta')) {
                    b.innerHTML = LOGIN_IC;
                    b.setAttribute('aria-label', 'Log in');
                    b.title = 'Log in';
                } else {
                    b.textContent = 'Log in';
                }
            });
        }
    });

    // --- homepage stats (sessionStorage cache — refresh spam / API limits
    //     never blank the numbers, and they paint before the fetch lands) ---
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

    // --- docs ---
    const docBody = $('#doc-body');
    if (docBody) {
        api('/api/commands').then((d) => {
            if (!d) { docBody.innerHTML = '<p class="muted">Could not load commands.</p>'; return; }
            const prefix = d.prefix || '!';
            $('#prefix').textContent = prefix;
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
                        <div class="card cmd" title="Click to copy" data-q="${esc((c.name + ' ' + c.description + ' ' + m.label + ' ' + (c.aliases || []).join(' ')).toLowerCase())}">
                            <code class="usage">${esc(prefix)}${esc(c.name)}${c.usage ? ` <span class="u">${esc(c.usage)}</span>` : ''}</code>
                            <p>${esc(c.description)}</p>
                            ${meta(c)}
                            <span class="copied">copied</span>
                        </div>`).join('')}
                    </div>
                </section>`).join('');

            // sidebar toc + scrollspy
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

            reveal(docBody); // scroll-reveal the freshly rendered doc cards

            // click a command card to copy the invocation
            docBody.addEventListener('click', (e) => {
                const card = e.target.closest('.cmd');
                if (!card) return;
                const cmd = card.querySelector('.usage').childNodes[0].textContent.trim();
                navigator.clipboard?.writeText(cmd).catch(() => {});
                card.classList.add('copied');
                setTimeout(() => card.classList.remove('copied'), 1200);
            });

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
                toc && (toc.parentElement.style.display = q ? 'none' : '');
            });

            // "/" focuses search like real docs
            document.addEventListener('keydown', (e) => {
                if (e.key === '/' && !/^(input|textarea|select)$/i.test(document.activeElement?.tagName)) {
                    e.preventDefault();
                    $('#doc-q').focus();
                }
            });
        });
    }

    // --- scroll reveal: elements blur+rise in as they enter the viewport ---
    const REDUCED = theme.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!REDUCED && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => {
            ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
        }, { threshold: 0.12, rootMargin: '0px 0px -6%' });
        const RV_SEL = '.hero-img, .hero-copy > h1, .hero-copy > p, .hero-actions, .bstat, .features > h2, .features > p, .feature, .doc-cat h2, .cmd, .foot, .upt-card, .card.sect';
        window.reveal = (scope = document) => {
            $$(RV_SEL, scope).forEach((el) => {
                if (el.classList.contains('rv')) return;
                el.classList.add('rv');
                // stagger among siblings — siblings appearing later start later
                el.style.setProperty('--rvd', `${Math.min([...el.parentElement.children].indexOf(el) * 70, 420)}ms`);
                io.observe(el);
            });
        };
        reveal();
    } else {
        window.reveal = () => {};
    }

    // --- login page ---
    if ($('#login-btn')) {
        const next = new URLSearchParams(location.search).get('next');
        if (next && next.startsWith('/')) $('#login-btn').href = `/auth/discord?next=${encodeURIComponent(next)}`;
        if (new URLSearchParams(location.search).get('error')) $('#err').style.display = 'block';
    }
})();
