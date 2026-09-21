const { base, sendError, cv2 } = require('../../helpers/embeds');
const { awaitReply } = require('../../helpers/collect');
const { formatCoins, parseAmount } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

const draw = () => Math.floor(Math.random() * 13); // 0..12 -> A..K
const show = (card) => `${RANKS[card]}${SUITS[Math.floor(Math.random() * SUITS.length)]}`;

module.exports = {
    name: 'hilo',
    description: 'Bet coins, then guess whether the next card is higher or lower.',
    usage: '<bet>',
    aliases: ['higherlower', 'highlow'],
    triggers: ['hilo'],
    cooldown: 5,
    async execute(message, args) {
        const cur = message.guildSettings?.economy?.currency;
        const profile = await db.getProfile(message.guild.id, message.author.id);

        const bet = parseAmount(args[0], profile.wallet);
        if (!bet) return sendError(message, `How much? Usage: \`${message.prefix}hilo <bet>\``);
        if (bet > profile.wallet)
            return sendError(message, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);

        const first = draw();
        await message.reply(
            cv2(
                base({
                    title: 'Higher or Lower',
                    description: `First card: **${show(first)}**\nReply \`higher\` or \`lower\` — 20s.`,
                })
            )
        );

        const answer = await awaitReply(
            message.channel,
            (m) => m.author.id === message.author.id && /^(h|l|higher|lower)$/i.test(m.content.trim()),
            20_000
        );
        if (!answer)
            return message.channel.send(
                cv2(base({ color: config.colors.warning, description: 'Timed out — your bet was returned.' }))
            );

        const guessHigh = answer.content.trim().toLowerCase().startsWith('h');
        const second = draw();
        const outcome = second === first ? 'push' : second > first === guessHigh ? 'win' : 'lose';

        profile.wallet += outcome === 'win' ? bet : outcome === 'lose' ? -bet : 0;
        await db.saveProfile(message.guild.id, message.author.id, profile);

        return message.channel.send(
            cv2(
                base({
                    title: 'Higher or Lower',
                    color:
                        outcome === 'win'
                            ? config.colors.success
                            : outcome === 'lose'
                              ? config.colors.error
                              : config.colors.warning,
                    description:
                        `**${show(first)}** → **${show(second)}** — you called **${guessHigh ? 'higher' : 'lower'}**.\n` +
                        (outcome === 'push'
                            ? `Same rank — your ${formatCoins(bet, cur)} is back.`
                            : `You ${outcome === 'win' ? 'won' : 'lost'} ${formatCoins(bet, cur)}.\n` +
                              `Wallet: ${formatCoins(profile.wallet, cur)}`),
                })
            )
        );
    },
};
