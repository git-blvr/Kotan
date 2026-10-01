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

// Builds a CV2 container from the dragged-together component list.
// fmtFn/imgFn resolve placeholders per context (member join/leave vs
// guild-level panels like tickets). Broken pieces are skipped.
function cardContainer(components, color, fmtFn, imgFn) {
    const container = base({ color });
    for (const c of components || []) {
        try {
            switch (c.type) {
                case 'text':
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(fmtFn(c.text) || ' ')
                    );
                    break;
                case 'heading':
                    container.addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`# ${fmtFn(c.text)}`)
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
                    const url = imgFn(c.url);
                    if (isHttp(url))
                        container.addMediaGalleryComponents(
                            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url))
                        );
                    break;
                }
                case 'section': {
                    const t = fmtFn(c.text) || ' ';
                    const sec = new SectionBuilder().addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(c.big && t.trim() ? `# ${t}` : t)
                    );
                    const btnUrl = imgFn(c.btnUrl);
                    if (isHttp(btnUrl)) {
                        sec.setButtonAccessory(
                            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(fmtFn(c.btnLabel).slice(0, 80) || 'Open').setURL(btnUrl)
                        );
                    } else {
                        const img = imgFn(c.image);
                        if (isHttp(img)) sec.setThumbnailAccessory(new ThumbnailBuilder().setURL(img));
                    }
                    container.addSectionComponents(sec);
                    break;
                }
                case 'link': {
                    const url = imgFn(c.url);
                    if (!isHttp(url)) break; // link buttons need a real URL
                    container.addActionRowComponents(
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setStyle(ButtonStyle.Link)
                                .setLabel(fmtFn(c.label).slice(0, 80) || 'Open')
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

function cv2Card(member, embed, color) {
    return cardContainer(embed.components, color, (s) => fmt(s, member), (u) => imgUrl(u, member));
}

// Returns a send()-ready payload for one side (join or leave).
// `embed` is the configured payload object; `fallback` is the plain message.
function memberPayload(member, embed, fallback) {
    if (embed?.enabled) {
        const color = embed.color ? parseInt(embed.color, 16) : config.colors.main;
        // Thumbnail source: custom URL/placeholder wins over the member avatar.
        const thumbSrc = embed.thumb ? imgUrl(embed.thumb, member) : member.user.displayAvatarURL({ size: 128 });
        const thumb = embed.thumbnail && isHttp(thumbSrc) ? thumbSrc : null;
        if (embed.style === 'cv2') {
            // New-style cards: the dragged component list defines the body.
            // Cards saved before components existed fall back to title/desc.
            const e = embed.components?.length
                ? embed
                : { ...embed, components: [
                    ...(embed.title ? [{ type: 'heading', text: embed.title }] : []),
                    ...(embed.description ? [{ type: 'text', text: embed.description }] : []),
                    ...(thumb ? [{ type: 'section', text: '\u200b', image: embed.thumb || '{avatar}' }] : []),
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

module.exports = { fmt, memberPayload, cardContainer };
