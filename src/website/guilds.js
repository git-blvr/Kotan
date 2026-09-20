const { PermissionFlagsBits } = require('discord.js');

// Guild lookups that work no matter which cluster owns the guild.
// Standalone mode (npm run dev) reads the local cache directly; clustered
// mode fans out with broadcastEval and merges the answers.

async function botGuildIds(client) {
    if (client.cluster) {
        const lists = await client.cluster.broadcastEval((c) => [...c.guilds.cache.keys()]);
        return new Set(lists.flat());
    }
    return new Set(client.guilds.cache.keys());
}

async function botGuildInfo(client, guildId) {
    const pick = (g) =>
        g
            ? {
                  id: g.id,
                  name: g.name,
                  icon: g.iconURL({ size: 128 }),
                  memberCount: g.memberCount,
              }
            : null;

    if (client.cluster) {
        const results = await client.cluster.broadcastEval(
            (c, id) => {
                const g = c.guilds.cache.get(id);
                return g
                    ? { id: g.id, name: g.name, icon: g.iconURL({ size: 128 }), memberCount: g.memberCount }
                    : null;
            },
            { context: guildId }
        );
        return results.find(Boolean) ?? null;
    }
    return pick(client.guilds.cache.get(guildId));
}

// Text channels of a guild — for the modlog dropdown on the dashboard.
async function botGuildChannels(client, guildId) {
    const pick = (g) =>
        g
            ? g.channels.cache
                  .filter((c) => c.isTextBased() && !c.isThread())
                  .map((c) => ({ id: c.id, name: c.name }))
                  .sort((a, b) => a.name.localeCompare(b.name))
            : null;

    if (client.cluster) {
        const results = await client.cluster.broadcastEval(
            (c, id) => {
                const g = c.guilds.cache.get(id);
                if (!g) return null;
                return g.channels.cache
                    .filter((ch) => ch.isTextBased() && !ch.isThread())
                    .map((ch) => ({ id: ch.id, name: ch.name }))
                    .sort((a, b) => a.name.localeCompare(b.name));
            },
            { context: guildId }
        );
        return results.find(Boolean) ?? [];
    }
    return pick(client.guilds.cache.get(guildId)) ?? [];
}

// Totals for the homepage stats strip.
async function botStats(client) {
    if (client.cluster) {
        const parts = await client.cluster.broadcastEval((c) => ({
            guilds: c.guilds.cache.size,
            users: c.users.cache.size,
        }));
        return parts.reduce(
            (acc, p) => ({ guilds: acc.guilds + p.guilds, users: acc.users + p.users }),
            { guilds: 0, users: 0 }
        );
    }
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

module.exports = { botGuildIds, botGuildInfo, botGuildChannels, botStats, inviteUrl };
