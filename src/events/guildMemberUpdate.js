const { Events } = require('discord.js');
const db = require('../utils/database');
const logger = require('../utils/logger');
const { fmt } = require('../utils/welcomeMsg');
const { logEvent } = require('../utils/eventlog');

// Server boosts — a member's premium_since going null -> set means they just
// boosted. Grants the configured perk role and posts the announcement.

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember, client) {
        // Member update logging — nickname/role changes (independent of boosts).
        const fields = [];
        if (oldMember.nickname !== newMember.nickname)
            fields.push({ name: 'Nickname', value: `${oldMember.nickname || '—'} → ${newMember.nickname || '—'}`, inline: true });
        const oldRoles = oldMember.roles.cache.map((r) => r.id).join(',');
        const newRoles = newMember.roles.cache.map((r) => r.id).join(',');
        if (oldRoles !== newRoles) {
            const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
            const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
            if (added.size) fields.push({ name: 'Roles added', value: added.map((r) => `${r}`).join(' '), inline: true });
            if (removed.size) fields.push({ name: 'Roles removed', value: removed.map((r) => `${r}`).join(' '), inline: true });
        }
        if (fields.length)
            logEvent(client, newMember.guild.id, 'memberUpdate', [
                { name: 'Member', value: `${newMember.user.tag} (${newMember.id})`, inline: true },
                ...fields,
            ]).catch(() => {});

        const was = !!oldMember.premiumSince;
        const is = !!newMember.premiumSince;
        if (was === is) return; // not a boost transition

        const settings = await db.getGuildSettings(newMember.guild.id).catch(() => null);
        const boosts = settings?.boosts;
        if (!boosts) return;

        if (!is) return; // unboosting — keep the role (perk persists by design)

        if (boosts.roleId) {
            await newMember.roles
                .add(boosts.roleId, 'Server boost perk')
                .catch((err) => logger.warn(`boost role failed in ${newMember.guild.id}: ${err.message}`));
        }

        if (boosts.channel) {
            const channel =
                newMember.guild.channels.cache.get(boosts.channel) ||
                (await newMember.guild.channels.fetch(boosts.channel).catch(() => null));
            if (channel?.isTextBased()) {
                const text = fmt(boosts.message || '{user} just boosted {server}!', newMember)
                    .replaceAll('{boosts}', String(newMember.guild.premiumSubscriptionCount || 0));
                await channel.send(text).catch(() => {});
            }
        }
    },
};
