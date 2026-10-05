const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { formatCoins } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const { dominantColor } = require('../../utils/dominantColor');
const { xpForLevel } = require('../../utils/leveling');
const config = require('../../config');

async function run(ctx, user) {
    if (!user) return sendError(ctx, 'I could not find that user.');
    if (user.bot) return sendError(ctx, 'Bots do not have a balance.');

    const [profile, topLevels, topRich, bankAcc] = await Promise.all([
        db.getProfile(ctx.guild.id, user.id),
        db.getTopLevels(ctx.guild.id, 1000),
        db.getTopRich(ctx.guild.id, 1000),
        db.getBank(user.id),
    ]);
    const cur = ctx.settings?.economy?.currency || config.economy.currency;

    const lbPos = topLevels.findIndex((r) => r.userId === user.id) + 1;
    const rbPos = topRich.findIndex((r) => r.userId === user.id) + 1;
    const needed = xpForLevel(profile.level);

    const avatarUrl = user.displayAvatarURL({ size: 128, extension: 'png' });
    const embed = base({
        color: (await dominantColor(avatarUrl)) ?? config.colors.main,
        title: `${user.username}'s balance`,
        thumbnail: avatarUrl,
        description:
            `Top **#${lbPos || '—'}** on Leaderboard\n` +
            `Top **#${rbPos || '—'}** on Richboard`,
        fields: [
            { name: 'Wallet', value: formatCoins(profile.wallet, cur), inline: true },
            { name: 'Bank (global)', value: formatCoins(bankAcc.balance, cur), inline: true },
            { name: 'Level', value: `**${profile.level}**`, inline: true },
            { name: 'XP', value: `**${profile.xp}/${needed}**`, inline: true },
        ],
    });
    return ctx.reply(cv2(embed));
}

module.exports = {
    name: 'balance',
    description: 'Shows your (or another user\'s) wallet, level and rankings.',
    usage: '[@user | id]',
    aliases: ['bal', 'wallet', 'money', 'cash'],
    triggers: ['bal', 'balance'],
    cooldown: 3,
    slash: [
        { name: 'user', description: 'Whose balance to show (default: you)', type: Opt.User },
    ],
    execute: async (message, args, client) =>
        run(fromMessage(message, { client }), args[0] ? await resolveUser(client, args[0]) : message.author),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getUser('user') ?? interaction.user),
};
