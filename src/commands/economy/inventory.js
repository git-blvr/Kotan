const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const { cv2 } = require('../../helpers/embeds');
const { formatCoins } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const inv = require('../../helpers/inv');
const db = require('../../utils/database');
const config = require('../../config');

const text = (c) => new TextDisplayBuilder().setContent(c);
const div = () => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);

async function run(ctx) {
    const cur = ctx.settings?.economy?.currency || config.economy.currency;
    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);

    // Resolve item ids to names via the current catalog; unknown ids (items
    // removed from the shop after purchase) show their raw id.
    const names = {};
    for (const i of inv.allItems(inv.catalog(ctx.settings))) names[i.id] = i.name;

    const owned = Object.entries(profile.inventory || {}).filter(([, n]) => n > 0);
    const boosts = ['coins', 'xp']
        .map((k) => ({ k, m: profile.mults?.[k] }))
        .filter((x) => x.m?.until > Date.now());

    const body = [`-# Wallet: ${formatCoins(profile.wallet, cur)}`];
    const c = new ContainerBuilder().setAccentColor(config.colors.main);
    c.addTextDisplayComponents(text(`## ${ctx.user.username}'s Inventory\n${body.join('\n')}`));

    c.addTextDisplayComponents(
        text(
            owned.length
                ? owned.map(([id, n]) => `**${names[id] || id}** ×${n}`).join('\n')
                : '-# No items yet — check `/shop`.'
        )
    );

    c.addSeparatorComponents(div());
    c.addTextDisplayComponents(
        text(
            boosts.length
                ? boosts.map((x) => `**${x.k === 'xp' ? 'XP' : 'Coins'} ×${x.m.mult}** — ${inv.fmtLeft(x.m.until)} left`).join('\n')
                : '-# No active boosters.'
        )
    );

    return ctx.reply(cv2(c));
}

module.exports = {
    name: 'inventory',
    description: 'Shows your purchased items and active boosters.',
    usage: '',
    aliases: ['inv', 'bag'],
    triggers: ['inventory', 'inv'],
    cooldown: 3,
    slash: [],
    execute: (message) => run(fromMessage(message)),
    executeSlash: (interaction) => run(fromInteraction(interaction)),
};
