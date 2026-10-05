const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { awaitReply } = require('../../helpers/collect');
const { formatCoins, parseAmount } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { betCapped, scaled } = require('../../helpers/gamecfg')
const { winAmount } = require('../../helpers/inv');
const db = require('../../utils/database');
const config = require('../../config');
const E = require('../../utils/emojis');

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = [E.spade, E.heart, E.diamond, E.club];

const draw = () => Math.floor(Math.random() * 13); // 0..12 -> A..K
const show = (card) => `${RANKS[card]}${SUITS[Math.floor(Math.random() * SUITS.length)]}`;

async function run(ctx, betInput) {
    const cur = ctx.settings?.economy?.currency;
    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);

    const bet = parseAmount(betInput, profile.wallet);
    if (!bet) return sendError(ctx, `How much? Usage: \`${ctx.prefix}hilo <bet>\``);
    if (bet > profile.wallet)
        return sendError(ctx, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);
    if (betCapped(ctx, bet, cur, 'hilo')) return;

    const first = draw();
    await ctx.reply(
        cv2(
            base({
                title: 'Higher or Lower',
                description: `First card: **${show(first)}**\nReply \`higher\` or \`lower\` — 20s.`,
            })
        )
    );

    const answer = await awaitReply(
        ctx.channel,
        (m) => m.author.id === ctx.user.id && /^(h|l|higher|lower)$/i.test(m.content.trim()),
        20_000
    );
    if (!answer)
        return ctx.channel.send(
            cv2(base({ color: config.colors.warning, description: 'Timed out — your bet was returned.' }))
        );

    const guessHigh = answer.content.trim().toLowerCase().startsWith('h');
    const second = draw();
    const outcome = second === first ? 'push' : second > first === guessHigh ? 'win' : 'lose';

    profile.wallet += outcome === 'win' ? winAmount(ctx.member, ctx.settings, profile, scaled(ctx.settings, bet, 'hilo')) : outcome === 'lose' ? -bet : 0;
    await db.saveProfile(ctx.guild.id, ctx.user.id, profile);

    return ctx.channel.send(
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
}

module.exports = {
    name: 'hilo',
    description: 'Bet coins, then guess whether the next card is higher or lower.',
    usage: '<bet>',
    aliases: ['higherlower', 'highlow'],
    triggers: ['hilo'],
    cooldown: 5,
    slash: [
        { name: 'bet', description: 'How much to wager — e.g. 250, 1k, all', type: Opt.String, required: true },
    ],
    execute: (message, args) => run(fromMessage(message), args[0]),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getString('bet')),
};
