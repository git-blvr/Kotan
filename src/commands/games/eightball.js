const { base, sendError, cv2 } = require('../../helpers/embeds');
const config = require('../../config');

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

module.exports = {
    name: '8ball',
    description: 'Ask the magic 8-ball a question.',
    usage: '<question>',
    aliases: ['eightball', '8b'],
    triggers: ['8ball'],
    guildOnly: false,
    cooldown: 3,
    async execute(message, args) {
        const question = args.join(' ');
        if (!question) return sendError(message, `Ask me something: \`${message.prefix}8ball <question>\``);

        const answer = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
        return message.reply(
            cv2(
                base({
                    title: '🎱 8-ball',
                    color: config.colors[answer.tone],
                    description: `**${question}**\n${answer.text}`,
                })
            )
        );
    },
};
