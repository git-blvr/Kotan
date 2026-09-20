const { success, sendError } = require('../../helpers/embeds');
const { formatCoins, formatDuration, timestamp } = require('../../helpers/format');
const db = require('../../utils/database');
const config = require('../../config');

module.exports = {
    name: 'daily',
    description: 'Claims your daily reward. Claim every day to grow your streak.',
    usage: '',
    aliases: ['claim', 'dailyreward'],
    triggers: ['daily'],
    cooldown: 10,
    async execute(message) {
        const { daily } = config.economy;
        const profile = await db.getProfile(message.guild.id, message.author.id);
        const now = Date.now();

        const remaining = profile.lastDaily + daily.cooldown - now;
        if (remaining > 0) {
            return sendError(
                message,
                `You already claimed your daily. Come back in **${formatDuration(remaining)}** (${timestamp(now + remaining)}).`
            );
        }

        // Streak continues if claimed within the window, otherwise resets to 1.
        const streak = now - profile.lastDaily < daily.streakWindow ? profile.dailyStreak + 1 : 1;
        const bonus = Math.min(streak * daily.streakBonus, daily.maxStreakBonus);
        const reward = daily.base + bonus;

        profile.wallet += reward;
        profile.lastDaily = now;
        profile.dailyStreak = streak;
        await db.saveProfile(message.guild.id, message.author.id, profile);

        return message.reply({
            embeds: [
                success(
                    `You claimed ${formatCoins(reward)} (base ${daily.base} + streak bonus ${bonus}).\n` +
                        `Streak: **${streak} day${streak === 1 ? '' : 's'}**\n` +
                        `New wallet balance: ${formatCoins(profile.wallet)}`,
                    'Daily claimed'
                ),
            ],
        });
    },
};
