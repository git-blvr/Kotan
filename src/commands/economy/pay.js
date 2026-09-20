const { success, sendError } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { formatCoins, parseAmount } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

module.exports = {
    name: 'pay',
    description: 'Transfers coins from your wallet to another member.',
    usage: '<@member> <amount | all>',
    aliases: ['transfer', 'give', 'send'],
    triggers: ['pay'],
    cooldown: 5,
    async execute(message, args) {
        const target = await resolveMember(message, args[0]);
        if (!target)
            return sendError(message, `Member not found. Usage: \`${config.prefix}pay @member <amount>\``);
        if (target.id === message.author.id) return sendError(message, 'You cannot pay yourself.');
        if (target.user.bot) return sendError(message, 'You cannot pay a bot.');

        const sender = await db.getProfile(message.guild.id, message.author.id);
        const amount = parseAmount(args[1], sender.wallet);
        if (!amount) return sendError(message, 'Invalid amount. Examples: `250`, `1k`, `all`, `half`.');
        if (amount > sender.wallet)
            return sendError(message, `You only have ${formatCoins(sender.wallet)} in your wallet.`);

        const receiver = await db.getProfile(message.guild.id, target.id);
        sender.wallet -= amount;
        receiver.wallet += amount;
        await db.saveProfile(message.guild.id, message.author.id, sender);
        await db.saveProfile(message.guild.id, target.id, receiver);

        return message.reply({
            embeds: [
                success(
                    `You paid ${formatCoins(amount)} to **${target.user.tag}**.\n` +
                        `Your new balance: ${formatCoins(sender.wallet)}`,
                    'Payment sent'
                ),
            ],
        });
    },
};
