const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { betCapped, scaled } = require('../../helpers/gamecfg');
const db = require('../../utils/database');
const config = require('../../config');

async function run(ctx, sides, betInput) {
    if (!Number.isInteger(sides) || sides < 2 || sides > 1000)
        return sendError(ctx, 'Sides must be a whole number between 2 and 1000.');

    const you = 1 + Math.floor(Math.random() * sides);

    // No bet — plain fun roll.
    if (!betInput)
        return ctx.reply(
            cv2(base({ title: 'Dice roll', description: `🎲 You rolled a **${you}** (d${sides}).` }))
        );

    const cur = ctx.settings?.economy?.currency;
    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
    const bet = parseAmount(betInput, profile.wallet);
    if (!bet) return sendError(ctx, 'Invalid bet. Examples: `100`, `1k`, `all`, `half`.');
    if (bet > profile.wallet)
        return sendError(ctx, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);
    if (betCapped(ctx, bet, cur, 'roll')) return;

    const botRoll = 1 + Math.floor(Math.random() * sides);
    const outcome = you === botRoll ? 'tie' : you > botRoll ? 'win' : 'lose';
    profile.wallet += outcome === 'win' ? scaled(ctx.settings, bet, 'roll') : outcome === 'lose' ? -bet : 0;
    await db.saveProfile(ctx.guild.id, ctx.user.id, profile);

    return ctx.reply(
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
}

module.exports = {
    name: 'roll',
    description: 'Rolls a die. Add a bet to duel the bot — higher roll wins.',
    usage: '[sides] [bet vs bot]',
    aliases: ['dice', 'diceroll'],
    triggers: ['roll', 'dice'],
    cooldown: 3,
    slash: [
        { name: 'sides', description: 'Dice sides (2-1000, default 6)', type: Opt.Integer, min_value: 2, max_value: 1000 },
        { name: 'bet', description: 'Wager against the bot — e.g. 100, 1k, all', type: Opt.String },
    ],
    execute: (message, args) =>
        run(fromMessage(message), args[0] ? Number.parseInt(args[0], 10) : 6, args[1]),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getInteger('sides') ?? 6,
            interaction.options.getString('bet')
        ),
};
