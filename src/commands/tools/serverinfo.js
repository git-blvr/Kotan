const { ChannelType } = require('discord.js');
const { base } = require('../../helpers/embeds');
const { formatNumber, timestamp } = require('../../helpers/format');
const { dominantColor } = require('../../utils/dominantColor');

module.exports = {
    name: 'serverinfo',
    description: 'Shows information about this server.',
    usage: '',
    aliases: ['si', 'server', 'guildinfo'],
    triggers: ['serverinfo'],
    cooldown: 5,
    async execute(message) {
        const guild = await message.guild.fetch(); // fresh counts + boost data
        const owner = await guild.fetchOwner().catch(() => null);

        const channels = guild.channels.cache;
        const text = channels.filter((c) => c.type === ChannelType.GuildText).size;
        const voice = channels.filter((c) => c.type === ChannelType.GuildVoice).size;
        const bots = guild.members.cache.filter((m) => m.user.bot).size;

        const icon = guild.iconURL({ size: 256 });
        const embed = base({
            title: guild.name,
            thumbnail: icon,
            color: icon ? ((await dominantColor(icon)) ?? undefined) : undefined,
            fields: [
                { name: 'Server ID', value: guild.id, inline: true },
                { name: 'Owner', value: owner ? `${owner.user.tag}` : 'Unknown', inline: true },
                { name: 'Created', value: timestamp(guild.createdTimestamp), inline: true },
                {
                    name: `Members (${formatNumber(guild.memberCount)})`,
                    value: `Cached bots: ${bots}`,
                    inline: true,
                },
                {
                    name: `Channels (${channels.size})`,
                    value: `Text: ${text} | Voice: ${voice}`,
                    inline: true,
                },
                {
                    name: 'Boosts',
                    value: `Level ${guild.premiumTier} — ${guild.premiumSubscriptionCount ?? 0} boosts`,
                    inline: true,
                },
                { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
                { name: 'Verification', value: `${guild.verificationLevel}`, inline: true },
            ],
        });
        if (guild.bannerURL()) embed.setImage(guild.bannerURL({ size: 1024 }));
        return message.reply({ embeds: [embed] });
    },
};
