const { Events } = require('discord.js');
const db = require('../utils/database');
const logger = require('../utils/logger');
const automod = require('../utils/automod');
const { logEvent } = require('../utils/eventlog');
const { memberPayload } = require('../utils/welcomeMsg');

// On join: raid filter -> welcome message -> autorole -> event log.

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member, client) {
        db.trackMemberCount(member.guild.id, member.guild.memberCount).catch(() => {});
        const settings = await db.getGuildSettings(member.guild.id).catch(() => null);
        if (!settings) return;

        // Raid filter runs first — during a burst the joiner can be kicked.
        if (automod.trackJoin(member, settings.automod, client) === 'kick') {
            await member
                .kick('Kotan raid protection')
                .catch((err) => logger.warn(`raid kick failed for ${member.id}: ${err.message}`));
            return; // no welcome/autorole for a kicked raider
        }

        if (settings.welcome?.channel) {
            const channel =
                member.guild.channels.cache.get(settings.welcome.channel) ||
                (await member.guild.channels.fetch(settings.welcome.channel).catch(() => null));
            if (channel?.isTextBased())
                await channel
                    .send(await memberPayload(member, settings.welcome.embed, settings.welcome.message || 'Welcome {user}!'))
                    .catch(() => {});
        }

        if (settings.roles?.autorole) {
            await member.roles
                .add(settings.roles.autorole, 'Kotan autorole')
                .catch((err) => logger.warn(`autorole failed in ${member.guild.id}: ${err.message}`));
        }

        logEvent(client, member.guild.id, 'memberJoin', [
            { name: 'Member', value: `${member.user.tag} (${member.id})`, inline: true },
            { name: 'Members', value: String(member.guild.memberCount), inline: true },
        ]).catch(() => {});
    },
};
