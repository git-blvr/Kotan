const { fromMessage } = require('../../helpers/ctx');
const { sendError } = require('../../helpers/embeds');
const { whoKnows, parsePair } = require('./lastfm').internal;

// fmbot parity: `.wkt <artist> - <track>` — whoknows for a track.
module.exports = {
    name: 'wkt',
    description: 'Who in this server listens to a track most (last.fm).',
    usage: '<artist> - <track>',
    cooldown: 5,
    guildOnly: true,
    execute: (m, args, client) => {
        const ctx = fromMessage(m, { client });
        const p = parsePair(args.join(' '));
        if (!p) return sendError(ctx, `Use \`Artist - Track\` — e.g. \`${ctx.prefix}wkt radiohead - creep\`.`);
        return whoKnows(ctx, 'track', p);
    },
};
