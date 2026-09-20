const { base, sendError } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { dominantColor, toHex } = require('../../utils/dominantColor');

module.exports = {
    name: 'color',
    description: 'Extracts the dominant color of an image attachment or a user\'s avatar.',
    usage: '[@user | id] (or attach an image)',
    aliases: ['dominantcolor', 'colour'],
    triggers: ['color'],
    cooldown: 5,
    async execute(message, args, client) {
        // Priority: attached image > @user/id > your own avatar
        const attachment = message.attachments.find((a) => a.contentType?.startsWith('image/'));
        let source;
        let label;

        if (attachment) {
            source = attachment.url;
            label = 'Attached image';
        } else {
            const user = args[0] ? await resolveUser(client, args[0]) : message.author;
            if (!user) return sendError(message, 'I could not find that user.');
            source = user.displayAvatarURL({ size: 256, extension: 'png' });
            label = `${user.username}'s avatar`;
        }

        const color = await dominantColor(source);
        if (color === null)
            return sendError(message, 'I could not read that image. Attach a valid image or mention a user.');

        // The embed itself is tinted with the extracted color — it demos itself.
        const embed = base({
            title: 'Dominant Color',
            description:
                `Source: ${label}\n` +
                `Hex: \`${toHex(color)}\`\nInt: \`${color}\`\n\n` +
                `Use it anywhere a color is accepted:\n` +
                `\`embed.setColor(${color})\` / \`container.setAccentColor(${color})\``,
            color,
            thumbnail: source,
        });
        return message.reply({ embeds: [embed] });
    },
};
