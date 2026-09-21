const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { dominantColor } = require('../../utils/dominantColor');
const { xpForLevel } = require('../../utils/leveling');
const db = require('../../utils/database');
const config = require('../../config');

// Text progress bar — 12 segments of ▰/▱.
const bar = (ratio) => {
    const filled = Math.round(Math.min(1, Math.max(0, ratio)) * 12);
    return '`' + '▰'.repeat(filled) + '▱'.repeat(12 - filled) + '`';
};

module.exports = {
    name: 'rank',
    description: 'Shows your (or another member\'s) level and XP progress.',
    usage: '[@user | id]',
    aliases: ['level', 'lvl', 'xp'],
    triggers: ['rank', 'level'],
    cooldown: 3,
    async execute(message, args, client) {
        const user = args[0] ? await resolveUser(client, args[0]) : message.author;
        if (!user) return sendError(message, 'I could not find that user.');
        if (user.bot) return sendError(message, 'Bots do not have ranks.');

        const profile = await db.getProfile(message.guild.id, user.id);
        const needed = xpForLevel(profile.level);
        const top = await db.getTopLevels(message.guild.id, 1000);
        const position = top.findIndex((r) => r.userId === user.id) + 1;

        const avatarUrl = user.displayAvatarURL({ size: 128, extension: 'png' });
        return message.reply(
            cv2(
                base({
                    title: `${user.username}'s rank`,
                    color: (await dominantColor(avatarUrl)) ?? config.colors.main,
                    thumbnail: avatarUrl,
                    description:
                        `**Level ${profile.level}**${position ? ` — #${position} on the leaderboard` : ''}\n` +
                        `${bar(profile.xp / needed)} ${profile.xp} / ${needed} XP`,
                })
            )
        );
    },
};
