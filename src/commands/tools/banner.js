const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { dominantColor } = require('../../utils/dominantColor');

module.exports = {
    name: 'banner',
    description: 'Shows a user\'s profile banner.',
    usage: '[@user | id]',
    aliases: ['bnr', 'profilebanner'],
    triggers: ['banner'],
    cooldown: 3,
    async execute(message, args, client) {
        const target = args[0] ? await resolveUser(client, args[0]) : message.author;
        if (!target) return sendError(message, 'I could not find that user.');

        // force fetch — banner data is not included in cached users
        const user = await client.users.fetch(target.id, { force: true });
        const banner = user.bannerURL({ size: 1024 });

        if (!banner) {
            if (user.accentColor) {
                const embed = base({
                    title: `${user.username}'s banner`,
                    description: 'This user has no banner image — showing their accent color.',
                    color: user.accentColor,
                });
                return message.reply(cv2(embed));
            }
            return sendError(message, `**${user.username}** does not have a banner.`);
        }

        const embed = base({
            title: `${user.username}'s banner`,
            description: `[Open full size](${banner})`,
            image: banner,
            color: (await dominantColor(banner)) ?? undefined,
        });
        return message.reply(cv2(embed));
    },
};
