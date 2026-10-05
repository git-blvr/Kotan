const {
    ContainerBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MessageFlags,
} = require('discord.js');
const config = require('../config');
const E = require('../utils/emojis');

// Component V2 factories so every command produces consistent-looking output.
// Usage: message.reply(cv2(success('Done!')))

const text = (content) => new TextDisplayBuilder().setContent(content);
const divider = () =>
    new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true);

// Wraps CV2 components into a ready-to-send payload — works for reply, send
// and edit. The flag is what turns the message into a components message.
// Mentions render but never ping — bot output shouldn't notify anyone.
const cv2 = (...components) => ({
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { repliedUser: false, users: [], roles: [], everyone: false },
});

function base(options = {}) {
    const container = new ContainerBuilder();
    // color === false means "no accent bar" (the editor's color mode none).
    if (options.color !== false) container.setAccentColor(options.color ?? config.colors.main);

    const head = [];
    if (options.author) head.push(`-# ${options.author.name ?? options.author}`);
    if (options.title)
        head.push(options.url ? `## [${options.title}](${options.url})` : `## ${options.title}`);
    if (options.description) head.push(options.description);

    if (options.thumbnail && head.length) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(text(head.join('\n')))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(options.thumbnail))
        );
    } else if (head.length) {
        container.addTextDisplayComponents(text(head.join('\n')));
    }

    if (options.fields?.length) {
        if (head.length) container.addSeparatorComponents(divider());
        // Inline fields collapse into one wrapped line separated by middots;
        // block fields get their own display with the name above the value.
        let inline = [];
        const flush = () => {
            if (inline.length) container.addTextDisplayComponents(text(inline.join('  ·  ')));
            inline = [];
        };
        for (const f of options.fields) {
            if (f.inline) {
                inline.push(`**${f.name}:** ${f.value}`);
                continue;
            }
            flush();
            container.addTextDisplayComponents(text(`**${f.name}**\n${f.value}`));
        }
        flush();
    }

    if (options.image) {
        if (head.length || options.fields?.length) container.addSeparatorComponents(divider());
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(options.image))
        );
    }

    if (options.footer)
        container.addTextDisplayComponents(text(`-# ${options.footer.text ?? options.footer}`));

    return container;
}

// Emoji-prefix helper — "" when the app emoji isn't uploaded yet, so the
// text never picks up a stray leading space.
const tag = (emoji, str) => (emoji ? `${emoji} ${str}` : str);

const info = (description, title = 'Kotan') =>
    base({ color: config.colors.main, title: tag(E.info, title), description });

const success = (description, title = 'Success') =>
    base({ color: config.colors.success, title: tag(E.check, title), description });

// Errors and warnings are one-liners: accent-colored container, description
// text only, no title — they should glance, not headline.
const error = (description) => base({ color: config.colors.error, description: tag(E.cross, description) });
const warning = (description) => base({ color: config.colors.warning, description: tag(E.warn, description) });

// Shortcut used all over commands and the message handler for user-facing
// failures. Always resolves so callers can safely `return sendError(...)`.
function sendError(message, description) {
    return message.reply(cv2(error(description))).catch(() => {});
}

module.exports = { base, info, success, error, warning, sendError, cv2 };
