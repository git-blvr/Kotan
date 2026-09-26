const { base, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const { resolveMember } = require('../../helpers/resolve');
const { awaitReply } = require('../../helpers/collect');
const db = require('../../utils/database');
const config = require('../../config');

const SIDES = { h: 'heads', heads: 'heads', t: 'tails', tails: 'tails' };
const flip = () => (Math.random() < 0.5 ? 'heads' : 'tails');
const ACCEPT = /^(accept|a|yes|y)$/i;
const DECLINE = /^(decline|d|no|n)$/i;

module.exports = {
    name: 'coinflip',
    description: 'Flips a coin — free, against the house, or wagered against another member.',
    usage: '[heads | tails] [bet] | @member <bet> [heads | tails]',
    aliases: ['cf', 'flip', 'coin'],
    triggers: ['flip', 'cf'],
    cooldown: 3,
    async execute(message, args) {
        const first = (args[0] || '').toLowerCase();
        const guess = SIDES[first] || null;

        // PvP: first arg resolves to a member -> challenge them for the bet.
        // Side words are checked first so a member named "heads" can't hijack the house bet.
        if (!guess) {
            const target = await resolveMember(message, args[0]);
            if (target) return pvp(message, args, target);
        }

        const result = flip();

        // No guess -> plain flip, no money involved.
        if (!guess) {
            return message.reply(
                cv2(base({ title: 'Coinflip', description: `The coin landed on **${result}**.` }))
            );
        }

        const profile = await db.getProfile(message.guild.id, message.author.id);
        const bet = parseAmount(args[1], profile.wallet);
        if (!bet)
            return sendError(
                message,
                `How much? Usage: \`${message.prefix}coinflip <heads|tails> <bet>\` — or challenge someone: \`${message.prefix}cf @user <bet>\``
            );
        const cur = message.guildSettings?.economy?.currency;
        if (bet > profile.wallet)
            return sendError(message, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);

        const won = guess === result;
        profile.wallet += won ? bet : -bet;
        await db.saveProfile(message.guild.id, message.author.id, profile);

        return message.reply(
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
    },
};

// Challenger wagers `bet` against a target member — winner takes the pot.
async function pvp(message, args, target) {
    const cur = message.guildSettings?.economy?.currency;
    if (target.id === message.author.id) return sendError(message, "You can't flip against yourself.");
    if (target.user.bot) return sendError(message, 'Bots have no wallet — pick a real member.');

    const meProfile = await db.getProfile(message.guild.id, message.author.id);
    const bet = parseAmount(args[1], meProfile.wallet);
    if (!bet)
        return sendError(message, `How much? Usage: \`${message.prefix}cf @member <bet> [heads|tails]\``);
    if (bet > meProfile.wallet)
        return sendError(message, `You only have ${formatCoins(meProfile.wallet, cur)} in your wallet.`);

    const theirProfile = await db.getProfile(message.guild.id, target.id);
    if (bet > theirProfile.wallet)
        return sendError(message, `**${target.user.username}** only has ${formatCoins(theirProfile.wallet, cur)}.`);

    const call = SIDES[(args[2] || '').toLowerCase()] || 'heads';
    await message.reply(
        cv2(
            base({
                title: 'Coinflip wager',
                description:
                    `**${message.author.username}** challenged **${target.user.username}** for ${formatCoins(bet, cur)} ` +
                    `and called **${call}**.\n${target.user} — reply \`accept\` or \`decline\` (30s).`,
            })
        )
    );

    const reply = await awaitReply(
        message.channel,
        (m) => m.author.id === target.id && (ACCEPT.test(m.content.trim()) || DECLINE.test(m.content.trim())),
        30_000
    );
    if (!reply || DECLINE.test(reply.content.trim()))
        return message.channel.send(cv2(base({ title: 'Coinflip', description: 'Wager declined — no coins moved.' })));

    // Wallets may have shifted during the wait — recheck before moving money.
    const [a, b] = await Promise.all([
        db.getProfile(message.guild.id, message.author.id),
        db.getProfile(message.guild.id, target.id),
    ]);
    if (bet > a.wallet || bet > b.wallet)
        return message.channel.send(
            cv2(base({ title: 'Coinflip', description: 'Wager cancelled — a wallet can no longer cover the bet.' }))
        );

    const result = flip();
    const iWon = result === call;
    const winner = iWon ? message.author : target.user;
    a.wallet -= bet;
    b.wallet -= bet;
    (iWon ? a : b).wallet += bet * 2;
    await Promise.all([
        db.saveProfile(message.guild.id, message.author.id, a),
        db.saveProfile(message.guild.id, target.id, b),
    ]);

    return message.channel.send(
        cv2(
            base({
                title: 'Coinflip wager',
                color: config.colors.success,
                description:
                    `The coin landed on **${result}** — **${winner.username}** takes ${formatCoins(bet * 2, cur)}.\n` +
                    `${message.author.username}: ${formatCoins(a.wallet, cur)} · ${target.user.username}: ${formatCoins(b.wallet, cur)}`,
            })
        )
    );
}
