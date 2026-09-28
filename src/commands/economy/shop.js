const {
    ApplicationCommandOptionType: Opt,
    ContainerBuilder,
    SectionBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    MessageFlags,
} = require('discord.js');
const { success, error, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, capitalize } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const inv = require('../../helpers/inv');
const db = require('../../utils/database');
const config = require('../../config');
const logger = require('../../utils/logger');

const text = (c) => new TextDisplayBuilder().setContent(c);
const accentOf = (shop) =>
    (shop?.color ? parseInt(String(shop.color).replace('#', ''), 16) : NaN) || config.colors.main;

// One-line blurb under an item describing its effect.
function itemBlurb(item, cur) {
    switch (item.cat) {
        case 'multipliers':
            return `×${item.mult || 2} ${item.kind === 'xp' ? 'XP' : 'coins'} for ${item.mins >= 60 ? `${Math.round(item.mins / 60)}h` : `${item.mins || 60}m`}`;
        case 'roles':
            return item.type === 'crate'
                ? `Random payout: ${formatCoins(item.min ?? 0, cur)} – ${formatCoins(item.max ?? 0, cur)}`
                : `Grants the <@&${item.roleId}> role`;
        default:
            return 'Collectible — sits in your inventory.';
    }
}

const shopSelect = (uid, cats, placeholder = 'Browse categories…') =>
    new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`shop:cat:${uid}`)
            .setPlaceholder(placeholder)
            .addOptions(
                cats.map((c) => ({
                    label: c.name.slice(0, 100),
                    value: c.id,
                    description: `${c.items.length} item${c.items.length === 1 ? '' : 's'}`,
                }))
            )
    );

// Landing view — homepage text from the dashboard editor + category menu.
function homeView(uid, shop, cats, profile, cur) {
    const c = new ContainerBuilder().setAccentColor(accentOf(shop));
    const head = [`## ${shop?.title || 'Shop'}`];
    if (shop?.description) head.push(shop.description);
    head.push(`-# Your wallet: ${formatCoins(profile.wallet, cur)}`);
    c.addTextDisplayComponents(text(head.join('\n')));
    if (cats.length) c.addActionRowComponents(shopSelect(uid, cats));
    else c.addTextDisplayComponents(text('-# Nothing for sale yet — items are configured on the dashboard.'));
    return c;
}

// Category view — each item is a Section with a Buy button accessory.
// Kept under the 10-component container cap (1 header + 7 items + menu).
function catView(uid, cats, cat, profile, cur, accent, notice) {
    const c = new ContainerBuilder().setAccentColor(accent);
    c.addTextDisplayComponents(
        text(
            (notice ? `${notice}\n` : '') +
                `## ${cat.name}\n-# Your wallet: ${formatCoins(profile.wallet, cur)}`
        )
    );
    for (const item of cat.items.slice(0, 7)) {
        c.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    text(
                        `**${item.name}** — ${formatCoins(item.price, cur)}\n-# ${item.desc || itemBlurb(item, cur)}`
                    )
                )
                .setButtonAccessory(
                    new ButtonBuilder()
                        .setCustomId(`shop:buy:${uid}:${item.id}`)
                        .setLabel('Buy')
                        .setStyle(ButtonStyle.Secondary)
                )
        );
    }
    c.addActionRowComponents(shopSelect(uid, cats, 'Switch category…'));
    return c;
}

// Applies the purchased item's effect to the profile. Throws on delivery
// failure (e.g. missing role perms) so the caller can refund.
async function applyItem(member, guild, item, profile, cur) {
    switch (item.cat) {
        case 'multipliers': {
            const kind = item.kind === 'xp' ? 'xp' : 'coins';
            const m = inv.activateMult(profile, kind, item.mult, item.mins);
            return `**${item.name}** — ${kind === 'xp' ? 'XP' : 'coin'} gains boosted ×${m.mult} for ${inv.fmtLeft(m.until)}.`;
        }
        case 'roles': {
            if (item.type === 'crate') {
                const lo = Math.max(0, +item.min || 0);
                const hi = Math.max(lo, +item.max || 0);
                const win = lo + Math.floor(Math.random() * (hi - lo + 1));
                profile.wallet += win;
                return `**${item.name}** opened — it contained ${formatCoins(win, cur)}!`;
            }
            await member.roles.add(item.roleId, 'Kotan shop purchase');
            return `**${item.name}** — you received the <@&${item.roleId}> role.`;
        }
        default:
            profile.inventory[item.id] = (profile.inventory[item.id] || 0) + 1;
            return `**${item.name}** — you now own **${profile.inventory[item.id]}**.`;
    }
}

// Shared buy path for prefix arg and Buy buttons. Returns {err} or {msg,profile}.
async function buy({ guild, member, user }, item, cur) {
    const profile = await db.getProfile(guild.id, user.id);
    if (profile.wallet < item.price)
        return { err: `**${item.name}** costs ${formatCoins(item.price, cur)} — you only have ${formatCoins(profile.wallet, cur)}.` };
    profile.wallet -= item.price;
    let msg;
    try {
        msg = await applyItem(member, guild, item, profile, cur);
    } catch (e) {
        logger.warn(`shop delivery failed (${item.id}): ${e.message}`);
        return { err: `Couldn't deliver **${item.name}** — nothing was charged.` };
    }
    await db.saveProfile(guild.id, user.id, profile);
    return { msg: `${msg}\n-# Wallet left: ${formatCoins(profile.wallet, cur)}`, profile };
}

const ephemeral = (payload) => ({
    ...payload,
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
});

async function run(ctx, itemQuery) {
    const cur = ctx.settings?.economy?.currency || config.economy.currency;
    const shop = ctx.settings?.shop;
    if (shop?.enabled === false) return sendError(ctx, 'The shop is disabled in this server.');
    const cats = inv.catalog(ctx.settings);

    // `.shop buy <item>` — direct purchase without opening the browser.
    if (itemQuery) {
        const item = inv.findItem(cats, itemQuery);
        if (!item)
            return sendError(ctx, `No item called "${itemQuery}". Check \`${ctx.prefix}shop\` for the list.`);
        const res = await buy({ guild: ctx.guild, member: ctx.member, user: ctx.user }, item, cur);
        if (res.err) return sendError(ctx, res.err);
        return ctx.reply(cv2(success(res.msg, `${capitalize(item.name)} purchased`)));
    }

    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
    return ctx.reply(cv2(homeView(ctx.user.id, shop, cats, profile, cur)));
}

async function executeComponent(i) {
    const [, step, uid, ...rest] = i.customId.split(':');
    if (i.user.id !== uid)
        return i
            .reply(ephemeral(cv2(error('That shop belongs to someone else — run /shop yourself.'))))
            .catch(() => {});

    const settings = await db.getGuildSettings(i.guildId);
    const cats = inv.catalog(settings);
    const cur = settings.economy?.currency || config.economy.currency;
    const accent = accentOf(settings.shop);
    const profile = await db.getProfile(i.guildId, uid);

    if (step === 'cat') {
        const cat = cats.find((c) => c.id === i.values?.[0]);
        return i
            .update(cv2(cat ? catView(uid, cats, cat, profile, cur, accent) : homeView(uid, settings.shop, cats, profile, cur)))
            .catch(() => {});
    }

    if (step === 'buy') {
        const item = inv.allItems(cats).find((x) => x.id === rest.join(':'));
        if (!item)
            return i.reply(ephemeral(cv2(error('That item no longer exists — the shop was updated.')))).catch(() => {});
        const res = await buy({ guild: i.guild, member: i.member, user: i.user }, item, cur);
        // Re-render the same category with the result pinned on top.
        const cat = cats.find((c) => c.id === item.cat);
        const notice = res.err ? `⚠️ ${res.err}` : `✅ ${res.msg}`;
        const fresh = res.profile || (await db.getProfile(i.guildId, uid));
        return i
            .update(
                cat
                    ? cv2(catView(uid, cats, cat, fresh, cur, accent, notice))
                    : cv2(homeView(uid, settings.shop, cats, fresh, cur))
            )
            .catch(() => {});
    }
}

module.exports = {
    name: 'shop',
    description: 'Browse the item shop — categories, boosters, roles and crates.',
    usage: '[buy <item>]',
    aliases: ['store', 'market'],
    triggers: ['shop'],
    cooldown: 3,
    slash: [
        { name: 'item', description: 'Item to buy — omit to browse the shop', type: Opt.String },
    ],
    execute: (message, args) =>
        run(fromMessage(message), args[0]?.toLowerCase() === 'buy' ? args.slice(1).join(' ') : args.join(' ') || null),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getString('item')),
    executeComponent,
};
