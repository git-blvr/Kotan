const { base, cv2 } = require('../../helpers/embeds');
const { awaitReply } = require('../../helpers/collect');
const { formatCoins } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { gameCfg } = require('../../helpers/gamecfg')
const { withCoinMult } = require('../../helpers/inv');
const db = require('../../utils/database');
const config = require('../../config');

const WORDS = [
    'discord', 'keyboard', 'universe', 'midnight', 'journey', 'diamond', 'thunder',
    'library', 'quantum', 'festival', 'horizon', 'galaxy', 'phoenix', 'cascade',
    'meadow', 'lantern', 'compass', 'whisper', 'volcano', 'harvest',
];

function scramble(word) {
    let out = word;
    while (out === word)
        out = word.split('').sort(() => Math.random() - 0.5).join('');
    return out;
}

async function run(ctx) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const cur = ctx.settings?.economy?.currency;
    const reward = gameCfg(ctx.settings, 'scramble').reward;

    await ctx.reply(
        cv2(
            base({
                title: 'Word Scramble',
                description:
                    `Unscramble this: \`${scramble(word)}\`\n` +
                    `First correct answer wins ${formatCoins(reward, cur)} — 30s.`,
            })
        )
    );

    const winner = await awaitReply(
        ctx.channel,
        (m) => !m.author.bot && m.content.trim().toLowerCase() === word,
        30_000
    );

    if (!winner)
        return ctx.channel.send(
            cv2(base({ color: config.colors.warning, description: `Nobody got it — the word was **${word}**.` }))
        );

    const profile = await db.getProfile(ctx.guild.id, winner.author.id);
    profile.wallet += withCoinMult(profile, reward);
    await db.saveProfile(ctx.guild.id, winner.author.id, profile);

    return ctx.channel.send(
        cv2(
            base({
                color: config.colors.success,
                description: `⚡ **${winner.author.username}** unscrambled **${word}** and won ${formatCoins(reward, cur)}!`,
            })
        )
    );
}

module.exports = {
    name: 'scramble',
    description: 'Unscramble the word — first correct answer in the channel wins coins.',
    usage: '',
    aliases: ['unscramble', 'scrambled'],
    triggers: ['scramble'],
    cooldown: 15,
    slash: [],
    execute: (message) => run(fromMessage(message)),
    executeSlash: (interaction) => run(fromInteraction(interaction)),
};
