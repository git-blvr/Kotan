const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveUser } = require('../../helpers/resolve');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { dominantColor } = require('../../utils/dominantColor');

async function run(ctx, target) {
    if (!target) return sendError(ctx, 'I could not find that user.');

    // force fetch — banner data is not included in cached users
    const user = await ctx.client.users.fetch(target.id, { force: true });
    const banner = user.bannerURL({ size: 1024 });

    if (!banner) {
        if (user.accentColor) {
            const embed = base({
                title: `${user.username}'s banner`,
                description: 'This user has no banner image — showing their accent color.',
                color: user.accentColor,
            });
            return ctx.reply(cv2(embed));
        }
        return sendError(ctx, `**${user.username}** does not have a banner.`);
    }

    const embed = base({
        title: `${user.username}'s banner`,
        description: `[Open full size](${banner})`,
        image: banner,
        color: (await dominantColor(banner)) ?? undefined,
    });
    return ctx.reply(cv2(embed));
}

module.exports = {
    name: 'banner',
    description: 'Shows a user\'s profile banner.',
    usage: '[@user | id]',
    aliases: ['bnr', 'profilebanner'],
    triggers: ['banner'],
    cooldown: 3,
    slash: [
        { name: 'user', description: 'Whose banner to show (default: you)', type: Opt.User },
    ],
    execute: async (message, args, client) =>
        run(fromMessage(message, { client }), args[0] ? await resolveUser(client, args[0]) : message.author),
    executeSlash: (interaction) =>
        run(fromInteraction(interaction), interaction.options.getUser('user') ?? interaction.user),
};
