const db = require('./database');
const logger = require('./logger');
const { multOf, boostPerk } = require('../helpers/inv');

// XP engine — called fire-and-forget from messageCreate for every message that
// survives automod. Per-guild config comes from settings.leveling:
// rate, cooldown, multiplier, announcements, role rewards.

// XP needed to advance level L -> L+1. Quadratic curve (MEE6-style).
const xpForLevel = (level) => 5 * level * level + 50 * level + 100;

async function awardXp(message, settings) {
    const leveling = settings?.leveling;
    if (!leveling?.enabled || !message.guild) return;

    // Whole-doc write — must run under the wallet lock or a concurrent money
    // command's profile save (and vice versa) gets clobbered.
    const award = await db.withLock(`wallet:${message.guild.id}:${message.author.id}`, async () => {
        const p = await db.getProfile(message.guild.id, message.author.id);
        const now = Date.now();
        if (now - p.lastXp < (leveling.cooldown ?? 60) * 1000) return null;

        const min = Math.max(1, leveling.xpMin ?? 15);
        const max = Math.max(min, leveling.xpMax ?? 25);
        const gain = Math.round((min + Math.random() * (max - min)) * (leveling.multiplier || 1) * multOf(p, 'xp') * boostPerk(message.member, settings, 'xp'));
        if (gain <= 0) return null;

        const prevLevel = p.level;
        p.xp += gain;
        p.lastXp = now;

        // Safety cap: prevent blocking the event loop on extreme XP grants.
        let iterations = 0;
        while (p.xp >= xpForLevel(p.level) && iterations < 500) {
            p.xp -= xpForLevel(p.level);
            p.level++;
            iterations++;
        }
        await db.saveProfile(message.guild.id, message.author.id, p);
        return { profile: p, leveled: p.level > prevLevel };
    });
    if (!award?.leveled) return;
    const { profile } = award;

    // Role rewards — grant every reward at or below the new level so members
    // who skip announcements still catch up on roles.
    if (message.member && leveling.rewards?.length) {
        for (const r of leveling.rewards.filter((r) => r.level <= profile.level)) {
            await message.member.roles
                .add(r.roleId, `Kotan level ${r.level} reward`)
                .catch((err) => logger.warn(`level role grant failed: ${err.message}`));
        }
    }

    if (!leveling.announce) return;
    const text = (leveling.message || 'GG {user} — you reached **level {level}**!')
        .replaceAll('{user}', `<@${message.author.id}>`)
        .replaceAll('{username}', message.author.username)
        .replaceAll('{level}', String(profile.level))
        .replaceAll('{server}', message.guild.name);
    const channel = leveling.channel
        ? message.guild.channels.cache.get(leveling.channel) ||
          (await message.guild.channels.fetch(leveling.channel).catch(() => null))
        : message.channel;
    if (channel?.isTextBased())
        await channel
            .send({ content: text, allowedMentions: { users: [message.author.id] } })
            .catch(() => {});
}

module.exports = { awardXp, xpForLevel };
