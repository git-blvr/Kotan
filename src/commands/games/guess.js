const { base, cv2 } = require('../../helpers/embeds');
const { awaitReply } = require('../../helpers/collect');
const { formatCoins } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const config = require('../../config');

const MAX_NUMBER = 50;
const TRIES = 4;
const REWARD = 150;

async function run(ctx) {
    const target = 1 + Math.floor(Math.random() * MAX_NUMBER);
    const cur = ctx.settings?.economy?.currency;
    const filter = (m) => m.author.id === ctx.user.id && /^\d+$/.test(m.content.trim());

    await ctx.reply(
        cv2(
            base({
                title: 'Number Guess',
                description:
                    `I'm thinking of a number between **1** and **${MAX_NUMBER}**.\n` +
                    `You have **${TRIES}** guesses, 30s each. Prize: ${formatCoins(REWARD, cur)}.`,
            })
        )
    );

    for (let left = TRIES; left > 0; left--) {
        const guess = await awaitReply(ctx.channel, filter, 30_000);
        if (!guess)
            return ctx.channel.send(
                cv2(base({ color: config.colors.warning, description: `Time's up — it was **${target}**.` }))
            );

        const n = Number.parseInt(guess.content.trim(), 10);
        if (n === target) {
            const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
            profile.wallet += REWARD;
            await db.saveProfile(ctx.guild.id, ctx.user.id, profile);
            return ctx.channel.send(
                cv2(
                    base({
                        color: config.colors.success,
                        description: `🎯 **${ctx.user.username}** got it — **${target}**! Won ${formatCoins(REWARD, cur)}.`,
                    })
                )
            );
        }
        await ctx.channel
            .send(`**${n}** is too ${n < target ? 'low' : 'high'} — ${left - 1} ${left - 1 === 1 ? 'guess' : 'guesses'} left.`)
            .catch(() => {});
    }

    return ctx.channel.send(
        cv2(base({ color: config.colors.error, description: `Out of guesses — it was **${target}**.` }))
    );
}

module.exports = {
    name: 'guess',
    description: `I'm thinking of a number 1-${MAX_NUMBER} — guess it in ${TRIES} tries to win coins.`,
    usage: '',
    aliases: ['guessnumber', 'guessthenumber'],
    triggers: ['guess'],
    cooldown: 10,
    slash: [],
    execute: (message) => run(fromMessage(message)),
    executeSlash: (interaction) => run(fromInteraction(interaction)),
};
