const { base, sendError } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { dominantColor } = require('../../utils/dominantColor');

module.exports = {
    name: 'avatar',
    description: 'Shows a user\'s avatar in full size.',
    usage: '[@user | id]',
    aliases: ['av', 'pfp'],
    triggers: ['av'],
    cooldown: 3,
    async execute(message, args, client) {
        const user = args[0] ? await resolveUser(client, args[0]) : message.author;
        if (!user) return sendError(message, 'I could not find that user.');

        const png = user.displayAvatarURL({ size: 1024, extension: 'png' });
        const webp = user.displayAvatarURL({ size: 1024 });
        const jpg = user.displayAvatarURL({ size: 1024, extension: 'jpg' });

        const embed = base({
            title: `${user.username}'s avatar`,
            description: `[PNG](${png}) | [WEBP](${webp}) | [JPG](${jpg})`,
            image: png,
            color: (await dominantColor(png)) ?? undefined,
        });
        return message.reply({ embeds: [embed] });
    },
};
