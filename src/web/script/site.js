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

    // --- stage slider (index): page never scrolls; wheel/keys swap .fpsec screens ---
    const fp = $('.fp');
    const SLD = !!fp && matchMedia('(min-width: 901px)').matches;

    // --- scroll reveal: elements blur+rise in as they enter the viewport ---
    const REDUCED = theme.motion === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (SLD && !REDUCED) {
        // slider mode: tag items .sdi — they cascade in when their .fpsec gets .on
        const RV_SEL = '.hero-img, .hero-copy > h1, .hero-copy > p, .hero-actions, .bstat, .features > h2, .features > p, .feature';
        window.reveal = (scope = document) => {
            $$(RV_SEL, scope).forEach((el) => {
                if (el.classList.contains('sdi')) return;
                el.classList.add('sdi');
                el.style.setProperty('--rvd', `${Math.min([...el.parentElement.children].indexOf(el) * 80, 480)}ms`);
            });
        };
        reveal();
    } else if (!REDUCED && 'IntersectionObserver' in window) {
        const io = new IntersectionObserver((ents) => {
            ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
        }, { threshold: 0.12, rootMargin: '0px 0px -6%' });
        const RV_SEL = '.hero-img, .hero-copy > h1, .hero-copy > p, .hero-actions, .bstat, .features > h2, .features > p, .feature, .doc-cat h2, .cmd, .foot, .upt-card, .card.sect';
        const EXIT_SEL = '.hero-img img, .hero-copy'; // parallax-exit targets (no entrance tag — avoids transform conflicts)
        const SDA = typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline: view()');
        window.reveal = (scope = document) => {
            $$(RV_SEL, scope).forEach((el) => {
                if (el.classList.contains('rv') || el.classList.contains('sda')) return;
                // stagger among siblings — siblings appearing later start later
                el.style.setProperty('--rvd', `${Math.min([...el.parentElement.children].indexOf(el) * 70, 420)}ms`);
                if (SDA) { el.classList.add('sda'); return; }
                el.classList.add('rv');
                io.observe(el);
            });
            if (SDA) $$(EXIT_SEL, scope).forEach((el) => el.classList.add('sda-x'));
        };
        reveal();
    } else {
        window.reveal = () => {};
    }

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


    // --- page sweep: blur-veil transition into the next page of the chain ---
    const PAGE_CHAIN = { '/': '/doc', '/doc': '/uptime', '/uptime': '/dashboard' };
    const sweep = (url) => {
        if (!url || $('.sweep')) return;
        const v = document.createElement('div');
        v.className = 'sweep';
        document.body.appendChild(v);
        requestAnimationFrame(() => v.classList.add('go'));
        setTimeout(() => { location.href = url; }, REDUCED ? 80 : 520);
    };

    // --- stage machine: wheel/keys cross-fade sections; the page itself never moves ---
    if (SLD) {
        const secs = $$('.fpsec', fp);
        // safety: only hijack if the slider CSS actually loaded (fp is overflow:hidden)
        const armed = () => getComputedStyle(fp).overflow === 'hidden' || getComputedStyle(fp).overflowY === 'hidden';
        let idx = Math.max(0, secs.findIndex((s) => s.classList.contains('on')));
        let busy = false;
        const show = (i) => {
            i = Math.max(0, Math.min(secs.length - 1, i));
            if (i === idx) return;
            idx = i;
            busy = true;
            secs.forEach((s, j) => s.classList.toggle('on', j === idx));
            setTimeout(() => { busy = false; }, REDUCED ? 60 : 950);
        };
        fp.addEventListener('wheel', (e) => {
            if (!armed() || busy || Math.abs(e.deltaY) < 8) return;
            e.preventDefault();
            if (e.deltaY > 0 && idx === secs.length - 1) { sweep(PAGE_CHAIN[location.pathname]); return; }
            show(idx + (e.deltaY > 0 ? 1 : -1));
        }, { passive: false });
        let ty = null, tscroll = 0;
        fp.addEventListener('touchstart', (e) => {
            ty = e.touches[0].clientY;
            tscroll = secs[idx]?.scrollTop ?? 0; // remember inner scroll so section panning doesn't flip slides
        }, { passive: true });
        fp.addEventListener('touchend', (e) => {
            if (ty == null || busy || !armed()) return;
            const d = ty - e.changedTouches[0].clientY;
            const innerScrolled = Math.abs((secs[idx]?.scrollTop ?? 0) - tscroll) > 4;
            if (Math.abs(d) > 48 && !innerScrolled) show(idx + (d > 0 ? 1 : -1));
            ty = null;
        }, { passive: true });
        window.addEventListener('keydown', (e) => {
            if (busy || /input|textarea|select/i.test(e.target.tagName)) return;
            if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); show(idx + 1); }
            else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); show(idx - 1); }
            else if (e.key === 'Home') { e.preventDefault(); show(0); }
            else if (e.key === 'End') { e.preventDefault(); show(secs.length - 1); }
        });
    }

    // --- page-chain overscroll: wheeling past the bottom sweeps to the next page ---
    const NEXT_PAGE = PAGE_CHAIN[location.pathname];
    if (NEXT_PAGE && !SLD && !REDUCED) {
        let acc = 0, decay;
        window.addEventListener('wheel', (e) => {
            if (e.deltaY <= 0) { acc = 0; return; }
            // short pages are permanently "at the bottom" — never sweep on those,
            // otherwise the page bounces you home the moment you touch the wheel
            const doc = document.documentElement;
            if (doc.scrollHeight - innerHeight < 120) { acc = 0; return; }
            const bottom = innerHeight + scrollY >= doc.scrollHeight - 4;
            if (!bottom) { acc = 0; return; }
            acc += e.deltaY;
            clearTimeout(decay);
            decay = setTimeout(() => { acc = 0; }, 450);
            if (acc > 420) { acc = -1e9; sweep(NEXT_PAGE); }
        }, { passive: true });
    }

    // --- horizontal swipe: drag the screen left/right to turn pages ---
    const PAGE_ORDER = ['/', '/doc', '/uptime', '/dashboard'];
    const pi = PAGE_ORDER.indexOf(location.pathname);
    if (pi !== -1 && !REDUCED) {
        const dragEl = fp || document.body;
        const pageTurn = (dir) => { const t = PAGE_ORDER[pi + dir]; if (t) sweep(t); };
        let pd = null;
        const resetDrag = () => {
            if (!pd) return;
            dragEl.style.transition = '';
            dragEl.style.transform = '';
            dragEl.style.filter = '';
            pd = null;
        };
        window.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (e.target.closest('a, button, input, textarea, select, [role="button"], nav')) return;
            pd = { x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, lock: false };
        });
        window.addEventListener('pointermove', (e) => {
            if (!pd || e.pointerId !== pd.id) return;
            const dx = e.clientX - pd.x, dy = e.clientY - pd.y;
            if (!pd.lock && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.35) pd.lock = true;
            if (!pd.lock) return;
            pd.dx = dx;
            dragEl.style.transition = 'none';
            dragEl.style.transform = `translateX(${dx * 0.9}px)`;
            dragEl.style.filter = `blur(${Math.min(Math.abs(dx) / 60, 6)}px)`;
        });
        window.addEventListener('pointerup', (e) => {
            if (!pd || e.pointerId !== pd.id) return;
            const dx = pd.lock ? pd.dx : 0;
            resetDrag();
            if (dx < -90) pageTurn(1);
            else if (dx > 90) pageTurn(-1);
        });
        window.addEventListener('pointercancel', resetDrag);
    }

    // --- login page ---
    if ($('#login-btn')) {
        const next = new URLSearchParams(location.search).get('next');
        if (next && next.startsWith('/')) $('#login-btn').href = `/auth/discord?next=${encodeURIComponent(next)}`;
        if (new URLSearchParams(location.search).get('error')) $('#err').style.display = 'block';
    }
})();
