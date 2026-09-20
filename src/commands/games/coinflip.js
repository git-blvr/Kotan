const { base, sendError } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

const SIDES = { h: 'heads', heads: 'heads', t: 'tails', tails: 'tails' };

module.exports = {
    name: 'coinflip',
    description: 'Flips a coin. Optionally bet coins on heads or tails.',
    usage: '[heads | tails] [bet]',
    aliases: ['cf', 'flip', 'coin'],
    triggers: ['flip', 'cf'],
    cooldown: 3,
    async execute(message, args) {
        const guess = SIDES[(args[0] || '').toLowerCase()] || null;
        const result = Math.random() < 0.5 ? 'heads' : 'tails';

        // No guess -> plain flip, no money involved.
        if (!guess) {
            return message.reply({
                embeds: [base({ title: 'Coinflip', description: `The coin landed on **${result}**.` })],
            });
        }

        const profile = await db.getProfile(message.guild.id, message.author.id);
        const bet = parseAmount(args[1], profile.wallet);
        if (!bet)
            return sendError(
                message,
                `How much? Usage: \`${config.prefix}coinflip <heads|tails> <bet>\``
            );
        if (bet > profile.wallet)
            return sendError(message, `You only have ${formatCoins(profile.wallet)} in your wallet.`);

        const won = guess === result;
        profile.wallet += won ? bet : -bet;
        await db.saveProfile(message.guild.id, message.author.id, profile);

        return message.reply({
            embeds: [
                base({
                    title: 'Coinflip',
                    color: won ? config.colors.success : config.colors.error,
                    description:
                        `The coin landed on **${result}** — you ${won ? 'won' : 'lost'} ${formatCoins(bet)}.\n` +
                        `Wallet: ${formatCoins(profile.wallet)}`,
                }),
            ],
        });
    },
};
