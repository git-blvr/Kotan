const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { betCapped, gameCfg } = require('../../helpers/gamecfg')
const { winAmount } = require('../../helpers/inv');
const db = require('../../utils/database');
const config = require('../../config');
const E = require('../../utils/emojis');

// coin jackpot x10 · star triple x6 · other triples x4 · a pair refunds half.
const REELS = [E.cherry, E.lemon, E.bolt, E.melon, E.star, E.coin];
const TRIPLE = { [E.coin]: 10, [E.star]: 6 };

async function run(ctx, betInput) {
    const cur = ctx.settings?.economy?.currency;
    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);

    const bet = parseAmount(betInput, profile.wallet);
    if (!bet) return sendError(ctx, `How much? Usage: \`${ctx.prefix}slots <bet>\``);
    if (bet > profile.wallet)
        return sendError(ctx, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);
    if (betCapped(ctx, bet, cur, 'slots')) return;

    const reels = [0, 0, 0].map(() => REELS[Math.floor(Math.random() * REELS.length)]);
    const [a, b, c] = reels;

    const mult = gameCfg(ctx.settings, 'slots').winMultiplier;
    let winnings;
    let note;
    if (a === b && b === c) {
        winnings = Math.floor(bet * (TRIPLE[a] ?? 4) * mult);
        note = `Triple ${a} — **x${TRIPLE[a] ?? 4}**!`;
    } else if (a === b || b === c || a === c) {
        winnings = Math.floor(bet / 2);
        note = 'A pair — half your bet back.';
    } else {
        winnings = 0;
        note = 'No match — better luck next spin.';
    }

    profile.wallet += winAmount(ctx.member, ctx.settings, profile, winnings) - bet;
    await db.saveProfile(ctx.guild.id, ctx.user.id, profile);

    const net = winnings - bet;
    return ctx.reply(
        cv2(
            base({
                title: 'Slots',
                color: net > 0 ? config.colors.success : net < 0 ? config.colors.error : config.colors.warning,
                description:
                    `# ${reels.join(' | ')}\n` +
                    `${note}\n` +
                    `Wallet: ${formatCoins(profile.wallet, cur)}`,
            })
        )
    );
}

module.exports = {
    name: 'slots',
    description: 'Spins the slot machine. Three of a kind pays big, a pair refunds half.',
    usage: '<bet>',
    aliases: ['slot', 'spin'],
    triggers: ['slots'],
    cooldown: 5,
    slash: [
        { name: 'bet', description: 'How much to wager — e.g. 250, 1k, all', type: Opt.String, required: true },
    ],
    execute: (message, args) => run(fromMessage(message), args[0]),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getString('bet')),
};
