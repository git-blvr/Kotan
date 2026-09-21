const { base, cv2 } = require('../../helpers/embeds');
const { formatCoins } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

const MEDALS = ['🥇', '🥈', '🥉'];

module.exports = {
    name: 'richboard',
    description: 'Shows the top 10 richest members by wallet.',
    usage: '',
    aliases: ['rb', 'richest', 'baltop', 'moneytop'],
    triggers: ['rb', 'richboard'],
    cooldown: 10,
    async execute(message, args, client) {
        const cur = message.guildSettings?.economy?.currency;
        const rows = (await db.getTopRich(message.guild.id, 10)).filter((r) => r.total > 0);
        if (!rows.length)
            return message.reply(
                cv2(base({ title: 'Richboard', description: 'Nobody has any coins yet.' }))
            );

        const lines = [];
        for (const [i, row] of rows.entries()) {
            const user = await client.users.fetch(row.userId).catch(() => null);
            const name = user ? user.username : row.userId;
            lines.push(
                `${MEDALS[i] || `**${i + 1}.**`} **${name}** — ${formatCoins(row.total, cur)}`
            );
        }

        return message.reply(
            cv2(
                base({
                    title: `Richboard — ${message.guild.name}`,
                    color: config.colors.success,
                    description: lines.join('\n'),
                })
            )
        );
    },
};
