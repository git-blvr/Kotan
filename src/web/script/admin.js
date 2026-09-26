/* Developer-only guild blacklist admin — /dashboard/admin/blacklist. */

(function () {
    'use strict';
    const $ = (s, el = document) => el.querySelector(s);
    const $$ = (s, el = document) => [...el.querySelectorAll(s)];
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const app = $('#app');

    const api = (path, opts) => fetch(path, opts && {
        method: opts.method || 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }).then((r) => r.json()).catch(() => ({ ok: false }));

    function toast(msg, kind = 'ok') {
        const t = document.createElement('div');
        t.className = `toast ${kind}`; t.textContent = msg;
        $('#toasts').appendChild(t); setTimeout(() => t.remove(), 3200);
    }

    function confirmModal(title, body) {
        return new Promise((resolve) => {
            const ov = document.createElement('div');
            ov.className = 'overlay';
            ov.innerHTML = `<div class="modal"><h3>${esc(title)}</h3><p>${esc(body)}</p>
                <div class="actions"><button class="btn" data-x>Cancel</button><button class="btn danger" data-ok>Confirm</button></div></div>`;
            ov.onclick = (e) => {
                if (e.target === ov || e.target.hasAttribute('data-x')) { ov.remove(); resolve(false); }
                if (e.target.hasAttribute('data-ok')) { ov.remove(); resolve(true); }
            };
            document.body.appendChild(ov);
        });
    }

    app.className = 'dmain';
    app.innerHTML = `<div class="dcontent plain" style="margin:var(--s6) auto">
        <div class="flex"><div><div class="page-title">Guild blacklist</div>
        <p class="page-desc">Developer-only. Blacklisted guilds lose bot responses and dashboard access; the bot leaves on next join.</p></div>
        <a class="btn ghost sm right" href="/dashboard">← Back</a></div>
        <div class="card"><h3>Blacklist a guild</h3>
            <div class="grid2">
                <label class="fld"><span>Guild ID</span><input type="text" id="bl-id" placeholder="17–20 digit ID"></label>
                <label class="fld"><span>Reason</span><input type="text" id="bl-reason" placeholder="Why is this guild restricted?"></label>
            </div>
            <button class="btn danger sm" id="bl-add">Blacklist guild</button></div>
        <div class="card"><h3>Entries</h3><div id="bl-list"><div class="skeleton" style="height:60px"></div></div></div>
    </div>`;

    async function load() {
        const d = await api('/api/admin/blacklist');
        const list = $('#bl-list');
        if (d.ok === false) { list.innerHTML = `<p class="muted">${esc(d.error || 'Failed to load')}</p>`; return; }
        const entries = d.entries || [];
        list.innerHTML = entries.length ? `<table class="tbl"><thead><tr><th>Guild ID</th><th>Reason</th><th>By</th><th>At</th><th></th></tr></thead><tbody>
            ${entries.map((e) => `<tr><td class="mono">${esc(e.guild_id)}</td><td>${esc(e.reason)}</td><td class="mono">${esc(e.blacklisted_by)}</td>
            <td class="muted">${new Date(e.blacklisted_at).toLocaleString()}</td>
            <td><button class="btn sm danger" data-rm="${esc(e.guild_id)}">Remove</button></td></tr>`).join('')}
            </tbody></table>` : '<p class="muted small">No blacklisted guilds.</p>';
        $$('#bl-list [data-rm]').forEach((b) => (b.onclick = async () => {
            if (!(await confirmModal('Remove blacklist entry', `Restore access for guild ${b.dataset.rm}?`))) return;
            const r = await api(`/api/admin/blacklist/${b.dataset.rm}`, { method: 'DELETE' });
            r.ok ? (toast('Entry removed'), load()) : toast('Failed', 'err');
        }));
    }

    $('#bl-add').onclick = async () => {
        const guildId = $('#bl-id').value.trim();
        const reason = $('#bl-reason').value.trim();
        const r = await api('/api/admin/blacklist', { body: { guildId, reason } });
        if (r.ok) { toast('Guild blacklisted'); $('#bl-id').value = ''; $('#bl-reason').value = ''; load(); }
        else toast(r.error || 'Failed', 'err');
    };

    load();
})();
