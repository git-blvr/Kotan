const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { formatCoins } = require('../../helpers/format');
const db = require('../../utils/database');
const { dominantColor } = require('../../utils/dominantColor');
const { xpForLevel } = require('../../utils/leveling');
const config = require('../../config');

module.exports = {
    name: 'balance',
    description: 'Shows your (or another user\'s) wallet, level and rankings.',
    usage: '[@user | id]',
    aliases: ['bal', 'wallet', 'money', 'cash'],
    triggers: ['bal', 'balance'],
    cooldown: 3,
    async execute(message, args, client) {
        const user = args[0] ? await resolveUser(client, args[0]) : message.author;
        if (!user) return sendError(message, 'I could not find that user.');
        if (user.bot) return sendError(message, 'Bots do not have a balance.');

        const [profile, topLevels, topRich] = await Promise.all([
            db.getProfile(message.guild.id, user.id),
            db.getTopLevels(message.guild.id, 1000),
            db.getTopRich(message.guild.id, 1000),
        ]);
        const cur = message.guildSettings?.economy?.currency || config.economy.currency;

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
                { name: 'Level', value: `**${profile.level}**`, inline: true },
                { name: 'XP', value: `**${profile.xp}/${needed}**`, inline: true },
            ],
        });
        return message.reply(cv2(embed));
    },
};
