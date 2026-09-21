const { base, cv2 } = require('../../helpers/embeds');
const db = require('../../utils/database');
const config = require('../../config');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
    name: 'leaderboard',
    description: 'Shows the top 10 members by level.',
    usage: '',
    aliases: ['lb', 'top', 'levels', 'ranking'],
    triggers: ['lb', 'leaderboard'],
    cooldown: 10,
    async execute(message, args, client) {
        const rows = await db.getTopLevels(message.guild.id, 10);
        const active = rows.filter((r) => r.level > 0 || r.xp > 0);
        if (!active.length)
            return message.reply(
                cv2(
                    base({
                        title: 'Leaderboard',
                        description: 'Nobody has earned XP yet — enable leveling on the dashboard and start chatting.',
                    })
                )
            );

        const lines = [];
        for (const [i, row] of active.entries()) {
            const user = await client.users.fetch(row.userId).catch(() => null);
            const name = user ? user.username : row.userId;
            lines.push(
                `${MEDALS[i] || `**${i + 1}.**`} **${name}** — Level ${row.level} · ${row.xp} XP`
            );
        }

        return message.reply(
            cv2(
                base({
                    title: `Leaderboard — ${message.guild.name}`,
                    color: config.colors.main,
                    description: lines.join('\n'),
                })
            )
        );
    },
};
