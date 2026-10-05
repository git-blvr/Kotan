const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const config = require('../../config');
const E = require('../../utils/emojis');

const ANSWERS = [
    { text: 'Yes, definitely.', tone: 'success' },
    { text: 'Without a doubt.', tone: 'success' },
    { text: 'Signs point to yes.', tone: 'success' },
    { text: 'Most likely.', tone: 'success' },
    { text: 'As I see it, yes.', tone: 'success' },
    { text: 'Ask again later.', tone: 'warning' },
    { text: 'Cannot predict now.', tone: 'warning' },
    { text: 'Concentrate and ask again.', tone: 'warning' },
    { text: 'Reply hazy, try again.', tone: 'warning' },
    { text: "Don't count on it.", tone: 'error' },
    { text: 'My reply is no.', tone: 'error' },
    { text: 'Outlook not so good.', tone: 'error' },
    { text: 'Very doubtful.', tone: 'error' },
];

async function run(ctx, question) {
    if (!question) return sendError(ctx, `Ask me something: \`${ctx.prefix}8ball <question>\``);

    const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
    return ctx.reply(
        cv2(
            base({
                title: `${E.eightball} 8-ball`.trim(),
                color: config.colors[answer.tone],
                description: `**${question}**\n${answer.text}`,
            })
        )
    );
}

module.exports = {
    name: '8ball',
    description: 'Ask the magic 8-ball a question.',
    usage: '<question>',
    aliases: ['eightball', '8b'],
    triggers: ['8ball'],
    guildOnly: false,
    cooldown: 3,
    slash: [
        { name: 'question', description: 'What do you want to ask?', type: Opt.String, required: true },
    ],
    execute: (message, args) => run(fromMessage(message), args.join(' ')),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getString('question')),
};
