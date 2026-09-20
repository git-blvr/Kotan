const { base, success, sendError } = require('../../helpers/embeds');
const { formatCoins, formatNumber, capitalize } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

function findItem(query) {
    const q = query.toLowerCase();
    return config.shop.find(
        (item) => item.id === q || item.name.toLowerCase() === q || item.name.toLowerCase().startsWith(q)
    );
}

module.exports = {
    name: 'shop',
    description: 'Shows the item shop. Use "shop buy <item>" to purchase.',
    usage: '[buy <item>]',
    aliases: ['store', 'market'],
    triggers: ['shop'],
    cooldown: 3,
    async execute(message, args) {
        // .shop — list everything
        if (args[0]?.toLowerCase() !== 'buy') {
            const profile = await db.getProfile(message.guild.id, message.author.id);
            const embed = base({
                title: 'Kotan Shop',
                description:
                    `Your wallet: ${formatCoins(profile.wallet)}\n` +
                    `Buy with \`${message.prefix}shop buy <item>\``,
            });
            for (const item of config.shop) {
                const owned = profile.inventory[item.id] || 0;
                embed.addFields({
                    name: `${item.name} — ${formatNumber(item.price)} ${config.economy.currency}`,
                    value: `${item.description}${owned ? `\nOwned: **${owned}**` : ''}`,
                });
            }
            return message.reply({ embeds: [embed] });
        }

        // .shop buy <item>
        const query = args.slice(1).join(' ');
        if (!query) return sendError(message, `What do you want to buy? \`${message.prefix}shop buy <item>\``);
        const item = findItem(query);
        if (!item)
            return sendError(
                message,
                `No item called "${query}". Check \`${message.prefix}shop\` for the list.`
            );

        const profile = await db.getProfile(message.guild.id, message.author.id);
        if (profile.wallet < item.price)
            return sendError(
                message,
                `**${item.name}** costs ${formatCoins(item.price)} — you only have ${formatCoins(profile.wallet)}.`
            );

        profile.wallet -= item.price;
        profile.inventory[item.id] = (profile.inventory[item.id] || 0) + 1;
        await db.saveProfile(message.guild.id, message.author.id, profile);

        return message.reply({
            embeds: [
                success(
                    `You bought **${item.name}** for ${formatCoins(item.price)}.\n` +
                        `Owned: **${profile.inventory[item.id]}** — Wallet left: ${formatCoins(profile.wallet)}`,
                    `${capitalize(item.name)} purchased`
                ),
            ],
        });
    },
};
