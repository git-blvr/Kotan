const { EmbedBuilder } = require('discord.js');
const config = require('../config');

// Embed factories so every command produces consistent-looking output.
// Usage: message.reply({ embeds: [success('Done!')] })

function base(options = {}) {
    const embed = new EmbedBuilder()
        .setColor(options.color ?? config.colors.main)
        .setTimestamp();
    if (options.title) embed.setTitle(options.title);
    if (options.description) embed.setDescription(options.description);
    if (options.fields?.length) embed.addFields(options.fields);
    if (options.thumbnail) embed.setThumbnail(options.thumbnail);
    if (options.image) embed.setImage(options.image);
    if (options.author) embed.setAuthor(options.author);
    if (options.footer) embed.setFooter(options.footer);
    if (options.url) embed.setURL(options.url);
    return embed;
}

const info = (description, title = 'Kotan') =>
    base({ color: config.colors.main, title, description });

const success = (description, title = 'Success') =>
    base({ color: config.colors.success, title, description });

const error = (description, title = 'Error') =>
    base({ color: config.colors.error, title, description });

const warning = (description, title = 'Warning') =>
    base({ color: config.colors.warning, title, description });

// Shortcut used all over commands and the message handler for user-facing
// failures. Always resolves so callers can safely `return sendError(...)`.
function sendError(message, description) {
    return message
        .reply({ embeds: [error(description)], allowedMentions: { repliedUser: false } })
        .catch(() => {});
}

module.exports = { base, info, success, error, warning, sendError };
