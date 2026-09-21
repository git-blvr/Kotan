const { base, cv2 } = require('../../helpers/embeds');
const { awaitReply } = require('../../helpers/collect');
const { formatCoins } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

const WORDS = [
    'discord', 'keyboard', 'universe', 'midnight', 'journey', 'diamond', 'thunder',
    'library', 'quantum', 'festival', 'horizon', 'galaxy', 'phoenix', 'cascade',
    'meadow', 'lantern', 'compass', 'whisper', 'volcano', 'harvest',
];
const REWARD = 200;

function scramble(word) {
    let out = word;
    while (out === word)
        out = word.split('').sort(() => Math.random() - 0.5).join('');
    return out;
}

module.exports = {
    name: 'scramble',
    description: 'Unscramble the word — first correct answer in the channel wins coins.',
    usage: '',
    aliases: ['unscramble', 'scrambled'],
    triggers: ['scramble'],
    cooldown: 15,
    async execute(message) {
        const word = WORDS[Math.floor(Math.random() * WORDS.length)];
        const cur = message.guildSettings?.economy?.currency;

        await message.reply(
            cv2(
                base({
                    title: 'Word Scramble',
                    description:
                        `Unscramble this: \`${scramble(word)}\`\n` +
                        `First correct answer wins ${formatCoins(REWARD, cur)} — 30s.`,
                })
            )
        );

        const winner = await awaitReply(
            message.channel,
            (m) => !m.author.bot && m.content.trim().toLowerCase() === word,
            30_000
        );

        if (!winner)
            return message.channel.send(
                cv2(base({ color: config.colors.warning, description: `Nobody got it — the word was **${word}**.` }))
            );

        const profile = await db.getProfile(message.guild.id, winner.author.id);
        profile.wallet += REWARD;
        await db.saveProfile(message.guild.id, winner.author.id, profile);

        return message.channel.send(
            cv2(
                base({
                    color: config.colors.success,
                    description: `⚡ **${winner.author.username}** unscrambled **${word}** and won ${formatCoins(REWARD, cur)}!`,
                })
            )
        );
    },
};
