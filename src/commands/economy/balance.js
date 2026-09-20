const { base, sendError } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { formatCoins, formatNumber } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

module.exports = {
    name: 'balance',
    description: 'Shows your (or another user\'s) wallet and bank balance.',
    usage: '[@user | id]',
    aliases: ['bal', 'wallet', 'money', 'cash'],
    triggers: ['bal', 'balance'],
    cooldown: 3,
    async execute(message, args, client) {
        const user = args[0] ? await resolveUser(client, args[0]) : message.author;
        if (!user) return sendError(message, 'I could not find that user.');
        if (user.bot) return sendError(message, 'Bots do not have a balance.');

        const profile = await db.getProfile(message.guild.id, user.id);
        const total = profile.wallet + profile.bank;

        const embed = base({
            title: `${user.username}'s balance`,
            thumbnail: user.displayAvatarURL({ size: 128 }),
            fields: [
                { name: 'Wallet', value: formatCoins(profile.wallet), inline: true },
                { name: 'Bank', value: formatCoins(profile.bank), inline: true },
                { name: 'Net worth', value: `**${formatNumber(total)}** ${config.economy.currency}`, inline: true },
            ],
        });
        return message.reply({ embeds: [embed] });
    },
};
