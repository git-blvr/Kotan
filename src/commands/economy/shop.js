const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, success, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, formatNumber, capitalize } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const config = require('../../config');

function findItem(items, query) {
    const q = query.toLowerCase();
    return items.find(
        (item) => item.id === q || item.name.toLowerCase() === q || item.name.toLowerCase().startsWith(q)
    );
}

async function run(ctx, itemQuery) {
    const cur = ctx.settings?.economy?.currency || config.economy.currency;
    // A guild can define its own shop in the dashboard — it fully replaces
    // the default catalog when at least one item is configured.
    const items = ctx.settings?.economy?.shop?.length ? ctx.settings.economy.shop : config.shop;

    // no item — list everything
    if (!itemQuery) {
        const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
        const embed = base({
            title: 'Kotan Shop',
            description:
                `Your wallet: ${formatCoins(profile.wallet, cur)}\n` +
                `Buy with \`${ctx.prefix}shop buy <item>\``,
            fields: items.map((item) => {
                const owned = profile.inventory[item.id] || 0;
                return {
                    name: `${item.name} — ${formatNumber(item.price)} ${cur}`,
                    value: `${item.description}${owned ? `\nOwned: **${owned}**` : ''}`,
                };
            }),
        });
        return ctx.reply(cv2(embed));
    }

    const item = findItem(items, itemQuery);
    if (!item)
        return sendError(
            ctx,
            `No item called "${itemQuery}". Check \`${ctx.prefix}shop\` for the list.`
        );

    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
    if (profile.wallet < item.price)
        return sendError(
            ctx,
            `**${item.name}** costs ${formatCoins(item.price, cur)} — you only have ${formatCoins(profile.wallet, cur)}.`
        );

    profile.wallet -= item.price;
    profile.inventory[item.id] = (profile.inventory[item.id] || 0) + 1;
    await db.saveProfile(ctx.guild.id, ctx.user.id, profile);

    return ctx.reply(
        cv2(
            success(
                `You bought **${item.name}** for ${formatCoins(item.price, cur)}.\n` +
                    `Owned: **${profile.inventory[item.id]}** — Wallet left: ${formatCoins(profile.wallet, cur)}`,
                `${capitalize(item.name)} purchased`
            )
        )
    );
}

module.exports = {
    name: 'shop',
    description: 'Shows the item shop. Use "shop buy <item>" to purchase.',
    usage: '[buy <item>]',
    aliases: ['store', 'market'],
    triggers: ['shop'],
    cooldown: 3,
    slash: [
        { name: 'item', description: 'Item to buy — omit to just browse the shop', type: Opt.String },
    ],
    execute: (message, args) =>
        run(fromMessage(message), args[0]?.toLowerCase() === 'buy' ? args.slice(1).join(' ') : null),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getString('item')),
};
