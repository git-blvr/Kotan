const { EmbedBuilder } = require('discord.js');
const { base, cv2 } = require('../helpers/embeds');
const { cardContainer, cardImgSrc } = require('./welcomeMsg');
const { accentFor } = require('./dominantColor');
const config = require('../config');
const db = require('./database');

// AFK runtime — messageCreate calls handleMessage() for every guild message.
// Speaking clears your own status (the .afk command itself is excluded so
// `.afk` while AFK shows status instead of clearing), and mentioning an AFK
// member announces it + records the ping for their `.afk pings` list.

const ago = (ms) => {
    const s = Math.max(1, Math.floor(ms / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
};

// Placeholders: welcome set ({user} {username} {server} {members} {avatar}
// {icon}) plus AFK's own ({message} {ago} {channel}).
const afkFmt = (tpl, member, rec, channelId) =>
    String(tpl ?? '')
        .replaceAll('{user}', `${member}`)
        .replaceAll('{username}', member.user.username)
        .replaceAll('{server}', member.guild.name)
        .replaceAll('{members}', String(member.guild.memberCount))
        .replaceAll('{avatar}', member.user.displayAvatarURL({ size: 256 }))
        .replaceAll('{icon}', member.guild.iconURL({ size: 256 }) || '')
        .replaceAll('{message}', rec?.message ?? '')
        .replaceAll('{ago}', rec ? ago(Date.now() - rec.at) : '')
        .replaceAll('{channel}', channelId ? `<#${channelId}>` : '');

const isHttp = (u) => /^https?:\/\//i.test(u);

// Send-ready payload announcing `rec`'s AFK status — async since 'dominant'
// color mode extracts the accent from the card's image. Card config mirrors
// the welcome editor; disabled card falls back to the plain announce line.
async function afkPayload(member, rec, cfg, channelId) {
    const fmtFn = (s) => afkFmt(s, member, rec, channelId);
    const card = cfg.card;
    if (card?.enabled) {
        const color = await accentFor(card, cardImgSrc(card, fmtFn, fmtFn('{avatar}')), config.colors.main);
        const thumbSrc = fmtFn(card.thumb || '{avatar}');
        const thumb = card.thumbnail && isHttp(thumbSrc) ? thumbSrc : null;
        if (card.style === 'cv2') {
            const e = card.components?.length
                ? card
                : { ...card, components: [
                    ...(card.title ? [{ type: 'heading', text: card.title }] : []),
                    ...(card.description ? [{ type: 'text', text: card.description }] : []),
                    ...(thumb ? [{ type: 'section', text: ' ', image: card.thumb || '{avatar}' }] : []),
                    ...(card.footer ? [{ type: 'separator', size: 'small' }, { type: 'text', text: card.footer }] : []),
                ] };
            return cv2(cardContainer(e.components, color, fmtFn, fmtFn));
        }
        const e = new EmbedBuilder();
        if (color !== false) e.setColor(color);
        if (card.title) e.setTitle(fmtFn(card.title));
        if (card.description) e.setDescription(fmtFn(card.description));
        if (card.footer) e.setFooter({ text: fmtFn(card.footer) });
        if (thumb) e.setThumbnail(thumb);
        return { embeds: [e], allowedMentions: { repliedUser: false, users: [], roles: [], everyone: false } };
    }
    return cv2(base({ color: config.colors.main, description: fmtFn(cfg.announce) || `${member} is AFK.` }));
}

// Called from messageCreate for every guild message. `isAfkCmd` is true when
// the message resolved to the afk command — it manages status itself.
async function handleMessage(message, cfg, isAfkCmd) {
    if (!cfg || cfg.enabled === false || !message.guild) return;
    const gid = message.guild.id;

    // Your own message clears your status — any command counts too.
    if (!isAfkCmd) {
        const rec = await db.clearAfk(gid, message.author.id);
        if (rec && cfg.selfClear !== false) {
            const n = rec.pings?.length || 0;
            await message.channel
                .send(cv2(base({
                    color: config.colors.success,
                    description:
                        `Welcome back ${message.author} — you were AFK for **${ago(Date.now() - rec.at)}**` +
                        (n ? ` and got **${n}** mention${n === 1 ? '' : 's'} (\`${message.prefix || '.'}afk pings\`)` : '.'),
                })))
                .catch(() => {});
        }
    }

    // Mentions of AFK members — announce + record. Capped at 3 per message.
    if (cfg.announce === false || !message.mentions.users.size) return;
    if (cfg.exemptChannels?.includes(message.channel.id)) return;
    let done = 0;
    for (const [id, user] of message.mentions.users) {
        if (done >= 3) break;
        if (id === message.author.id || user.bot) continue;
        const rec = await db.getAfk(gid, id);
        if (!rec) continue;
        done++;
        await db.pushAfkPing(gid, id, {
            userId: message.author.id,
            channelId: message.channel.id,
            messageId: message.id,
            at: Date.now(),
        });
        const member =
            message.mentions.members?.get(id) ||
            message.guild.members.cache.get(id) ||
            { user, guild: message.guild, toString: () => `<@${id}>` };
        await message.reply(await afkPayload(member, rec, cfg, message.channel.id)).catch(() => {});
    }
}

module.exports = { handleMessage, afkPayload, afkFmt, ago };
