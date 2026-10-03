const {
    ChannelType,
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    EmbedBuilder,
    MessageFlags,
} = require('discord.js');
const { cardContainer, cardImgSrc } = require('./welcomeMsg');
const { accentFor } = require('./dominantColor');
const db = require('./database');
const config = require('../config');
const logger = require('./logger');

// VoiceMaster — a configured "trigger" voice channel hands each member
// their own temporary voice channel. Owners manage it from the posted
// panel's buttons/selects (voicemaster:* interactions) or by typing `.vc`
// commands in the channel's built-in text chat. Channel records persist
// in the voicemaster store so a restart doesn't orphan ownership.

const F = PermissionFlagsBits;

// Guild-level placeholders — panels aren't member events (same as tickets).
const gfmt = (s, guild) =>
    String(s ?? '')
        .replaceAll('{server}', guild.name)
        .replaceAll('{members}', String(guild.memberCount))
        .replaceAll('{boosts}', String(guild.premiumSubscriptionCount || 0));

const gimg = (u, guild) =>
    String(u || '').replaceAll('{icon}', guild.iconURL({ size: 256 }) || '');

const accent = (colorStr) =>
    (colorStr ? parseInt(String(colorStr).replace('#', ''), 16) : NaN) || config.colors.main;

// ---------- channel lifecycle ----------

const nameFor = (vm, member) =>
    (vm.naming || "{user}'s channel")
        .replaceAll('{user}', member.user.username)
        .replaceAll('{name}', member.displayName)
        .trim()
        .slice(0, 100) || `${member.user.username}'s channel`;

const clampKbps = (guild, kbps) => Math.min(Math.max(kbps || 64, 8), Math.floor(guild.maximumBitrate / 1000));

// Deletes a managed channel and drops its record.
async function destroy(guildId, ch) {
    const data = await db.getVM(guildId);
    if (data.channels[ch.id]) {
        delete data.channels[ch.id];
        await db.saveVM(guildId, data);
    }
    await ch.delete('Kotan voicemaster — channel empty').catch(() => {});
}

// Creates the member's personal voice channel and moves them into it.
// One channel per member — re-joining the trigger moves them back to the
// channel they already own.
async function createFor(member, vm, prefix) {
    const guild = member.guild;
    const data = await db.getVM(guild.id);
    for (const [chId, st] of Object.entries(data.channels)) {
        if (st.owner !== member.id) continue;
        const existing = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));
        if (existing) {
            await member.voice.setChannel(existing).catch(() => {});
            return existing;
        }
        delete data.channels[chId]; // stale record — channel's gone
    }
    const trigger = guild.channels.cache.get(vm.triggerId);
    const ch = await guild.channels.create({
        name: nameFor(vm, member),
        type: ChannelType.GuildVoice,
        parent: vm.categoryId || trigger?.parentId || null,
        userLimit: Math.min(Math.max(vm.userLimit || 0, 0), 99),
        ...(vm.bitrate ? { bitrate: clampKbps(guild, vm.bitrate) * 1000 } : {}),
        permissionOverwrites: [{ id: member.id, allow: [F.ViewChannel, F.Connect, F.Speak] }],
        reason: 'Kotan voicemaster',
    });
    // Re-read before writing — two members can hit the trigger together,
    // and Keyv has no atomic merge. Sweep this owner's stale records while
    // we're here (channel deleted out from under the record).
    const fresh = await db.getVM(guild.id);
    for (const chId of Object.keys(fresh.channels))
        if (fresh.channels[chId].owner === member.id && !guild.channels.cache.has(chId)) delete fresh.channels[chId];
    fresh.channels[ch.id] = { owner: member.id, trusted: [], blocked: [], locked: false, hidden: false };
    await db.saveVM(guild.id, fresh);
    const moved = await member.voice.setChannel(ch).then(() => true).catch(() => false);
    if (!moved) {
        await destroy(guild.id, ch);
        return null;
    }
    // Voice channels are text-based — this lands in the channel's own chat.
    await ch
        .send(`🎧 ${member} — this is your channel. Manage it with \`${prefix}vc\` in this chat (try \`${prefix}vc help\`) or the control panel.`)
        .catch(() => {});
    return ch;
}

// voiceStateUpdate entry point — joins to the trigger create channels;
// a managed channel left with no humans is deleted (bots don't hold it).
async function handleVoiceUpdate(oldState, newState) {
    const joined = newState.channelId;
    const left = oldState.channelId;
    if (joined === left) return; // mute/deafen flips carry no signal
    const guild = newState.guild || oldState.guild;
    const s = await db.getGuildSettings(guild.id).catch(() => null);
    const vm = s?.voicemaster;
    if (vm?.enabled && vm.triggerId && joined === vm.triggerId)
        await createFor(newState.member, vm, s.prefix || config.prefix)
            .catch((e) => logger.warn(`voicemaster create failed: ${e.message}`));
    if (left && left !== joined) {
        const ch = oldState.channel;
        if (ch && ch.members.every((m) => m.user.bot)) {
            const data = await db.getVM(guild.id);
            if (data.channels[left]) await destroy(guild.id, ch);
        }
    }
}

// Boot-time reconcile: drop records for deleted channels, delete live
// managed channels that sit empty (created pre-restart, never reoccupied).
async function prune(client) {
    for (const guild of client.guilds.cache.values()) {
        const data = await db.getVM(guild.id).catch(() => null);
        if (!data || !Object.keys(data.channels).length) continue;
        let dirty = false;
        for (const chId of Object.keys(data.channels)) {
            const ch = guild.channels.cache.get(chId);
            if (!ch || ch.members.every((m) => m.user.bot)) {
                await ch?.delete('Kotan voicemaster — empty').catch(() => {});
                delete data.channels[chId];
                dirty = true;
            }
        }
        if (dirty) await db.saveVM(guild.id, data).catch(() => {});
    }
}

// ---------- owner actions (shared by panel components and .vc) ----------

// The channel a member controls: staff get the managed channel they're
// sitting in, everyone else gets the one they own (whichever is live).
async function ownedChannel(guild, member) {
    const data = await db.getVM(guild.id);
    const vc = member.voice.channel;
    if (member.permissions.has(F.ManageChannels) && vc && data.channels[vc.id])
        return { ch: vc, st: data.channels[vc.id], data };
    for (const [chId, st] of Object.entries(data.channels)) {
        if (st.owner !== member.id) continue;
        const ch = guild.channels.cache.get(chId) || (await guild.channels.fetch(chId).catch(() => null));
        if (ch) return { ch, st, data };
        delete data.channels[chId]; // stale record — channel's gone
    }
    await db.saveVM(guild.id, data);
    return { ch: null, st: null, data };
}

const uid = (v) => String(v || '').match(/\d{17,20}/)?.[0] || null;

// Returns { ok, msg } — the caller shapes the reply (ephemeral/text).
async function run(guild, member, action, arg) {
    const manage = member.permissions.has(F.ManageChannels);

    if (action === 'claim') {
        const data = await db.getVM(guild.id);
        const vc = member.voice.channel;
        const st = vc && data.channels[vc.id];
        if (!st) return { ok: false, msg: "You're not in a managed channel." };
        if (st.owner === member.id) return { ok: false, msg: 'This channel is already yours.' };
        if (vc.members.has(st.owner)) return { ok: false, msg: 'The owner is still in the channel — they keep it until they leave.' };
        st.owner = member.id;
        await vc.permissionOverwrites.edit(member.id, { ViewChannel: true, Connect: true }).catch(() => {});
        await db.saveVM(guild.id, data);
        return { ok: true, msg: "Channel claimed — you're the owner now." };
    }

    const { ch, st, data } = await ownedChannel(guild, member);
    if (!st) return { ok: false, msg: "You don't have a channel — join the trigger channel to make one." };
    if (st.owner !== member.id && !manage) return { ok: false, msg: 'Only the channel owner can do that.' };

    const everyone = guild.roles.everyone;
    const finish = async (ok, msg, dirty) => {
        if (dirty) await db.saveVM(guild.id, data).catch(() => {});
        return { ok, msg };
    };

    switch (action) {
        case 'lock':
            await ch.permissionOverwrites.edit(everyone, { Connect: false });
            st.locked = true;
            return finish(true, 'Locked — only trusted members can join.', true);
        case 'unlock':
            await ch.permissionOverwrites.edit(everyone, { Connect: null });
            st.locked = false;
            return finish(true, 'Unlocked — anyone can join.', true);
        case 'hide':
            await ch.permissionOverwrites.edit(everyone, { ViewChannel: false });
            st.hidden = true;
            return finish(true, 'Hidden from the channel list.', true);
        case 'show':
            await ch.permissionOverwrites.edit(everyone, { ViewChannel: null });
            st.hidden = false;
            return finish(true, 'Visible again.', true);
        case 'rename': {
            const name = String(arg || '').trim().slice(0, 100);
            if (!name) return finish(false, 'Give me a name — e.g. `vc rename Chill Zone`.');
            await ch.setName(name, 'Kotan voicemaster');
            return finish(true, `Renamed to **${name}**.`);
        }
        case 'limitup':
        case 'limitdn':
        case 'limit': {
            let n;
            if (action === 'limitup') n = (ch.userLimit || 0) + 1;
            else if (action === 'limitdn') n = (ch.userLimit || 0) - 1;
            else n = parseInt(arg, 10);
            if (!Number.isFinite(n)) return finish(false, 'Give me a number — e.g. `vc limit 5` (0 removes the cap).');
            n = Math.min(Math.max(n, 0), 99);
            await ch.setUserLimit(n, 'Kotan voicemaster');
            return finish(true, n ? `User limit set to **${n}**.` : 'User limit removed.');
        }
        case 'bitrate': {
            const n = arg === 'default' || arg === '0' ? 64 : parseInt(arg, 10);
            if (!Number.isFinite(n)) return finish(false, 'Give me kbps — e.g. `vc bitrate 96` (or `default`).');
            const capped = clampKbps(guild, n);
            await ch.setBitrate(capped * 1000, 'Kotan voicemaster');
            return finish(true, `Bitrate set to **${capped} kbps**.`);
        }
        case 'trust': {
            const t = uid(arg);
            if (!t) return finish(false, 'Mention or give the ID of who to trust.');
            st.trusted = [...new Set([...st.trusted, t])];
            st.blocked = st.blocked.filter((x) => x !== t);
            await ch.permissionOverwrites.edit(t, { ViewChannel: true, Connect: true });
            return finish(true, `Trusted <@${t}> — they can always join, even locked.`, true);
        }
        case 'untrust': {
            const t = uid(arg);
            if (!t) return finish(false, 'Mention or give the ID of who to untrust.');
            st.trusted = st.trusted.filter((x) => x !== t);
            if (st.blocked.includes(t)) await ch.permissionOverwrites.edit(t, { ViewChannel: false, Connect: false });
            else await ch.permissionOverwrites.delete(t).catch(() => {});
            return finish(true, `Removed <@${t}> from trusted.`, true);
        }
        case 'block': {
            const t = uid(arg);
            if (!t) return finish(false, 'Mention or give the ID of who to block.');
            if (t === member.id) return finish(false, "You can't block yourself.");
            st.blocked = [...new Set([...st.blocked, t])];
            st.trusted = st.trusted.filter((x) => x !== t);
            await ch.permissionOverwrites.edit(t, { ViewChannel: false, Connect: false });
            const inside = ch.members.get(t);
            if (inside) await inside.voice.disconnect('Blocked from channel by its owner').catch(() => {});
            return finish(true, `Blocked <@${t}> — they can't see or join the channel.`, true);
        }
        case 'unblock': {
            const t = uid(arg);
            if (!t) return finish(false, 'Mention or give the ID of who to unblock.');
            st.blocked = st.blocked.filter((x) => x !== t);
            if (st.trusted.includes(t)) await ch.permissionOverwrites.edit(t, { ViewChannel: true, Connect: true });
            else await ch.permissionOverwrites.delete(t).catch(() => {});
            return finish(true, `Unblocked <@${t}>.`, true);
        }
        case 'kick': {
            const t = uid(arg);
            const target = t && ch.members.get(t);
            if (!target) return finish(false, 'That member is not in your channel.');
            if (target.id === member.id) return finish(false, "You can't kick yourself — just leave.");
            await target.voice.disconnect('Kicked by channel owner').catch(() => {});
            return finish(true, `Kicked **${target.displayName}** out of the channel.`);
        }
        case 'transfer': {
            const t = uid(arg);
            const target = t && ch.members.get(t);
            if (!target) return finish(false, 'They have to be in the channel to take it over.');
            if (target.id === member.id) return finish(false, "It's already yours.");
            st.owner = target.id;
            await ch.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true }).catch(() => {});
            return finish(true, `Ownership transferred to **${target.displayName}**.`, true);
        }
        case 'invite': {
            const inv = await ch.createInvite({ maxAge: 86400 }).catch(() => null);
            if (!inv) return finish(false, "Couldn't create an invite — check my permissions.");
            return finish(true, `Share this (expires in 24h): ${inv.url}`);
        }
        case 'info':
            return finish(
                true,
                `**${ch.name}** — owner <@${st.owner}> · ${ch.members.size}${ch.userLimit ? `/${ch.userLimit}` : ''} connected · ` +
                    `${st.locked ? '🔒' : '🔓'} ${st.hidden ? '🙈 hidden' : 'visible'} · ` +
                    `${st.trusted.length} trusted · ${st.blocked.length} blocked`
            );
        default:
            return finish(false, 'Unknown action.');
    }
}

// ---------- control panel ----------

// The button grid + bitrate select attached under the card. Actions route
// to the `voicemaster` command via customId `voicemaster:<action>`.
function controlRows() {
    const b = (id, label) => new ButtonBuilder().setCustomId(`voicemaster:${id}`).setLabel(label).setStyle(ButtonStyle.Secondary);
    return [
        new ActionRowBuilder().addComponents(b('lock', 'Lock'), b('unlock', 'Unlock'), b('hide', 'Hide'), b('show', 'Show'), b('rename', 'Rename')),
        new ActionRowBuilder().addComponents(b('limitup', 'Limit +'), b('limitdn', 'Limit −'), b('invite', 'Invite'), b('trust', 'Trust'), b('untrust', 'Untrust')),
        new ActionRowBuilder().addComponents(b('kick', 'Kick'), b('block', 'Block'), b('unblock', 'Unblock'), b('transfer', 'Transfer'), b('claim', 'Claim')),
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('voicemaster:bitrate')
                .setPlaceholder('Select bitrate quality…')
                .addOptions(
                    [
                        ['Server default', '0'],
                        ['32 kbps', '32'],
                        ['48 kbps', '48'],
                        ['64 kbps', '64'],
                        ['96 kbps', '96'],
                        ['128 kbps', '128'],
                    ].map(([label, value]) => ({ label, value }))
                )
        ),
    ];
}

// Send-ready payload for the control panel — mirrors the tickets panel:
// cv2 container / classic embed / plain text, controls attached after.
async function panelPayload(guild, vm) {
    const rows = controlRows();
    const p = vm.panel || {};
    const color = await accentFor(p, cardImgSrc(p, (u) => gimg(u, guild), guild.iconURL({ size: 256 }) || ''), accent(p.color));
    if (p.enabled === false)
        return {
            content: p.description || 'Join the trigger channel to get your own voice channel.',
            components: rows,
            allowedMentions: { users: [], roles: [], everyone: false },
        };
    if (p.style === 'embed') {
        const e = new EmbedBuilder();
        if (color !== false) e.setColor(color);
        if (p.title) e.setTitle(gfmt(p.title, guild));
        if (p.description) e.setDescription(gfmt(p.description, guild));
        if (p.footer) e.setFooter({ text: gfmt(p.footer, guild) });
        if (p.thumbnail) {
            const t = gimg(p.thumb || '{icon}', guild);
            if (/^https?:\/\//i.test(t)) e.setThumbnail(t);
        }
        return { embeds: [e], components: rows, allowedMentions: { users: [], roles: [], everyone: false } };
    }
    const comps = p.components?.length
        ? p.components
        : [
              { type: 'heading', text: p.title || 'Voice channels' },
              { type: 'text', text: p.description || 'Join the trigger channel to get your own voice channel — manage it with the buttons below or by typing `.vc` in its chat.' },
              ...(p.footer ? [{ type: 'separator', size: 'small' }, { type: 'text', text: p.footer }] : []),
          ];
    const container = cardContainer(comps, color, (s) => gfmt(s, guild), (u) => gimg(u, guild));
    // Top-level action rows ride alongside the container — keeps the
    // card's own 10-component budget untouched.
    return { components: [container, ...rows], flags: MessageFlags.IsComponentsV2 };
}

module.exports = { handleVoiceUpdate, createFor, destroy, ownedChannel, run, panelPayload, controlRows, prune };
