const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { dominantColor, toHex } = require('../../utils/dominantColor');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx, user) {
    // Priority: attached image > picked/mentioned user > your own avatar
    const attachment = ctx.attachments.find((a) => a.contentType?.startsWith('image/'));
    let source;
    let label;

    if (attachment) {
        source = attachment.url;
        label = 'Attached image';
    } else {
        if (!user) return sendError(ctx, 'I could not find that user.');
        source = user.displayAvatarURL({ size: 256, extension: 'png' });
        label = `${user.username}'s avatar`;
    }

    const color = await dominantColor(source);
    if (color === null)
        return sendError(ctx, 'I could not read that image. Attach a valid image or mention a user.');

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
    return ctx.reply(cv2(embed));
}

module.exports = {
    name: 'color',
    description: 'Extracts the dominant color of an image attachment or a user\'s avatar.',
    usage: '[@user | id] (or attach an image)',
    aliases: ['dominantcolor', 'colour'],
    triggers: ['color'],
    cooldown: 5,
    slash: [
        { name: 'user', description: 'Use this user\'s avatar', type: Opt.User },
        { name: 'image', description: 'Or attach an image to analyze', type: Opt.Attachment },
    ],
    execute: async (message, args, client) =>
        run(fromMessage(message, { client }), args[0] ? await resolveUser(client, args[0]) : message.author),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getUser('user') ??
                (interaction.options.getAttachment('image') ? null : interaction.user)
        ),
};
