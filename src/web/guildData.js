const { ChannelType } = require('discord.js');

// Live guild data from the bot's in-memory cache — the website runs in the
// same process, so no Discord REST calls are needed for channels/roles/
// messages, and there's nothing to cache or rate-limit around.

const TEXTLIKE = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement]);

function guildChannels(guild) {
    return guild.channels.cache
        .filter((c) => TEXTLIKE.has(c.type))
        .map((c) => ({ id: c.id, name: c.name, type: c.type, parent: c.parentId }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function guildVoiceChannels(guild) {
    return guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildVoice)
        .map((c) => ({ id: c.id, name: c.name, type: c.type, parent: c.parentId }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function guildCategories(guild) {
    return guild.channels.cache
        .filter((c) => c.type === ChannelType.GuildCategory)
        .map((c) => ({ id: c.id, name: c.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

function guildRoles(guild) {
    return guild.roles.cache
        .filter((r) => r.id !== guild.id && !r.managed)
        .map((r) => ({ id: r.id, name: r.name, color: r.color ? `#${r.color.toString(16).padStart(6, '0')}` : null }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Recent messages in a channel — for the reaction-role message picker.
// fetch() hits REST, but only on explicit user action in the dashboard.
async function guildMessages(guild, channelId) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !TEXTLIKE.has(channel.type)) return { error: 'Unknown or non-text channel' };
    try {
        const msgs = await channel.messages.fetch({ limit: 25 });
        return {
            messages: msgs.map((m) => ({
                id: m.id,
                preview: (m.content || '').slice(0, 80) || '(no text)',
                author: m.author?.username || 'unknown',
                at: m.createdTimestamp,
            })).sort((a, b) => b.at - a.at),
        };
    } catch {
        return { error: 'Cannot read messages in that channel' };
    }
}

module.exports = { guildChannels, guildRoles, guildMessages, guildCategories, guildVoiceChannels };
