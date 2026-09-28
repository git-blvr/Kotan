const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { base, cv2 } = require('../helpers/embeds');

// Welcome/goodbye payload rendering — the dashboard configures either a plain
// text message or a rich card (classic embed or CV2 container). Placeholders
// are applied to every text field.

const fmt = (template, member) =>
    String(template ?? '')
        .replaceAll('{user}', `${member}`) // mention
        .replaceAll('{username}', member.user.username)
        .replaceAll('{server}', member.guild.name)
        .replaceAll('{members}', String(member.guild.memberCount));

// Returns a send()-ready payload for one side (join or leave).
// `embed` is the configured payload object; `fallback` is the plain message.
function memberPayload(member, embed, fallback) {
    if (embed?.enabled) {
        const color = embed.color ? parseInt(embed.color, 16) : config.colors.main;
        const thumb = embed.thumbnail ? member.user.displayAvatarURL({ size: 128 }) : null;
        if (embed.style === 'cv2') {
            const container = base({
                color,
                title: fmt(embed.title, member) || undefined,
                description: fmt(embed.description, member) || undefined,
                footer: embed.footer ? { text: fmt(embed.footer, member) } : undefined,
                thumbnail: thumb || undefined,
            });
            return cv2(container);
        }
        const e = new EmbedBuilder().setColor(color);
        if (embed.title) e.setTitle(fmt(embed.title, member));
        if (embed.description) e.setDescription(fmt(embed.description, member));
        if (embed.footer) e.setFooter({ text: fmt(embed.footer, member) });
        if (thumb) e.setThumbnail(thumb);
        return { embeds: [e] };
    }
    return fmt(fallback, member);
}

module.exports = { fmt, memberPayload };
