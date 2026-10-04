const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { cv2, base, sendError } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { resolveMember } = require('../../helpers/resolve');
const { timestamp } = require('../../helpers/format');
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
    'fm profile [@user]    — account stats',
    'fm whoknows <artist>  — who in this server listens to them most',
    '```',
].join('\n');

const errMsg = (ctx, err, name) =>
    err === 'off'
        ? sendError(ctx, 'Last.fm isn\'t configured — the bot owner needs to set `LASTFM_API_KEY` in .env.')
        : err === 'notfound'
          ? sendError(ctx, `Last.fm doesn't know **${name}** — check the spelling.`)
          : sendError(ctx, err);

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
        color: RED,
        author: `${playing ? '🎧 Now playing' : 'Last track'} — ${user.username}`,
        title: t.name,
        url: t.url,
        description: `**${artist}**${album ? ` — *${album}*` : ''}`,
        thumbnail: fm.img(t),
        fields: [
            ...(plays ? [{ name: 'Your plays', value: plays, inline: true }] : []),
            ...(t.loved === '1' ? [{ name: 'Loved', value: '❤️', inline: true }] : []),
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
        const when = np ? '🎧 now' : t.date?.uts ? timestamp(t.date.uts * 1000) : '';
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

// Guild leaderboard for an artist — intersects linked accounts with
// members, then reads each member's userplaycount on that artist.
async function whoknows(ctx, artistQuery) {
    if (!artistQuery) return sendError(ctx, `Give me an artist — e.g. \`${ctx.prefix}fm whoknows radiohead\`.`);

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
            const d = await fm.call('artist.getInfo', { artist: artistQuery, username: name });
            const plays = Number(d.artist?.stats?.userplaycount || 0);
            return { uid, plays, artist: d.artist };
        })
    );
    const meta = rows.find((r) => r.artist)?.artist; // canonical name/url/image
    const ranked = rows.filter((r) => r.plays > 0).sort((a, b) => b.plays - a.plays).slice(0, 10);
    if (!ranked.length)
        return ctx.reply(cv2(base({ color: RED, description: `Nobody here scrobbles **${meta?.name || artistQuery}** — their loss.` })));

    return ctx.reply(
        cv2(
            base({
                color: RED,
                author: 'Who knows',
                title: meta?.name || artistQuery,
                url: meta?.url,
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
    if (sub === 'whoknows' || sub === 'wk') return whoknows(ctx, rest.join(' ').trim());
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
    aliases: ['fm', 'scrobbles'],
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
        { name: 'whoknows', description: 'Who in this server listens to an artist most', type: Opt.Subcommand,
            options: [{ name: 'artist', description: 'Artist name', type: Opt.String, required: true }] },
    ],
    execute,

    executeSlash: async (i, client) => {
        const ctx = fromInteraction(i);
        const sub = i.options.getSubcommand();
        const target = i.options.getUser('user') || i.user;
        if (sub === 'whoknows') await i.deferReply().catch(() => {});
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
            case 'whoknows': return whoknows(ctx, i.options.getString('artist'));
        }
    },
};
