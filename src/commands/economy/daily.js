const { success, sendError, cv2 } = require('../../helpers/embeds');
const { formatCoins, formatDuration, timestamp } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { withCoinMult, boostPerk } = require('../../helpers/inv');
const db = require('../../utils/database');
const config = require('../../config');

async function run(ctx) {
    const { daily } = config.economy;
    const eco = ctx.settings?.economy;
    const cur = eco?.currency;
    const base = eco?.dailyBase ?? daily.base;
    const streakBonus = eco?.dailyStreak ?? daily.streakBonus;
    const maxBonus = eco?.dailyMaxStreak ?? daily.maxStreakBonus;
    const profile = await db.getProfile(ctx.guild.id, ctx.user.id);
    const now = Date.now();

    const remaining = profile.lastDaily + daily.cooldown - now;
    if (remaining > 0) {
        return sendError(
            ctx,
            `You already claimed your daily. Come back in **${formatDuration(remaining)}** (${timestamp(now + remaining)}).`
        );
    }

    // Streak continues if claimed within the window, otherwise resets to 1.
    const streak = now - profile.lastDaily < daily.streakWindow ? profile.dailyStreak + 1 : 1;
    const bonus = Math.min(streak * streakBonus, maxBonus);
    const reward = base + bonus;

    profile.wallet += Math.round(withCoinMult(profile, reward) * boostPerk(ctx.member, ctx.settings, 'coins'));
    profile.lastDaily = now;
    profile.dailyStreak = streak;
    await db.saveProfile(ctx.guild.id, ctx.user.id, profile);

    return ctx.reply(
        cv2(
            success(
                `You claimed ${formatCoins(reward, cur)} (base ${base} + streak bonus ${bonus}).\n` +
                    `Streak: **${streak} day${streak === 1 ? '' : 's'}**\n` +
                    `New wallet balance: ${formatCoins(profile.wallet, cur)}`,
                'Daily claimed'
            )
        )
    );
}

module.exports = {
    name: 'daily',
    description: 'Claims your daily reward. Claim every day to grow your streak.',
    usage: '',
    aliases: ['claim', 'dailyreward'],
    triggers: ['daily'],
    cooldown: 10,
    slash: [],
    execute: (message) => run(fromMessage(message)),
    executeSlash: (interaction) => run(fromInteraction(interaction)),
};
