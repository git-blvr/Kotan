const { PermissionFlagsBits } = require('discord.js');

// Guild lookups for the dashboard — the website runs inside the bot process,
// so everything reads the local client cache directly.

async function botGuildIds(client) {
    return new Set(client.guilds.cache.keys());
}

async function botGuildInfo(client, guildId) {
    const g = client.guilds.cache.get(guildId);
    return g
        ? {
              id: g.id,
              name: g.name,
              icon: g.iconURL({ size: 128 }),
              memberCount: g.memberCount,
          }
        : null;
}

// Text channels of a guild — for channel dropdowns on the dashboard.
async function botGuildChannels(client, guildId) {
    const g = client.guilds.cache.get(guildId);
    if (!g) return [];
    return g.channels.cache
        .filter((c) => c.isTextBased() && !c.isThread())
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Assignable roles of a guild — for autorole/reaction-role dropdowns.
// Excludes @everyone, managed (bot/integration) roles, and anything at or
// above the bot's highest role since we can't grant those.
async function botGuildRoles(client, guildId) {
    const g = client.guilds.cache.get(guildId);
    if (!g) return [];
    const top = g.members.me?.roles.highest?.position ?? 0;
    return g.roles.cache
        .filter((r) => r.id !== g.id && !r.managed && r.position < top)
        .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
        .sort((a, b) => b.position - a.position || a.name.localeCompare(b.name))
        .map(({ position, ...r }) => r);
}

// A user's member object in a bot guild — used by dashboard access tiers.
async function botGuildMember(client, guildId, userId) {
    const g = client.guilds.cache.get(guildId);
    if (!g) return null;
    return g.members.fetch(userId).catch(() => null);
}

// Recent messages of a text channel — powers the reaction-role message picker.
async function botGuildMessages(client, guildId, channelId) {
    const ch = client.guilds.cache.get(guildId)?.channels.cache.get(channelId);
    if (!ch?.isTextBased() || ch.isThread()) return [];
    const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (!msgs) return [];
    return [...msgs.values()]
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
        .map((m) => ({
            id: m.id,
            label: `${m.author?.username || 'system'} · ${(m.content || '(embed/attachment)').slice(0, 60)}`,
        }));
}

// Custom emoji of a guild — suggestion list for the reaction-role emoji field.
async function botGuildEmojis(client, guildId) {
    const g = client.guilds.cache.get(guildId);
    if (!g) return [];
    return g.emojis.cache.map((e) => ({ fmt: e.toString(), name: e.name }));
}

// Totals for the homepage stats strip.
async function botStats(client) {
    return { guilds: client.guilds.cache.size, users: client.users.cache.size };
}

// Bot invite link with just the permissions our commands need.
function inviteUrl(client, guildId = null) {
    const permissions = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.ManageRoles, // autorole + reaction roles
    ].reduce((acc, p) => acc | p, 0n);

    const params = new URLSearchParams({
        client_id: client.user.id,
        scope: 'bot',
        permissions: String(permissions),
    });
    if (guildId) {
        params.set('guild_id', guildId);
        params.set('disable_guild_select', 'true');
    }
    return `https://discord.com/oauth2/authorize?${params}`;
}

module.exports = { botGuildIds, botGuildInfo, botGuildChannels, botGuildRoles, botGuildMember, botGuildMessages, botGuildEmojis, botStats, inviteUrl };
