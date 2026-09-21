const { base, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, parseAmount } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

const MOVES = { r: 'rock', rock: 'rock', p: 'paper', paper: 'paper', s: 'scissors', scissors: 'scissors' };
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const EMOJI = { rock: '🪨', paper: '📄', scissors: '✂️' };

module.exports = {
    name: 'rps',
    description: 'Rock paper scissors against the bot. Optionally bet coins on it.',
    usage: '<rock|paper|scissors> [bet]',
    aliases: ['rockpaperscissors'],
    triggers: ['rps'],
    cooldown: 4,
    async execute(message, args) {
        const move = MOVES[(args[0] || '').toLowerCase()];
        if (!move)
            return sendError(message, `Pick a move: \`${message.prefix}rps rock|paper|scissors [bet]\``);

        const bot = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
        const outcome = move === bot ? 'tie' : BEATS[move] === bot ? 'win' : 'lose';
        const line = `You: ${EMOJI[move]} ${move}   —   Kotan: ${EMOJI[bot]} ${bot}`;

        if (!args[1])
            return message.reply(
                cv2(
                    base({
                        title: 'Rock Paper Scissors',
                        description:
                            `${line}\n` +
                            (outcome === 'tie' ? "It's a tie." : outcome === 'win' ? 'You win!' : 'You lose.'),
                    })
                )
            );

        const cur = message.guildSettings?.economy?.currency;
        const profile = await db.getProfile(message.guild.id, message.author.id);
        const bet = parseAmount(args[1], profile.wallet);
        if (!bet) return sendError(message, 'Invalid bet. Examples: `100`, `1k`, `all`, `half`.');
        if (bet > profile.wallet)
            return sendError(message, `You only have ${formatCoins(profile.wallet, cur)} in your wallet.`);

        profile.wallet += outcome === 'win' ? bet : outcome === 'lose' ? -bet : 0;
        await db.saveProfile(message.guild.id, message.author.id, profile);

        return message.reply(
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
    },
};
