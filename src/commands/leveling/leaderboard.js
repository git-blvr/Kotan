const { base, cv2 } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const config = require('../../config');

const MEDALS = ['🥇', '🥈', '🥉'];

async function run(ctx) {
    const rows = await db.getTopLevels(ctx.guild.id, 10);
    const active = rows.filter((r) => r.level > 0 || r.xp > 0);
    if (!active.length)
        return ctx.reply(
            cv2(
                base({
                    title: 'Leaderboard',
                    description: 'Nobody has earned XP yet — enable leveling and start chatting.',
                })
            )
        );

    const lines = [];
    for (const [i, row] of active.entries()) {
        const user = await ctx.client.users.fetch(row.userId).catch(() => null);
        const name = user ? user.username : row.userId;
        lines.push(
            `${MEDALS[i] || `**${i + 1}.**`} **${name}** — Level ${row.level} · ${row.xp} XP`
        );
    }

    return ctx.reply(
        cv2(
            base({
                title: `Leaderboard — ${ctx.guild.name}`,
                color: config.colors.main,
                description: lines.join('\n'),
            })
        )
    );
}

module.exports = {
    name: 'leaderboard',
    description: 'Shows the top 10 members by level.',
    usage: '',
    aliases: ['lb', 'top', 'levels', 'ranking'],
    triggers: ['lb', 'leaderboard'],
    cooldown: 10,
    slash: [],
    execute: (message, args, client) => run(fromMessage(message, { client })),
    executeSlash: (interaction, client) => run(fromInteraction(interaction, { client })),
};
