const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { fromInteraction } = require('../../helpers/ctx');
const lfm = require('./lastfm');

// fmbot parity: `/fm` is its own command — now playing, no subcommand
// needed. Prefix `.fm` still routes through the full lastfm dispatcher, so
// `.fm stats`, `.fm top artists` etc. all keep working. The subcommand
// family lives on `/lastfm`.
module.exports = {
    name: 'fm',
    description: 'Now playing on Last.fm.',
    usage: '[@user]',
    aliases: ['scrobbles'],
    cooldown: 3,
    guildOnly: true,
    slash: [{ name: 'user', description: 'Whose now playing to show (default: you)', type: Opt.User }],
    execute: lfm.execute,
    executeSlash: (i) => lfm.internal.nowPlaying(fromInteraction(i), i.options.getUser('user') || i.user),
};
