const {
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
} = require('discord.js');
const { sendError } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { dominantColor } = require('../../utils/dominantColor');
const config = require('../../config');

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

        // CV2 container: accent color is the avatar's dominant color.
        const container = new ContainerBuilder()
            .setAccentColor((await dominantColor(png)) ?? config.colors.main)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`## ${user.username}'s avatar`)
            )
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(png))
            )
            .addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
            );

        // Default avatars only exist as PNG — offer formats only for real uploads.
        const buttons = user.avatar
            ? [
                  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('PNG').setURL(png),
                  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('WEBP').setURL(webp),
                  new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('JPG').setURL(jpg),
              ]
            : [new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open full size').setURL(png)];

        container.addActionRowComponents(new ActionRowBuilder().addComponents(...buttons));

        return message.reply({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { repliedUser: false },
        });
    },
};
