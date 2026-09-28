const {
    EmbedBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');
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
        .replaceAll('{members}', String(member.guild.memberCount))
        .replaceAll('{boosts}', String(member.guild.premiumSubscriptionCount || 0));

// Image fields accept a URL or {avatar} / {icon} placeholders.
const imgUrl = (v, member) =>
    String(v || '')
        .replaceAll('{avatar}', member.user.displayAvatarURL({ size: 256 }))
        .replaceAll('{icon}', member.guild.iconURL({ size: 256 }) || '');

const isHttp = (u) => /^https?:\/\//i.test(u);

// Builds the CV2 container from the dragged-together component list.
// Unknown/broken pieces are skipped rather than failing the whole send.
function cv2Card(member, embed, color) {
    const container = base({ color });
    for (const c of embed.components) {
        try {
            switch (c.type) {
                case 'text':
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(fmt(c.text, member) || ' ')
                    );
                    break;
                case 'heading':
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# ${fmt(c.text, member)}`)
                    );
                    break;
                case 'separator':
                    container.addSeparatorComponents(
                        new SeparatorBuilder()
                            .setSpacing(c.size === 'large' ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small)
                            .setDivider(true)
                    );
                    break;
                case 'image': {
                    const url = imgUrl(c.url, member);
                    if (isHttp(url))
                        container.addMediaGalleryComponents(
                            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url))
                        );
                    break;
                }
                case 'section': {
                    const sec = new SectionBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(fmt(c.text, member) || ' ')
                    );
                    const img = imgUrl(c.image, member);
                    if (isHttp(img)) sec.setThumbnailAccessory(new ThumbnailBuilder().setURL(img));
                    container.addSectionComponents(sec);
                    break;
                }
                case 'link': {
                    const url = imgUrl(c.url, member);
                    if (!isHttp(url)) break; // link buttons need a real URL
                    container.addActionRowComponents(
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setStyle(ButtonStyle.Link)
                                .setLabel(fmt(c.label, member).slice(0, 80) || 'Open')
                                .setURL(url)
                        )
                    );
                    break;
                }
            }
        } catch { /* skip broken component */ }
    }
    return container;
}

// Returns a send()-ready payload for one side (join or leave).
// `embed` is the configured payload object; `fallback` is the plain message.
function memberPayload(member, embed, fallback) {
    if (embed?.enabled) {
        const color = embed.color ? parseInt(embed.color, 16) : config.colors.main;
        const thumb = embed.thumbnail ? member.user.displayAvatarURL({ size: 128 }) : null;
        if (embed.style === 'cv2') {
            // New-style cards: the dragged component list defines the body.
            // Cards saved before components existed fall back to title/desc.
            const e = embed.components?.length
                ? embed
                : { ...embed, components: [
                    ...(embed.title ? [{ type: 'heading', text: embed.title }] : []),
                    ...(embed.description ? [{ type: 'text', text: embed.description }] : []),
                    ...(thumb ? [{ type: 'image', url: '{avatar}' }] : []),
                    ...(embed.footer ? [{ type: 'separator', size: 'small' }, { type: 'text', text: embed.footer }] : []),
                ] };
            return cv2(cv2Card(member, e, color));
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
