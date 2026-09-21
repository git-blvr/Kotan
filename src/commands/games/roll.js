const { base, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

module.exports = {
    name: 'roll',
    description: 'Rolls a die. Add a bet to duel the bot — higher roll wins.',
    usage: '[sides] [bet vs bot]',
    aliases: ['dice', 'diceroll'],
    triggers: ['roll', 'dice'],
    cooldown: 3,
    async execute(message, args) {
        const sides = args[0] ? Number.parseInt(args[0], 10) : 6;
        if (!Number.isInteger(sides) || sides < 2 || sides > 1000)
            return sendError(message, 'Sides must be a whole number between 2 and 1000.');

        const you = 1 + Math.floor(Math.random() * sides);

        // No bet — plain fun roll.
        if (!args[1])
            return message.reply(
                cv2(base({ title: 'Dice roll', description: `🎲 You rolled a **${you}** (d${sides}).` }))
            );

        const cur = message.guildSettings?.economy?.currency;
        const profile = await db.getProfile(message.guild.id, message.author.id);
        const bet = parseAmount(args[1], profile.wallet);
        if (!bet) return sendError(message, 'Invalid bet. Examples: `100`, `1k`, `all`, `half`.');
        if (bet > profile.wallet)
            return sendError(message, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);

        const botRoll = 1 + Math.floor(Math.random() * sides);
        const outcome = you === botRoll ? 'tie' : you > botRoll ? 'win' : 'lose';
        profile.wallet += outcome === 'win' ? bet : outcome === 'lose' ? -bet : 0;
        await db.saveProfile(message.guild.id, message.author.id, profile);

        return message.reply(
            cv2(
                base({
                    title: `Dice duel — d${sides}`,
                    color:
                        outcome === 'win'
                            ? config.colors.success
                            : outcome === 'lose'
                              ? config.colors.error
                              : config.colors.warning,
                    description:
                        `🎲 You: **${you}**   —   Kotan: **${botRoll}**\n` +
                        (outcome === 'tie'
                            ? `Tie — your ${formatCoins(bet, cur)} is back.`
                            : `You ${outcome === 'win' ? 'won' : 'lost'} ${formatCoins(bet, cur)}.\n` +
                              `Wallet: ${formatCoins(profile.wallet, cur)}`),
                })
            )
        );
    },
};
