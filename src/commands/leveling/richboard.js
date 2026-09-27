const { base, cv2 } = require('../../helpers/embeds');
const { formatCoins } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const config = require('../../config');

const MEDALS = ['🥇', '🥈', '🥉'];

async function run(ctx) {
    const cur = ctx.settings?.economy?.currency;
    const rows = (await db.getTopRich(ctx.guild.id, 10)).filter((r) => r.total > 0);
    if (!rows.length)
        return ctx.reply(cv2(base({ title: 'Richboard', description: 'Nobody has any coins yet.' })));

    const lines = [];
    for (const [i, row] of rows.entries()) {
        const user = await ctx.client.users.fetch(row.userId).catch(() => null);
        const name = user ? user.username : row.userId;
        lines.push(
            `${MEDALS[i] || `**${i + 1}.**`} **${name}** — ${formatCoins(row.total, cur)}`
        );
    }

    return ctx.reply(
        cv2(
            base({
                title: `Richboard — ${ctx.guild.name}`,
                color: config.colors.success,
                description: lines.join('\n'),
            })
        )
    );
}

module.exports = {
    name: 'richboard',
    description: 'Shows the top 10 richest members by wallet.',
    usage: '',
    aliases: ['rb', 'richest', 'baltop', 'moneytop'],
    triggers: ['rb', 'richboard'],
    cooldown: 10,
    slash: [],
    execute: (message, args, client) => run(fromMessage(message, { client })),
    executeSlash: (interaction, client) => run(fromInteraction(interaction, { client })),
};
