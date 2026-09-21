const { base, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

// 💎 jackpot x10 · ⭐ triple x6 · other triples x4 · a pair refunds half.
const REELS = ['🍒', '🍋', '🍇', '🍉', '⭐', '💎'];
const TRIPLE = { '💎': 10, '⭐': 6 };

module.exports = {
    name: 'slots',
    description: 'Spins the slot machine. Three of a kind pays big, a pair refunds half.',
    usage: '<bet>',
    aliases: ['slot', 'spin'],
    triggers: ['slots'],
    cooldown: 5,
    async execute(message, args) {
        const cur = message.guildSettings?.economy?.currency;
        const profile = await db.getProfile(message.guild.id, message.author.id);

        const bet = parseAmount(args[0], profile.wallet);
        if (!bet) return sendError(message, `How much? Usage: \`${message.prefix}slots <bet>\``);
        if (bet > profile.wallet)
            return sendError(message, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);

        const reels = [0, 0, 0].map(() => REELS[Math.floor(Math.random() * REELS.length)]);
        const [a, b, c] = reels;

        let winnings;
        let note;
        if (a === b && b === c) {
            winnings = bet * (TRIPLE[a] ?? 4);
            note = `Triple ${a} — **x${TRIPLE[a] ?? 4}**!`;
        } else if (a === b || b === c || a === c) {
            winnings = Math.floor(bet / 2);
            note = 'A pair — half your bet back.';
        } else {
            winnings = 0;
            note = 'No match — better luck next spin.';
        }

        profile.wallet += winnings - bet;
        await db.saveProfile(message.guild.id, message.author.id, profile);

        const net = winnings - bet;
        return message.reply(
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
    },
};
