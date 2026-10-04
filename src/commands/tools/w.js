const { fromMessage } = require('../../helpers/ctx');
const { whoKnows } = require('./lastfm').internal;

// fmbot parity: `.w <artist>` — server playcount leaderboard for an artist.
module.exports = {
    name: 'w',
    description: 'Who in this server listens to an artist most (last.fm).',
    usage: '<artist>',
    aliases: ['wk'],
    cooldown: 5,
    guildOnly: true,
    execute: (m, args, client) => whoKnows(fromMessage(m, { client }), 'artist', { name: args.join(' ').trim() }),
};
