const db = require('./database');
const logger = require('./logger');

// XP engine — called fire-and-forget from messageCreate for every message that
// survives automod. Per-guild config comes from settings.leveling:
// rate, cooldown, multiplier, announcements, role rewards.

// XP needed to advance level L -> L+1. Quadratic curve (MEE6-style).
const xpForLevel = (level) => 5 * level * level + 50 * level + 100;

async function awardXp(message, leveling) {
    if (!leveling?.enabled || !message.guild) return;

    const profile = await db.getProfile(message.guild.id, message.author.id);
    const now = Date.now();
    if (now - profile.lastXp < (leveling.cooldown ?? 60) * 1000) return;

    const min = Math.max(1, leveling.xpMin ?? 15);
    const max = Math.max(min, leveling.xpMax ?? 25);
    const gain = Math.round((min + Math.random() * (max - min)) * (leveling.multiplier || 1));
    if (gain <= 0) return;

    profile.xp += gain;
    profile.lastXp = now;

    let leveled = false;
    while (profile.xp >= xpForLevel(profile.level)) {
        profile.xp -= xpForLevel(profile.level);
        profile.level++;
        leveled = true;
    }
    await db.saveProfile(message.guild.id, message.author.id, profile);
    if (!leveled) return;

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
