const {
    ContainerBuilder,
    TextDisplayBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags,
} = require('discord.js');
const { base, cv2 } = require('../helpers/embeds');
const { cardContainer } = require('./welcomeMsg');
const db = require('./database');
const config = require('../config');
const logger = require('./logger');

// Guild-level placeholders — panels aren't member events, so only server
// fields resolve (component image fields accept {icon}).
const gfmt = (s, guild) =>
    String(s ?? '')
        .replaceAll('{server}', guild.name)
        .replaceAll('{members}', String(guild.memberCount))
        .replaceAll('{boosts}', String(guild.premiumSubscriptionCount || 0));

const gimg = (u, guild) =>
    String(u || '').replaceAll('{icon}', guild.iconURL({ size: 256 }) || '');

const accent = (colorStr) =>
    (colorStr ? parseInt(String(colorStr).replace('#', ''), 16) : NaN) || config.colors.main;

// The topic dropdown / open button lives at the bottom of the panel.
function topicsRow(t) {
    const row = new ActionRowBuilder();
    if (t.topics?.length) {
        row.addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket:open')
                .setPlaceholder('Choose a topic…')
                .addOptions(
                    t.topics.slice(0, 25).map((x, i) => ({
                        label: String(x.name).slice(0, 100),
                        value: String(i),
                        description: x.desc ? String(x.desc).slice(0, 100) : undefined,
                    }))
                )
        );
    } else {
        row.addComponents(
            new ButtonBuilder().setCustomId('ticket:open').setLabel('Open a ticket').setStyle(ButtonStyle.Primary)
        );
    }
    return row;
}

// Send-ready payload for the ticket panel. Honors the card editor's style:
// cv2 container, classic embed, or plain text when the card is disabled.
function panelPayload(guild, t) {
    const row = topicsRow(t);
    const p = t.panel || {};
    if (p.enabled === false)
        return {
            content: p.description || 'Pick a topic below to open a ticket.',
            components: [row],
            allowedMentions: { users: [], roles: [], everyone: false },
        };
    if (p.style === 'embed') {
        const e = new EmbedBuilder().setColor(accent(p.color));
        if (p.title) e.setTitle(gfmt(p.title, guild));
        if (p.description) e.setDescription(gfmt(p.description, guild));
        if (p.footer) e.setFooter({ text: gfmt(p.footer, guild) });
        if (p.thumbnail) {
            const t = gimg(p.thumb || '{icon}', guild);
            if (/^https?:\/\//i.test(t)) e.setThumbnail(t);
        }
        return { embeds: [e], components: [row], allowedMentions: { users: [], roles: [], everyone: false } };
    }
    const comps = p.components?.length
        ? p.components
        : [
              ...(p.title ? [{ type: 'heading', text: p.title }] : [{ type: 'heading', text: 'Support' }]),
              { type: 'text', text: p.description || 'Pick a topic below to open a ticket.' },
              ...(p.footer ? [{ type: 'separator', size: 'small' }, { type: 'text', text: p.footer }] : []),
          ];
    const container = cardContainer(comps, accent(p.color), (s) => gfmt(s, guild), (u) => gimg(u, guild));
    container.addActionRowComponents(row);
    return cv2(container);
}

// Can this member manage tickets (claim/close others')? Support roles or
// ManageGuild qualify; nobody does when both are absent -> everyone may.
function isSupport(member, t) {
    if (member.permissions.has(PermissionFlagsBits.ManageGuild)) return true;
    if (t.supportRoles?.length) return member.roles.cache.some((r) => t.supportRoles.includes(r.id));
    return member.permissions.has(PermissionFlagsBits.ManageChannels);
}

async function tlog(guild, t, text) {
    if (!t.logChannel) return;
    const ch =
        guild.channels.cache.get(t.logChannel) ||
        (await guild.channels.fetch(t.logChannel).catch(() => null));
    if (ch?.isTextBased())
        await ch.send(cv2(base({ color: config.colors.main, title: 'Tickets', description: text }))).catch(() => {});
}

const chanName = (t, member, num) =>
    (t.naming || 'ticket-{user}')
        .replaceAll('{user}', member.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '') || 'member')
        .replaceAll('{count}', String(num))
        .replaceAll('{topic}', '')
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 90) || `ticket-${num}`;

// Creates the ticket channel + records it. Returns {channel} or {err}.
async function openTicket(guild, member, topicIdx, settings, client) {
    const t = settings.tickets;
    const data = await db.getTickets(guild.id);
    const open = Object.entries(data.channels).filter(([chId, r]) => r.user === member.id && guild.channels.cache.has(chId));
    if (open.length >= (t.maxOpen || 1)) return { err: `You already have an open ticket: <#${open[0][0]}>` };

    data.count = (data.count || 0) + 1;
    const topic = t.topics?.[topicIdx];
    const channel = await guild.channels.create({
        name: chanName(t, member, data.count),
        type: ChannelType.GuildText,
        parent: t.categoryId || null,
        permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
            ...(t.supportRoles || []).map((r) => ({
                id: r,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
            })),
        ],
        reason: `Kotan ticket #${data.count}`,
    });

    data.byUser[member.id] = channel.id;
    data.channels[channel.id] = {
        user: member.id,
        topic: topic?.name || null,
        number: data.count,
        openedAt: Date.now(),
        claimedBy: null,
    };
    await db.saveTickets(guild.id, data);

    const oc = new ContainerBuilder().setAccentColor(accent(t.panel?.color));
    oc.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## Ticket #${data.count}${topic ? ` — ${topic.name}` : ''}\nHey ${member} — staff will be with you shortly.\n-# Describe your issue below.`
        )
    );
    oc.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket:claim').setLabel('Claim').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('ticket:close').setLabel('Close ticket').setStyle(ButtonStyle.Danger)
        )
    );
    // Mentions ride in `content` — the CV2 container itself never pings.
    await channel
        .send({
            content: `${member}${t.supportRoles?.length ? ` ${t.supportRoles.map((r) => `<@&${r}>`).join(' ')}` : ''}`,
            components: [oc],
            flags: MessageFlags.IsComponentsV2,
            allowedMentions: { users: [member.id], roles: t.supportRoles || [] },
        })
        .catch((e) => logger.warn(`ticket opener failed: ${e.message}`));

    await tlog(guild, t, `📥 **#${data.count}** opened by ${member}${topic ? ` — topic: **${topic.name}**` : ''} → <#${channel.id}>`);
    return { channel };
}

async function closeTicket(channel, guild, by, settings) {
    const t = settings.tickets;
    const data = await db.getTickets(guild.id);
    const rec = data.channels[channel.id];
    await channel
        .send(cv2(base({ color: config.colors.warning, title: 'Ticket closed', description: `Closed by ${by}. This channel deletes in 5 seconds.` })))
        .catch(() => {});
    delete data.channels[channel.id];
    if (rec && data.byUser[rec.user] === channel.id) delete data.byUser[rec.user];
    await db.saveTickets(guild.id, data);
    if (rec)
        await tlog(
            guild,
            t,
            `📤 **#${rec.number}** closed by ${by} — opened by <@${rec.user}>${rec.topic ? ` · **${rec.topic}**` : ''}`
        );
    setTimeout(() => channel.delete('Kotan ticket closed').catch(() => {}), 5000);
}

module.exports = { panelPayload, openTicket, closeTicket, isSupport, topicsRow };
