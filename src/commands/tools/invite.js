const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ContainerBuilder,
    MessageFlags,
    TextDisplayBuilder,
} = require('discord.js');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const PERMS = require('../../utils/invitePerms');

// .invite / /invite — the OAuth2 add-to-server link with the permission set
// Kotan actually needs (mod + logging + tickets + CV2, no blanket admin).

async function run(ctx) {
    const url = ctx.client.generateInvite({
        scopes: ['bot', 'applications.commands'],
        permissions: PERMS,
    });
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## Invite ${ctx.client.user.username}\nAdds the bot with the permissions it needs — moderation, logging, tickets and components.\n-# You can trim any of these during the invite flow.`
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Add to your server').setURL(url)
            )
        );
    return ctx.reply({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { repliedUser: false },
    });
}

module.exports = {
    name: 'invite',
    description: 'Shows the link to add Kotan to your own server.',
    aliases: ['inv', 'add'],
    triggers: ['invite'],
    cooldown: 5,
    guildOnly: false,
    slash: [],
    execute: (message, args, client) => run(fromMessage(message, { client })),
    executeSlash: (interaction) => run(fromInteraction(interaction)),
};
