const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { betCapped, scaled } = require('../../helpers/gamecfg')
const { winAmount } = require('../../helpers/inv');
const db = require('../../utils/database');
const config = require('../../config');

const MOVES = { r: 'rock', rock: 'rock', p: 'paper', paper: 'paper', s: 'scissors', scissors: 'scissors' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };

async function run(ctx, move, betInput) {
    if (!move)
        return sendError(ctx, `Pick a move: \`${ctx.prefix}rps rock|paper|scissors [bet]\``);

    const bot = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
    const outcome = move === bot ? 'tie' : BEATS[move] === bot ? 'win' : 'lose';
    const line = `You: ${EMOJI[move]} ${move}   —   Kotan: ${EMOJI[bot]} ${bot}`;

    if (!betInput)
        return ctx.reply(
            cv2(
                base({
                    title: 'Rock Paper Scissors',
                    description:
                        `${line}\n` +
                        (outcome === 'tie' ? "It's a tie." : outcome === 'win' ? 'You win!' : 'You lose.'),
                })
            )
        );

    const cur = ctx.settings?.economy?.currency;
    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
    const bet = parseAmount(betInput, profile.wallet);
    if (!bet) return sendError(ctx, 'Invalid bet. Examples: `100`, `1k`, `all`, `half`.');
    if (bet > profile.wallet)
        return sendError(ctx, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);
    if (betCapped(ctx, bet, cur, 'rps')) return;

    profile.wallet += outcome === 'win' ? winAmount(ctx.member, ctx.settings, profile, scaled(ctx.settings, bet, 'rps')) : outcome === 'lose' ? -bet : 0;
    await db.saveProfile(ctx.guild.id, ctx.user.id, profile);

    return ctx.reply(
        cv2(
            base({
                title: 'Rock Paper Scissors',
                color:
                    outcome === 'win'
                        ? config.colors.success
                        : outcome === 'lose'
                          ? config.colors.error
                          : config.colors.warning,
                description:
                    `${line}\n` +
                    (outcome === 'tie'
                        ? `Tie — your ${formatCoins(bet, cur)} is back.`
                        : `You ${outcome === 'win' ? 'won' : 'lost'} ${formatCoins(bet, cur)}.\n` +
                          `Wallet: ${formatCoins(profile.wallet, cur)}`),
            })
        )
    );
}

module.exports = {
    name: 'rps',
    description: 'Rock paper scissors against the bot. Optionally bet coins on it.',
    usage: '<rock|paper|scissors> [bet]',
    aliases: ['rockpaperscissors'],
    triggers: ['rps'],
    cooldown: 4,
    slash: [
        {
            name: 'move', description: 'Your move', type: Opt.String, required: true,
            choices: ['rock', 'paper', 'scissors'].map((v) => ({ name: v, value: v })),
        },
        { name: 'bet', description: 'Optional wager — e.g. 100, 1k, all', type: Opt.String },
    ],
    execute: (message, args) => run(fromMessage(message), MOVES[(args[0] || '').toLowerCase()], args[1]),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getString('move'),
            interaction.options.getString('bet')
        ),
};
