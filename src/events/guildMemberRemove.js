const { Events } = require('discord.js');
const db = require('../utils/database');
const { logEvent } = require('../utils/eventlog');
const { memberPayload } = require('../utils/welcomeMsg');

// On leave: goodbye message -> event log.

module.exports = {
    name: Events.GuildMemberRemove,
    async execute(member, client) {
        db.trackMemberCount(member.guild.id, member.guild.memberCount).catch(() => {});
        const settings = await db.getGuildSettings(member.guild.id).catch(() => null);
        if (!settings) return;

        if (settings.welcome?.goodbyeChannel) {
            const channel =
                member.guild.channels.cache.get(settings.welcome.goodbyeChannel) ||
                (await member.guild.channels.fetch(settings.welcome.goodbyeChannel).catch(() => null));
            if (channel?.isTextBased())
                await channel
                    .send(memberPayload(member, settings.welcome.goodbyeEmbed, settings.welcome.goodbyeMessage || '**{username}** left.'))
                    .catch(() => {});
        }

        logEvent(client, member.guild.id, 'memberLeave', [
            { name: 'Member', value: `${member.user?.tag ?? member.id} (${member.id})`, inline: true },
            { name: 'Members', value: String(member.guild.memberCount), inline: true },
        ]).catch(() => {});
    },
};
