const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { cv2, base, sendError } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { resolveMember } = require('../../helpers/resolve');
const { timestamp } = require('../../helpers/format');
const { dominantColor } = require('../../utils/dominantColor');
const E = require('../../utils/emojis');
const db = require('../../utils/database');
const fm = require('../../utils/lastfm');

// Last.fm stats, fmbot-style. `.fm` shows now playing, `.fm set` links a
// Last.fm username to your Discord account (global), and charts/profile/
// whoknows ride on top of it. All data comes from utils/lastfm.js.

const RED = 0xd51007; // last.fm red

const HELP = [
    '**Last.fm** — link your account once, then `.fm` shows your music.',
    '```',
    'fm                    — now playing / last track',
    'fm @user              — their now playing',
    'fm set <username>     — link your last.fm account',
    'fm unset              — unlink',
    'fm recent [@user]     — last 10 tracks',
    'fm top <artists|tracks|albums> [period]',
    '                      — periods: week month 3m 6m year all (default: week)',
    'fm stats [@user]      — scrobbles per period',
    'fm profile [@user]    — account overview',
    'fm artist <name>      — artist info',
    'fm album <a> - <b>    — album info ("Artist - Album")',
    'fm track <a> - <t>    — track info ("Artist - Track")',
    'fm plays [artist]     — your playcount (default: np artist)',
    'fm cover [a - b]      — album artwork (default: np album)',
    'fm taste @user        — artists you both listen to',
    'fm whoknows <artist>  — server leaderboard   (.w  <artist>)',
    'fm wkt <a> - <t>      — whoknows for a track (.wkt)',
    'fm wka <a> - <b>      — whoknows for an album (.wka)',
    '```',
].join('\n');

const errMsg = (ctx, err, name) =>
    err === 'off'
        ? sendError(ctx, 'Last.fm isn\'t configured — the bot owner needs to set `LASTFM_API_KEY` in .env.')
        : err === 'notfound'
          ? sendError(ctx, `Last.fm doesn't know **${name}** — check the spelling.`)
          : sendError(ctx, err);

// Accent color from the entity's artwork — falls back to last.fm red when
// there's no image or it can't be read.
async function accentOf(entity) {
    const src = fm.img(entity);
    if (!src) return RED;
    return (await dominantColor(src)) ?? RED;
}

// "Artist - Title" → { artist, name }; returns null when there's no
// separator so callers can hint the format.
const parsePair = (q) => {
    const m = String(q || '').match(/^(.+?)\s+-\s+(.+)$/);
    return m ? { artist: m[1].trim(), name: m[2].trim() } : null;
};

// Resolves the last.fm username for a Discord user — linked account or an
// inline `lfm:<name>` override. Returns { name } or { err }.
async function linkFor(ctx, user) {
    const name = await db.getLastfm(user.id).catch(() => null);
    if (!name)
        return {
            err:
                user.id === ctx.user.id
                    ? `Link your account first — \`${ctx.prefix}fm set <last.fm username>\`.`
                    : `**${user.username}** hasn't linked a last.fm account.`,
        };
    return { name };
}

// ---------- renderers (shared by prefix + slash) ----------

async function nowPlaying(ctx, user) {
    const { name, err } = await linkFor(ctx, user);
    if (err) return sendError(ctx, err);

    const [recent, info] = await Promise.all([
        fm.call('user.getRecentTracks', { user: name, limit: 2 }),
        fm.call('user.getInfo', { user: name }),
    ]);
    const apiErr = recent.err || info.err;
    if (apiErr) return errMsg(ctx, apiErr, name);

    const t = recent.recenttracks?.track?.[0];
    if (!t) return sendError(ctx, `**${name}** hasn't scrobbled anything yet.`);

    const playing = t['@attr']?.nowplaying === 'true' || t['@attr']?.nowplaying === true;
    const artist = t.artist['#text'];
    const album = t.album?.['#text'];
    // Extra call: the user's own playcount for this track.
    const ti = await fm.call('track.getInfo', { user: name, track: t.name, artist });
    const plays = ti.track?.userplaycount ? `${fm.num(ti.track.userplaycount)} plays` : null;

    const c = base({
        color: await accentOf(t),
        author: `${playing ? 'Now playing' : 'Last track'} — ${user.username}`,
        title: t.name,
        url: t.url,
        description: `**${artist}**${album ? ` — *${album}*` : ''}`,
        thumbnail: fm.img(t),
        fields: [
            ...(plays ? [{ name: 'Your plays', value: plays, inline: true }] : []),
            ...(t.loved === '1' ? [{ name: 'Loved', value: E.heart || 'yes', inline: true }] : []),
            ...(info.user?.playcount
                ? [{ name: 'Total scrobbles', value: fm.num(info.user.playcount), inline: true }]
                : []),
        ],
        footer: `last.fm/user/${name}`,
    });
    return ctx.reply(cv2(c));
}

async function recentTracks(ctx, user, count = 10) {
    const { name, err } = await linkFor(ctx, user);
    if (err) return sendError(ctx, err);

    const data = await fm.call('user.getRecentTracks', { user: name, limit: Math.min(Math.max(count, 1), 25) });
    if (data.err) return errMsg(ctx, data.err, name);

    const tracks = data.recenttracks?.track || [];
    if (!tracks.length) return sendError(ctx, `**${name}** hasn't scrobbled anything yet.`);

    const lines = tracks.map((t, i) => {
        const np = t['@attr']?.nowplaying === 'true' || t['@attr']?.nowplaying === true;
        const when = np ? 'now' : t.date?.uts ? timestamp(t.date.uts * 1000) : '';
        return `**${i + 1}.** [${t.name}](${t.url}) — ${t.artist['#text']}${when ? ` · ${when}` : ''}`;
    });
    return ctx.reply(
        cv2(base({ color: RED, author: `Recent tracks — ${user.username}`, description: lines.join('\n'), footer: `last.fm/user/${name}` }))
    );
}

async function top(ctx, user, type, periodKey = 'week') {
    const { name, err } = await linkFor(ctx, user);
    if (err) return sendError(ctx, err);

    const method = { artists: 'user.getTopArtists', tracks: 'user.getTopTracks', albums: 'user.getTopAlbums' }[type];
    const period = fm.PERIODS[periodKey] || '7day';
    const data = await fm.call(method, { user: name, period, limit: 10 });
    if (data.err) return errMsg(ctx, data.err, name);

    const key = { artists: 'topartists', tracks: 'toptracks', albums: 'topalbums' }[type];
    const itemKey = { artists: 'artist', tracks: 'track', albums: 'album' }[type];
    const items = data[key]?.[itemKey] || [];
    if (!items.length) return sendError(ctx, `No ${type} data for **${name}** in that period.`);

    const lines = items.map((x, i) => `**${i + 1}.** [${x.name}](${x.url}) — ${fm.num(x.playcount)} plays`);
    return ctx.reply(
        cv2(
            base({
                color: RED,
                author: `Top ${type} — ${user.username}`,
                description: lines.join('\n'),
                footer: `${fm.PERIOD_LABEL[period]} · last.fm/user/${name}`,
            })
        )
    );
}

async function profile(ctx, user) {
    const { name, err } = await linkFor(ctx, user);
    if (err) return sendError(ctx, err);

    const data = await fm.call('user.getInfo', { user: name });
    if (data.err) return errMsg(ctx, data.err, name);
    const u = data.user;
    if (!u) return errMsg(ctx, 'notfound', name);

    return ctx.reply(
        cv2(
            base({
                color: RED,
                author: `${user.username} on last.fm`,
                title: u.realname || u.name,
                url: u.url,
                thumbnail: fm.img(u),
                fields: [
                    { name: 'Scrobbles', value: fm.num(u.playcount), inline: true },
                    { name: 'Artists', value: fm.num(u.artist_count), inline: true },
                    { name: 'Albums', value: fm.num(u.album_count), inline: true },
                    { name: 'Tracks', value: fm.num(u.track_count), inline: true },
                    ...(u.registered?.unixtime
                        ? [{ name: 'Listening since', value: timestamp(u.registered.unixtime * 1000, 'D'), inline: true }]
                        : []),
                    ...(u.country ? [{ name: 'Country', value: u.country, inline: true }] : []),
                ],
                footer: `last.fm/user/${name}`,
            })
        )
    );
}

// Per-entity scrobble totals per period — user.getRecentTracks' @attr.total
// is the count inside a `from` window, so six cheap limit=1 calls build the
// whole stats card.
async function stats(ctx, user) {
    const { name, err } = await linkFor(ctx, user);
    if (err) return sendError(ctx, err);

    const now = Math.floor(Date.now() / 1000);
    const RANGES = [
        ['7 days', 604_800], ['month', 2_592_000], ['3 months', 7_948_800],
        ['6 months', 15_724_800], ['year', 31_536_000],
    ];
    const [info, ...rows] = await Promise.all([
        fm.call('user.getInfo', { user: name }),
        ...RANGES.map(([, s]) => fm.call('user.getRecentTracks', { user: name, limit: 1, from: now - s })),
    ]);
    const apiErr = info.err || rows.find((r) => r.err)?.err;
    if (apiErr) return errMsg(ctx, apiErr, name);

    const fields = RANGES.map(([label], i) => ({
        name: label,
        value: fm.num(rows[i].recenttracks?.['@attr']?.total || 0),
        inline: true,
    }));
    if (info.user?.playcount) fields.push({ name: 'all time', value: fm.num(info.user.playcount), inline: true });
    return ctx.reply(
        cv2(base({ color: await accentOf(info.user), author: `Listening stats — ${user.username}`, thumbnail: fm.img(info.user), fields, footer: `last.fm/user/${name}` }))
    );
}

// Entity info cards — artist.getInfo / album.getInfo / track.getInfo share
// the same shape: global stats + the caller's own plays when linked.
async function artistInfo(ctx, query) {
    if (!query) return sendError(ctx, `Give me an artist — e.g. \`${ctx.prefix}fm artist radiohead\`.`);
    const name = await db.getLastfm(ctx.user.id).catch(() => null); // optional — only adds "your plays"
    const d = await fm.call('artist.getInfo', { artist: query, username: name || undefined });
    if (d.err) return errMsg(ctx, d.err, query);
    const a = d.artist;
    const tags = (a.tags?.tag || []).slice(0, 5).map((t) => t.name).join(' · ');
    const similar = (a.similar?.artist || []).slice(0, 4).map((x) => `[${x.name}](${x.url})`).join('  ·  ');
    return ctx.reply(
        cv2(
            base({
                color: await accentOf(a),
                title: a.name, url: a.url, thumbnail: fm.img(a),
                fields: [
                    { name: 'Listeners', value: fm.num(a.stats?.listeners), inline: true },
                    { name: 'Global plays', value: fm.num(a.stats?.playcount), inline: true },
                    ...(a.stats?.userplaycount ? [{ name: 'Your plays', value: fm.num(a.stats.userplaycount), inline: true }] : []),
                    ...(tags ? [{ name: 'Tags', value: tags }] : []),
                    ...(similar ? [{ name: 'Similar', value: similar }] : []),
                ],
                footer: 'last.fm artist info',
            })
        )
    );
}

async function albumInfo(ctx, query) {
    const p = parsePair(query);
    if (!p) return sendError(ctx, `Use \`Artist - Album\` — e.g. \`${ctx.prefix}fm album radiohead - ok computer\`.`);
    const name = await db.getLastfm(ctx.user.id).catch(() => null);
    const d = await fm.call('album.getInfo', { artist: p.artist, album: p.name, username: name || undefined });
    if (d.err) return errMsg(ctx, d.err, `${p.artist} - ${p.name}`);
    const a = d.album;
    const tracks = (Array.isArray(a.tracks?.track) ? a.tracks.track : a.tracks?.track ? [a.tracks.track] : [])
        .slice(0, 8)
        .map((t, i) => `**${i + 1}.** [${t.name}](${t.url})`);
    return ctx.reply(
        cv2(
            base({
                color: await accentOf(a),
                title: a.name, url: a.url, thumbnail: fm.img(a),
                description: `by **${a.artist}**`,
                fields: [
                    { name: 'Listeners', value: fm.num(a.listeners), inline: true },
                    { name: 'Global plays', value: fm.num(a.playcount), inline: true },
                    ...(a.userplaycount ? [{ name: 'Your plays', value: fm.num(a.userplaycount), inline: true }] : []),
                    ...(tracks.length ? [{ name: 'Tracks', value: tracks.join('\n') }] : []),
                ],
                footer: 'last.fm album info',
            })
        )
    );
}

async function trackInfo(ctx, query) {
    const p = parsePair(query);
    if (!p) return sendError(ctx, `Use \`Artist - Track\` — e.g. \`${ctx.prefix}fm track radiohead - creep\`.`);
    const name = await db.getLastfm(ctx.user.id).catch(() => null);
    const d = await fm.call('track.getInfo', { artist: p.artist, track: p.name, username: name || undefined });
    if (d.err) return errMsg(ctx, d.err, `${p.artist} - ${p.name}`);
    const t = d.track;
    const album = t.album?.title;
    const dur = t.duration ? `${Math.floor(t.duration / 60000)}:${String(Math.floor((t.duration % 60000) / 1000)).padStart(2, '0')}` : null;
    return ctx.reply(
        cv2(
            base({
                color: await accentOf(t.album || t),
                title: t.name, url: t.url, thumbnail: fm.img(t.album),
                description: `**${t.artist?.name}**${album ? ` — *${album}*` : ''}`,
                fields: [
                    { name: 'Listeners', value: fm.num(t.listeners), inline: true },
                    { name: 'Global plays', value: fm.num(t.playcount), inline: true },
                    ...(t.userplaycount ? [{ name: 'Your plays', value: fm.num(t.userplaycount), inline: true }] : []),
                    ...(dur ? [{ name: 'Length', value: dur, inline: true }] : []),
                    ...(t.loved === '1' ? [{ name: 'Loved', value: E.heart || 'yes', inline: true }] : []),
                ],
                footer: 'last.fm track info',
            })
        )
    );
}

// `.fm plays [artist]` — your playcount for an artist; defaults to the
// artist of your current/last track.
async function plays(ctx, user, query) {
    const { name, err } = await linkFor(ctx, user);
    if (err) return sendError(ctx, err);

    let artist = query;
    if (!artist) {
        const r = await fm.call('user.getRecentTracks', { user: name, limit: 1 });
        if (r.err) return errMsg(ctx, r.err, name);
        artist = r.recenttracks?.track?.[0]?.artist?.['#text'];
        if (!artist) return sendError(ctx, `**${name}** hasn't scrobbled anything yet.`);
    }
    const d = await fm.call('artist.getInfo', { artist, username: name });
    if (d.err) return errMsg(ctx, d.err, artist);
    return ctx.reply(
        cv2(
            base({
                color: await accentOf(d.artist),
                description: `**${user.username}** has **${fm.num(d.artist?.stats?.userplaycount)}** plays for [${d.artist.name}](${d.artist.url})`,
                thumbnail: fm.img(d.artist),
            })
        )
    );
}

// `.fm cover [artist - album]` — posts the artwork full-size.
async function cover(ctx, user, query) {
    const { name, err } = await linkFor(ctx, user);
    if (err) return sendError(ctx, err);

    let p = parsePair(query);
    if (!p) {
        const r = await fm.call('user.getRecentTracks', { user: name, limit: 1 });
        const t = r.recenttracks?.track?.[0];
        if (!t?.album?.['#text']) return sendError(ctx, 'No album to show — play something or give me `Artist - Album`.');
        p = { artist: t.artist['#text'], name: t.album['#text'] };
    }
    const d = await fm.call('album.getInfo', { artist: p.artist, album: p.name });
    if (d.err) return errMsg(ctx, d.err, `${p.artist} - ${p.name}`);
    const art = fm.img(d.album, 'mega') || fm.img(d.album);
    if (!art) return sendError(ctx, `No artwork for **${d.album.name}**.`);
    return ctx.reply(
        cv2(
            base({
                color: await accentOf(d.album),
                title: `${d.album.name}`, url: d.album.url,
                description: `by **${d.album.artist}**`,
                image: art,
            })
        )
    );
}

// Taste — overlap between two users' all-time top-50 artists.
async function taste(ctx, user, other) {
    const [a, b] = await Promise.all([linkFor(ctx, user), linkFor(ctx, other)]);
    if (a.err) return sendError(ctx, a.err);
    if (b.err) return sendError(ctx, b.err);

    const [ta, tb] = await Promise.all([
        fm.call('user.getTopArtists', { user: a.name, period: 'overall', limit: 50 }),
        fm.call('user.getTopArtists', { user: b.name, period: 'overall', limit: 50 }),
    ]);
    const apiErr = ta.err || tb.err;
    if (apiErr) return errMsg(ctx, apiErr, a.name);

    const mine = new Map((ta.topartists?.artist || []).map((x) => [x.name.toLowerCase(), x]));
    const shared = (tb.topartists?.artist || []).filter((x) => mine.has(x.name.toLowerCase()));
    const pct = Math.round((shared.length / Math.max((tb.topartists?.artist || []).length, 1)) * 100);
    const lines = shared.slice(0, 10).map((x, i) => `**${i + 1}.** [${x.name}](${x.url}) — ${fm.num(x.playcount)} / ${fm.num(mine.get(x.name.toLowerCase())?.playcount)} plays`);

    return ctx.reply(
        cv2(
            base({
                color: RED,
                author: `Taste — ${user.username} × ${other.username}`,
                description: shared.length
                    ? `**~${pct}% match** — ${shared.length} shared top artists\n\n${lines.join('\n')}`
                    : `No artists in common — you two live in different musical universes.`,
                footer: 'all-time top 50 artists compared',
            })
        )
    );
}

// Guild leaderboard for an entity — intersects linked accounts with
// members, then reads each member's userplaycount on that artist/track/album.
const WK_KINDS = {
    artist: {
        method: 'artist.getInfo',
        params: (p) => ({ artist: p.name }),
        plays: (d) => d.artist?.stats?.userplaycount,
        entity: (d) => d.artist,
        hint: (ctx) => `\`${ctx.prefix}fm whoknows radiohead\``,
    },
    track: {
        method: 'track.getInfo',
        params: (p) => ({ artist: p.artist, track: p.name }),
        plays: (d) => d.track?.userplaycount,
        entity: (d) => d.track,
        hint: (ctx) => `\`${ctx.prefix}fm wkt radiohead - creep\``,
    },
    album: {
        method: 'album.getInfo',
        params: (p) => ({ artist: p.artist, album: p.name }),
        plays: (d) => d.album?.userplaycount,
        entity: (d) => d.album,
        hint: (ctx) => `\`${ctx.prefix}fm wka radiohead - ok computer\``,
    },
};

async function whoKnows(ctx, kind, parsed) {
    const cfg = WK_KINDS[kind];
    const label = kind === 'artist' ? parsed.name : `${parsed.artist} - ${parsed.name}`;
    if (!parsed.name) return sendError(ctx, `Give me something — e.g. ${cfg.hint(ctx)}.`);

    const linked = [];
    for await (const [uid, name] of db.iterateLastfm()) {
        if (linked.length >= 150) break;
        linked.push([uid, name]);
    }
    if (!linked.length) return sendError(ctx, 'Nobody here has linked a last.fm account yet.');

    // One chunked member fetch covers every linked id — no per-user spam.
    const fetched = await ctx.guild.members.fetch({ user: linked.map(([id]) => id) }).catch(() => null);
    const inGuild = linked.filter(([id]) => ctx.guild.members.cache.has(id) || fetched?.has(id));
    if (!inGuild.length)
        return ctx.reply(cv2(base({ color: RED, description: `Nobody in this server has linked last.fm — try \`${ctx.prefix}fm set\`.` })));

    const rows = await Promise.all(
        inGuild.slice(0, 30).map(async ([uid, name]) => {
            const d = await fm.call(cfg.method, { ...cfg.params(parsed), username: name });
            const plays = Number(cfg.plays(d) || 0);
            return { uid, plays, entity: cfg.entity(d) };
        })
    );
    const meta = rows.find((r) => r.entity)?.entity; // canonical name/url/image
    const canonArtist = typeof meta?.artist === 'string' ? meta.artist : meta?.artist?.name || parsed.artist;
    const title = kind === 'artist' ? meta?.name || parsed.name : `${canonArtist} - ${meta?.name || parsed.name}`;
    const ranked = rows.filter((r) => r.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 10);
    if (!ranked.length)
        return ctx.reply(cv2(base({ color: RED, description: `Nobody here scrobbles **${title}** — their loss.` })));

    return ctx.reply(
        cv2(
            base({
                color: await accentOf(meta),
                author: `Who knows — ${kind}`,
                title, url: meta?.url,
                thumbnail: fm.img(meta),
                description: ranked.map((r, i) => `**${i + 1}.** <@${r.uid}> — ${fm.num(r.plays)} plays`).join('\n'),
                footer: 'last.fm user playcounts · linked members only',
            })
        )
    );
}

// ---------- entry points ----------

const TOP_TYPES = { artist: 'artists', artists: 'artists', a: 'artists', track: 'tracks', tracks: 'tracks', t: 'tracks', album: 'albums', albums: 'albums', al: 'albums' };

async function execute(message, args, client) {
    const ctx = fromMessage(message, { client });
    const sub = (args[0] || 'np').toLowerCase();
    const rest = args.slice(1);

    if (['help', 'h'].includes(sub)) return message.reply({ content: HELP, allowedMentions: { parse: [] } }).catch(() => {});

    if (sub === 'set') {
        const name = rest.join(' ').trim();
        if (!name) return sendError(ctx, `Give me your last.fm username — \`${ctx.prefix}fm set <username>\`.`);
        // Confirm the account exists before storing the link.
        const d = await fm.call('user.getInfo', { user: name });
        if (d.err) return errMsg(ctx, d.err, name);
        await db.setLastfm(ctx.user.id, d.user.name);
        return ctx.reply(cv2(base({ color: 0x57f287, description: `Linked **${ctx.user.username}** to last.fm user [${d.user.name}](${d.user.url}) — \`${ctx.prefix}fm\` is all yours now.` })));
    }
    if (['unset', 'remove', 'unlink'].includes(sub)) {
        const had = await db.clearLastfm(ctx.user.id);
        return ctx.reply(cv2(base({ color: 0x57f287, description: had ? 'Unlinked your last.fm account.' : "You didn't have one linked anyway." })));
    }
    if (['whoknows', 'wk', 'w'].includes(sub)) return whoKnows(ctx, 'artist', { name: rest.join(' ').trim() });
    if (['wkt', 'whoknowstrack'].includes(sub)) {
        const p = parsePair(rest.join(' '));
        if (!p) return sendError(ctx, `Use \`Artist - Track\` — e.g. \`${ctx.prefix}fm wkt radiohead - creep\`.`);
        return whoKnows(ctx, 'track', p);
    }
    if (['wka', 'whoknowsalbum'].includes(sub)) {
        const p = parsePair(rest.join(' '));
        if (!p) return sendError(ctx, `Use \`Artist - Album\` — e.g. \`${ctx.prefix}fm wka radiohead - ok computer\`.`);
        return whoKnows(ctx, 'album', p);
    }
    if (sub === 'recent' || sub === 'r') {
        const target = rest.length ? await resolveMember(message, rest[0]).then((m) => m?.user ?? null) : null;
        if (rest.length && !target) return sendError(ctx, `I can't find \`${rest[0]}\` in this server.`);
        return recentTracks(ctx, target || ctx.user);
    }
    if (sub === 'top') {
        const type = TOP_TYPES[(rest[0] || '').toLowerCase()];
        const periodKey = (rest[1] || 'week').toLowerCase();
        if (!type) return sendError(ctx, `Pick \`artists\`, \`tracks\` or \`albums\` — e.g. \`${ctx.prefix}fm top artists month\`.`);
        const target = rest[2] ? await resolveMember(message, rest[2]).then((m) => m?.user ?? null) : null;
        if (rest[2] && !target) return sendError(ctx, `I can't find \`${rest[2]}\` in this server.`);
        return top(ctx, target || ctx.user, type, periodKey);
    }
    if (['stats', 'listening'].includes(sub)) {
        const target = rest.length ? await resolveMember(message, rest[0]).then((m) => m?.user ?? null) : null;
        if (rest.length && !target) return sendError(ctx, `I can't find \`${rest[0]}\` in this server.`);
        return stats(ctx, target || ctx.user);
    }
    if (['artist', 'ar'].includes(sub)) return artistInfo(ctx, rest.join(' ').trim());
    if (['album', 'al'].includes(sub)) return albumInfo(ctx, rest.join(' ').trim());
    if (['track', 'song', 'tr'].includes(sub)) return trackInfo(ctx, rest.join(' ').trim());
    if (sub === 'plays') return plays(ctx, ctx.user, rest.join(' ').trim());
    if (['cover', 'art', 'artwork'].includes(sub)) return cover(ctx, ctx.user, rest.join(' ').trim());
    if (sub === 'taste') {
        const target = rest.length ? await resolveMember(message, rest[0]).then((m) => m?.user ?? null) : null;
        if (!target) return sendError(ctx, `Compare with someone — e.g. \`${ctx.prefix}fm taste @user\`.`);
        return taste(ctx, ctx.user, target);
    }
    if (['profile', 'me', 'user'].includes(sub)) {
        const target = rest.length ? await resolveMember(message, rest[0]).then((m) => m?.user ?? null) : null;
        if (rest.length && !target) return sendError(ctx, `I can't find \`${rest[0]}\` in this server.`);
        return profile(ctx, target || ctx.user);
    }
    // `.fm`, `.fm np [@user]` or `.fm @user` — now playing.
    const npSubs = ['np', 'nowplaying'];
    if (npSubs.includes(sub)) {
        const target = rest.length ? await resolveMember(message, rest[0]).then((m) => m?.user ?? null) : null;
        if (rest.length && !target) return sendError(ctx, `I can't find \`${rest[0]}\` in this server.`);
        return nowPlaying(ctx, target || ctx.user);
    }
    const target = await resolveMember(message, sub).then((m) => m?.user ?? null);
    if (!target) return sendError(ctx, `I can't find \`${sub}\` in this server — try \`${ctx.prefix}fm help\`.`);
    return nowPlaying(ctx, target);
}

const USER_OPT = { name: 'user', description: 'Whose stats to show (default: you)', type: Opt.User };

module.exports = {
    name: 'lastfm',
    description: 'Last.fm stats — now playing, charts, recents and whoknows.',
    usage: '[set|unset|recent|top|profile|whoknows] […]',
    aliases: ['lfm'],
    cooldown: 3,
    guildOnly: true,
    slash: [
        { name: 'np', description: 'Now playing / last scrobbled track', type: Opt.Subcommand, options: [USER_OPT] },
        { name: 'set', description: 'Link your last.fm username', type: Opt.Subcommand,
            options: [{ name: 'username', description: 'Your last.fm username', type: Opt.String, required: true }] },
        { name: 'unset', description: 'Unlink your last.fm account', type: Opt.Subcommand },
        { name: 'recent', description: 'Your last 10 scrobbled tracks', type: Opt.Subcommand, options: [USER_OPT] },
        { name: 'top', description: 'Your top artists, tracks or albums', type: Opt.Subcommand, options: [
            { name: 'type', description: 'What to chart', type: Opt.String, required: true,
                choices: [{ name: 'Artists', value: 'artists' }, { name: 'Tracks', value: 'tracks' }, { name: 'Albums', value: 'albums' }] },
            { name: 'period', description: 'Time window (default: week)', type: Opt.String,
                choices: [{ name: 'Week', value: '7day' }, { name: 'Month', value: '1month' }, { name: '3 months', value: '3month' }, { name: '6 months', value: '6month' }, { name: 'Year', value: '12month' }, { name: 'All time', value: 'overall' }] },
            USER_OPT,
        ] },
        { name: 'profile', description: 'Last.fm account overview', type: Opt.Subcommand, options: [USER_OPT] },
        { name: 'stats', description: 'Scrobbles per period', type: Opt.Subcommand, options: [USER_OPT] },
        { name: 'artist', description: 'Artist info', type: Opt.Subcommand,
            options: [{ name: 'name', description: 'Artist name', type: Opt.String, required: true }] },
        { name: 'album', description: 'Album info', type: Opt.Subcommand, options: [
            { name: 'artist', description: 'Artist name', type: Opt.String, required: true },
            { name: 'name', description: 'Album name', type: Opt.String, required: true },
        ] },
        { name: 'track', description: 'Track info', type: Opt.Subcommand, options: [
            { name: 'artist', description: 'Artist name', type: Opt.String, required: true },
            { name: 'name', description: 'Track name', type: Opt.String, required: true },
        ] },
        { name: 'plays', description: 'Your playcount for an artist (default: np artist)', type: Opt.Subcommand,
            options: [{ name: 'artist', description: 'Artist name', type: Opt.String }] },
        { name: 'cover', description: 'Album artwork (default: np album)', type: Opt.Subcommand,
            options: [{ name: 'query', description: '"Artist - Album"', type: Opt.String }] },
        { name: 'taste', description: 'Artists you and another member both listen to', type: Opt.Subcommand,
            options: [{ name: 'user', description: 'Who to compare with', type: Opt.User, required: true }] },
        { name: 'whoknows', description: 'Who in this server listens to an artist most', type: Opt.Subcommand,
            options: [{ name: 'artist', description: 'Artist name', type: Opt.String, required: true }] },
        { name: 'whoknowstrack', description: 'Who in this server listens to a track most', type: Opt.Subcommand, options: [
            { name: 'artist', description: 'Artist name', type: Opt.String, required: true },
            { name: 'track', description: 'Track name', type: Opt.String, required: true },
        ] },
        { name: 'whoknowsalbum', description: 'Who in this server listens to an album most', type: Opt.Subcommand, options: [
            { name: 'artist', description: 'Artist name', type: Opt.String, required: true },
            { name: 'album', description: 'Album name', type: Opt.String, required: true },
        ] },
    ],
    execute,

    executeSlash: async (i, client) => {
        const ctx = fromInteraction(i);
        const sub = i.options.getSubcommand();
        const target = i.options.getUser('user') || i.user;
        if (sub.startsWith('whoknows')) await i.deferReply().catch(() => {});
        switch (sub) {
            case 'np': return nowPlaying(ctx, target);
            case 'set': {
                const name = i.options.getString('username').trim();
                const d = await fm.call('user.getInfo', { user: name });
                if (d.err) return errMsg(ctx, d.err, name);
                await db.setLastfm(ctx.user.id, d.user.name);
                return ctx.reply(cv2(base({ color: 0x57f287, description: `Linked **${ctx.user.username}** to last.fm user [${d.user.name}](${d.user.url}) — \`${ctx.prefix}fm\` is all yours now.` })));
            }
            case 'unset': {
                const had = await db.clearLastfm(ctx.user.id);
                return ctx.reply(cv2(base({ color: 0x57f287, description: had ? 'Unlinked your last.fm account.' : "You didn't have one linked anyway." })));
            }
            case 'recent': return recentTracks(ctx, target);
            case 'top': return top(ctx, target, i.options.getString('type'), i.options.getString('period') || '7day');
            case 'profile': return profile(ctx, target);
            case 'stats': return stats(ctx, target);
            case 'artist': return artistInfo(ctx, i.options.getString('name'));
            case 'album': return albumInfo(ctx, `${i.options.getString('artist')} - ${i.options.getString('name')}`);
            case 'track': return trackInfo(ctx, `${i.options.getString('artist')} - ${i.options.getString('name')}`);
            case 'plays': return plays(ctx, i.user, i.options.getString('artist') || '');
            case 'cover': return cover(ctx, i.user, i.options.getString('query') || '');
            case 'taste': return taste(ctx, i.user, i.options.getUser('user'));
            case 'whoknows': return whoKnows(ctx, 'artist', { name: i.options.getString('artist') });
            case 'whoknowstrack': return whoKnows(ctx, 'track', { artist: i.options.getString('artist'), name: i.options.getString('track') });
            case 'whoknowsalbum': return whoKnows(ctx, 'album', { artist: i.options.getString('artist'), name: i.options.getString('album') });
        }
    },

    // Shared with the standalone .w/.wkt/.wka and /fm commands.
    internal: { whoKnows, parsePair, nowPlaying, execute },
};
