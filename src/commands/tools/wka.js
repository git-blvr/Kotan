const { fromMessage } = require('../../helpers/ctx');
const { sendError } = require('../../helpers/embeds');
const { whoKnows, parsePair } = require('./lastfm').internal;

// fmbot parity: `.wka <artist> - <album>` — whoknows for an album.
module.exports = {
    name: 'wka',
    description: 'Who in this server listens to an album most (last.fm).',
    usage: '<artist> - <album>',
    cooldown: 5,
    guildOnly: true,
    execute: (m, args, client) => {
        const ctx = fromMessage(m, { client });
        const p = parsePair(args.join(' '));
        if (!p) return sendError(ctx, `Use \`Artist - Album\` — e.g. \`${ctx.prefix}wka radiohead - ok computer\`.`);
        return whoKnows(ctx, 'album', p);
    },
};
