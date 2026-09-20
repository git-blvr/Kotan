const { layout, esc, BG } = require('./layout');

// Homepage: hero + live bot stats + feature cards.

function renderHome({ user, stats, commands, avatarUrl, inviteUrl }) {
    const hero = `
    <section style="text-align:center;padding:70px 20px 60px;border-radius:16px;
        background:${BG ? `linear-gradient(rgba(13,17,23,.82),rgba(13,17,23,.92)),url('${esc(BG)}') center/cover` : 'var(--panel)'}">
        ${avatarUrl ? `<img src="${esc(avatarUrl)}" width="96" height="96" style="border-radius:50%" alt="Kotan">` : ''}
        <h1 style="margin-top:14px">Kotan</h1>
        <p class="muted" style="max-width:520px;margin:8px auto 26px">
            Prefix commands with aliases and word triggers, a full moderation suite,
            an economy system and a web dashboard — built to scale with clusters.
        </p>
        <a class="btn" href="${esc(inviteUrl)}">Invite Kotan</a>
        <a class="btn ghost" href="/doc" style="margin-left:10px">Documentation</a>
    </section>

    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-top:26px">
        ${[['Servers', stats.guilds], ['Users', stats.users], ['Commands', commands]]
            .map(
                ([k, v]) =>
                    `<div class="card" style="text-align:center">
                        <div style="font-size:28px;font-weight:700">${v}</div>
                        <div class="muted">${k}</div></div>`
            )
            .join('')}
    </section>

    <section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:26px">
        ${[
            ['Prefix, aliases & triggers', 'Run commands with .ping, an alias, or a plain word like "net".'],
            ['Moderation toolkit', 'Warns, timeouts, bans and tempbans with automatic unban.'],
            ['Economy & games', 'Daily rewards with streaks, payments, a shop and coinflip.'],
            ['Hybrid sharding', 'Clustered processes share shards — ready for public scale.'],
            ['Web dashboard', 'Per-guild settings behind Discord login.'],
            ['Dominant color embeds', 'Embeds and CV2 containers tinted to match images.'],
        ]
            .map(([t, d]) => `<div class="card"><strong>${t}</strong><p class="muted" style="margin-top:6px">${d}</p></div>`)
            .join('')}
    </section>`;

    return layout({ title: 'Home', user, active: 'home', content: hero });
}

module.exports = { renderHome };
