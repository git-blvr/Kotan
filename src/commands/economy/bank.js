const { ApplicationCommandOptionType: Opt, PermissionFlagsBits } = require('discord.js');
const { base, success, sendError, cv2 } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { resolveMember } = require('../../helpers/resolve');
const { formatCoins, formatNumber, parseAmount } = require('../../helpers/format');
const E = require('../../utils/emojis');
const db = require('../../utils/database');
const config = require('../../config');

// Global bank — one account per user shared by every server. Money moves
// between the current guild's wallet and the vault.
//
//   .bank                 — your account (bank + wallet + deposit allowance)
//   .bank deposit <n>     — wallet -> bank  (max 250k/day, 1M/month)
//   .bank withdraw <n>    — bank -> wallet
//   .bank top             — richest vaults, globally
//
// Restriction: server owners/admins/managers can't deposit — they can only
// withdraw out of the bank.

const isPrivileged = (ctx) =>
    ctx.member &&
    (ctx.member.id === ctx.guild.ownerId ||
        ctx.member.permissions.has(PermissionFlagsBits.Administrator) ||
        ctx.member.permissions.has(PermissionFlagsBits.ManageGuild));

const cur = (ctx) => ctx.settings?.economy?.currency;

async function showAccount(ctx, user) {
    if (user.bot) return sendError(ctx, 'Bots do not have bank accounts.');
    const [acc, profile] = await Promise.all([db.getBank(user.id), db.getProfile(ctx.guild.id, user.id)]);
    const c = cur(ctx);
    return ctx.reply(
        cv2(
            base({
                color: config.colors.main,
                title: `${E.bank} ${user.username}'s bank`.trim(),
                thumbnail: user.displayAvatarURL({ size: 128, extension: 'png' }),
                fields: [
                    { name: 'Bank (global)', value: formatCoins(acc.balance, c), inline: true },
                    { name: `Wallet (${ctx.guild.name})`, value: formatCoins(profile.wallet, c), inline: true },
                    {
                        name: 'Deposit left',
                        value: `**${formatNumber(db.BANK_DAY_CAP - acc.dayTotal)}** today · **${formatNumber(db.BANK_MONTH_CAP - acc.monthTotal)}** this month`,
                    },
                ],
                footer: 'Bank is shared across all servers — deposits cap at 250k/day, 1M/month',
            })
        )
    );
}

async function deposit(ctx, input) {
    if (isPrivileged(ctx))
        return sendError(ctx, "Server owners and managers can't deposit — your bank only accepts withdrawals.");
    const c = cur(ctx);
    // Both the bank record and the guild wallet move — hold both locks so a
    // concurrent deposit or wallet wager can't interleave the two writes.
    return db.withLocks([`user:${ctx.user.id}`, `wallet:${ctx.guild.id}:${ctx.user.id}`], async () => {
        const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
        // The unearned startBalance portion can't leave the guild — spending
        // it here is fine, banking it launders it into every other server.
        const grantLeft = Math.min(profile.wallet, profile.grant || 0);
        const allowed = profile.wallet - grantLeft;
        const amount = parseAmount(input, allowed);
        if (!amount) return sendError(ctx, `Invalid amount — try \`${ctx.prefix}bank deposit 5000\`, \`50k\`, \`half\` or \`all\`.`);
        if (amount > allowed)
            return sendError(ctx, `${formatCoins(grantLeft, c)} of your wallet is your starting grant — it can be spent in this server but not banked.`);

        const r = await db.bankDeposit(ctx.user.id, amount);
        if (r.err === 'daycap')
            return sendError(ctx, `Daily deposit cap is **${formatNumber(db.BANK_DAY_CAP)}** — **${formatNumber(r.remaining)}** left today.`);
        if (r.err === 'monthcap')
            return sendError(ctx, `Monthly deposit cap is **${formatNumber(db.BANK_MONTH_CAP)}** — **${formatNumber(r.remaining)}** left this month.`);

        profile.wallet -= amount;
        profile.grant = Math.min(profile.grant || 0, profile.wallet);
        await db.saveProfile(ctx.guild.id, ctx.user.id, profile);
        return ctx.reply(
            cv2(
                success(
                    `Deposited ${formatCoins(amount, c)} into your global bank.\n` +
                        `Wallet: ${formatCoins(profile.wallet, c)} · Bank: ${formatCoins(r.bank.balance, c)}`,
                    'Deposit complete'
                )
            )
        );
    });
}

async function withdraw(ctx, input) {
    const c = cur(ctx);
    return db.withLocks([`user:${ctx.user.id}`, `wallet:${ctx.guild.id}:${ctx.user.id}`], async () => {
        const acc = await db.getBank(ctx.user.id);
        const amount = parseAmount(input, acc.balance);
        if (!amount) return sendError(ctx, `Invalid amount — try \`${ctx.prefix}bank withdraw 5000\`, \`50k\`, \`half\` or \`all\`.`);

        const r = await db.bankWithdraw(ctx.user.id, amount);
        if (r.err === 'funds') return sendError(ctx, `Your bank only holds ${formatCoins(acc.balance, c)} — nothing more to withdraw.`);

        const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
        profile.wallet += amount;
        await db.saveProfile(ctx.guild.id, ctx.user.id, profile);
        return ctx.reply(
            cv2(
                success(
                    `Withdrew ${formatCoins(amount, c)} into your ${ctx.guild.name} wallet.\n` +
                        `Wallet: ${formatCoins(profile.wallet, c)} · Bank: ${formatCoins(r.bank.balance, c)}`,
                    'Withdrawal complete'
                )
            )
        );
    });
}

async function top(ctx) {
    const rows = await db.getTopBank(10);
    if (!rows.length) return sendError(ctx, 'Nobody has banked anything yet.');
    const users = [];
    for (const r of rows) {
        const u = ctx.client.users.cache.get(r.userId) || await ctx.client.users.fetch(r.userId).catch(() => null);
        users.push(u);
    }
    const lines = rows.map(
        (r, i) => `**${i + 1}.** ${users[i]?.username ?? `<@${r.userId}>`} — ${formatCoins(r.balance, cur(ctx))}`
    );
    return ctx.reply(
        cv2(base({ color: config.colors.main, title: `${E.bank} Richest vaults — global`.trim(), description: lines.join('\n') }))
    );
}

const AMOUNT_OPT = { name: 'amount', description: 'e.g. 5000, 50k, half, all', type: Opt.String, required: true };

module.exports = {
    name: 'bank',
    description: 'Your global bank — deposit and withdraw coins across every server.',
    usage: '[balance|deposit|withdraw|top] [amount]',
    aliases: ['vault', 'acc'],
    cooldown: 3,
    guildOnly: true,
    slash: [
        { name: 'balance', description: 'Show a bank account', type: Opt.Subcommand, options: [
            { name: 'user', description: 'Whose account (default: you)', type: Opt.User },
        ] },
        { name: 'deposit', description: 'Move coins from wallet to bank', type: Opt.Subcommand, options: [AMOUNT_OPT] },
        { name: 'withdraw', description: 'Move coins from bank to wallet', type: Opt.Subcommand, options: [AMOUNT_OPT] },
        { name: 'top', description: 'Richest vaults globally', type: Opt.Subcommand },
    ],

    execute: async (message, args, client) => {
        const ctx = fromMessage(message, { client });
        const sub = (args[0] || 'balance').toLowerCase();
        const rest = args.slice(1);
        if (['deposit', 'dep', 'd'].includes(sub)) return deposit(ctx, rest[0]);
        if (['withdraw', 'with', 'w'].includes(sub)) return withdraw(ctx, rest[0]);
        if (['top', 'lb', 'leaderboard'].includes(sub)) return top(ctx);
        if (['balance', 'bal', 'b'].includes(sub)) {
            const target = rest.length ? await resolveMember(message, rest[0]).then((m) => m?.user ?? null) : null;
            if (rest.length && !target) return sendError(ctx, `I can't find \`${rest[0]}\` in this server.`);
            return showAccount(ctx, target || ctx.user);
        }
        return sendError(ctx, `Unknown option — try \`${ctx.prefix}bank\`, \`deposit\`, \`withdraw\` or \`top\`.`);
    },

    executeSlash: (i) => {
        const ctx = fromInteraction(i);
        switch (i.options.getSubcommand()) {
            case 'balance': return showAccount(ctx, i.options.getUser('user') ?? i.user);
            case 'deposit': return deposit(ctx, i.options.getString('amount'));
            case 'withdraw': return withdraw(ctx, i.options.getString('amount'));
            case 'top': return top(ctx);
        }
    },
};
