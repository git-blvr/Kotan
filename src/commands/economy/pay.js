const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { formatCoins, parseAmount } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');

async function run(ctx, target, amountInput) {
    if (!target)
        return sendError(ctx, `Member not found. Usage: \`${ctx.prefix}pay @member <amount>\``);
    if (target.id === ctx.user.id) return sendError(ctx, 'You cannot pay yourself.');
    if (target.user.bot) return sendError(ctx, 'You cannot pay a bot.');

    const cur = ctx.settings?.economy?.currency;
    const sender = await db.getProfile(ctx.guild.id, ctx.user.id);
    const amount = parseAmount(amountInput, sender.wallet);
    if (!amount) return sendError(ctx, 'Invalid amount. Examples: `250`, `1k`, `all`, `half`.');
    if (amount > sender.wallet)
        return sendError(ctx, `You only have ${formatCoins(sender.wallet, cur)} in your wallet.`);

    const receiver = await db.getProfile(ctx.guild.id, target.id);
    sender.wallet -= amount;
    receiver.wallet += amount;
    await db.saveProfile(ctx.guild.id, ctx.user.id, sender);
    await db.saveProfile(ctx.guild.id, target.id, receiver);

    return ctx.reply(
        cv2(
            success(
                `You paid ${formatCoins(amount, cur)} to **${target.user.tag}**.\n` +
                    `Your new balance: ${formatCoins(sender.wallet, cur)}`,
                'Payment sent'
            )
        )
    );
}

module.exports = {
    name: 'pay',
    description: 'Transfers coins from your wallet to another member.',
    usage: '<@member> <amount | all>',
    aliases: ['transfer', 'give', 'send'],
    triggers: ['pay'],
    cooldown: 5,
    slash: [
        { name: 'member', description: 'Who receives the coins', type: Opt.User, required: true },
        { name: 'amount', description: 'How much — e.g. 250, 1k, all', type: Opt.String, required: true },
    ],
    execute: async (message, args) =>
        run(fromMessage(message), await resolveMember(message, args[0]), args[1]),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getMember('member'),
            interaction.options.getString('amount')
        ),
};
