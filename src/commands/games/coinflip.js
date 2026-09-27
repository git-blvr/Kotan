const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const { resolveMember } = require('../../helpers/resolve');
const { awaitReply } = require('../../helpers/collect');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const config = require('../../config');

const SIDES = { h: 'heads', heads: 'heads', t: 'tails', tails: 'tails' };
const flip = () => (Math.random() < 0.5 ? 'heads' : 'tails');
const ACCEPT = /^(accept|a|yes|y)$/i;
const DECLINE = /^(decline|d|no|n)$/i;

async function run(ctx, guess, betInput, pvpTarget) {
    // PvP: a target member was picked -> challenge them for the bet.
    if (pvpTarget) return pvp(ctx, pvpTarget, betInput, guess);

    const result = flip();

    // No guess -> plain flip, no money involved.
    if (!guess) {
        return ctx.reply(
            cv2(base({ title: 'Coinflip', description: `The coin landed on **${result}**.` }))
        );
    }

    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
    const bet = parseAmount(betInput, profile.wallet);
    if (!bet)
        return sendError(
            ctx,
            `How much? Usage: \`${ctx.prefix}coinflip <heads|tails> <bet>\` — or challenge someone: \`${ctx.prefix}cf @user <bet>\``
        );
    const cur = ctx.settings?.economy?.currency;
    if (bet > profile.wallet)
        return sendError(ctx, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);

    const won = guess === result;
    profile.wallet += won ? bet : -bet;
    await db.saveProfile(ctx.guild.id, ctx.user.id, profile);

    return ctx.reply(
        cv2(
            base({
                title: 'Coinflip',
                color: won ? config.colors.success : config.colors.error,
                description:
                    `The coin landed on **${result}** — you ${won ? 'won' : 'lost'} ${formatCoins(bet, cur)}.\n` +
                    `Wallet: ${formatCoins(profile.wallet, cur)}`,
            })
        )
    );
}

// Challenger wagers `bet` against a target member — winner takes the pot.
async function pvp(ctx, target, betInput, guess) {
    const cur = ctx.settings?.economy?.currency;
    if (target.id === ctx.user.id) return sendError(ctx, "You can't flip against yourself.");
    if (target.user.bot) return sendError(ctx, 'Bots have no wallet — pick a real member.');

    const meProfile = await db.getProfile(ctx.guild.id, ctx.user.id);
    const bet = parseAmount(betInput, meProfile.wallet);
    if (!bet)
        return sendError(ctx, `How much? Usage: \`${ctx.prefix}cf @member <bet> [heads|tails]\``);
    if (bet > meProfile.wallet)
        return sendError(ctx, `You only have ${formatCoins(meProfile.wallet, cur)} in your wallet.`);

    const theirProfile = await db.getProfile(ctx.guild.id, target.id);
    if (bet > theirProfile.wallet)
        return sendError(ctx, `**${target.user.username}** only has ${formatCoins(theirProfile.wallet, cur)}.`);

    const call = guess || 'heads';
    await ctx.reply(
        cv2(
            base({
                title: 'Coinflip wager',
                description:
                    `**${ctx.user.username}** challenged **${target.user.username}** for ${formatCoins(bet, cur)} ` +
                    `and called **${call}**.\n${target.user} — reply \`accept\` or \`decline\` (30s).`,
            })
        )
    );

    const reply = await awaitReply(
        ctx.channel,
        (m) => m.author.id === target.id && (ACCEPT.test(m.content.trim()) || DECLINE.test(m.content.trim())),
        30_000
    );
    if (!reply || DECLINE.test(reply.content.trim()))
        return ctx.channel.send(cv2(base({ title: 'Coinflip', description: 'Wager declined — no coins moved.' })));

    // Wallets may have shifted during the wait — recheck before moving money.
    const [a, b] = await Promise.all([
        db.getProfile(ctx.guild.id, ctx.user.id),
        db.getProfile(ctx.guild.id, target.id),
    ]);
    if (bet > a.wallet || bet > b.wallet)
        return ctx.channel.send(
            cv2(base({ title: 'Coinflip', description: 'Wager cancelled — a wallet can no longer cover the bet.' }))
        );

    const result = flip();
    const iWon = result === call;
    const winner = iWon ? ctx.user : target.user;
    a.wallet -= bet;
    b.wallet -= bet;
    (iWon ? a : b).wallet += bet * 2;
    await Promise.all([
        db.saveProfile(ctx.guild.id, ctx.user.id, a),
        db.saveProfile(ctx.guild.id, target.id, b),
    ]);

    return ctx.channel.send(
        cv2(
            base({
                title: 'Coinflip wager',
                color: config.colors.success,
                description:
                    `The coin landed on **${result}** — **${winner.username}** takes ${formatCoins(bet * 2, cur)}.\n` +
                    `${ctx.user.username}: ${formatCoins(a.wallet, cur)} · ${target.user.username}: ${formatCoins(b.wallet, cur)}`,
            })
        )
    );
}

module.exports = {
    name: 'coinflip',
    description: 'Flips a coin — free, against the house, or wagered against another member.',
    usage: '[heads | tails] [bet] | @member <bet> [heads | tails]',
    aliases: ['cf', 'flip', 'coin'],
    triggers: ['flip', 'cf'],
    cooldown: 3,
    slash: [
        {
            name: 'call', description: 'Call heads or tails', type: Opt.String,
            choices: ['heads', 'tails'].map((v) => ({ name: v, value: v })),
        },
        { name: 'bet', description: 'Wager — e.g. 100, 1k, all', type: Opt.String },
        { name: 'member', description: 'Challenge a member to a wager instead of the house', type: Opt.User },
    ],
    execute: async (message, args) => {
        const first = (args[0] || '').toLowerCase();
        const guess = SIDES[first] || null;
        // Side words are checked first so a member named "heads" can't hijack the house bet.
        const target = guess ? null : await resolveMember(message, args[0]);
        return run(
            fromMessage(message),
            target ? SIDES[(args[2] || '').toLowerCase()] : guess,
            args[1],
            target
        );
    },
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getString('call'),
            interaction.options.getString('bet'),
            interaction.options.getMember('member')
        ),
};
