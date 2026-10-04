const { Events } = require('discord.js');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const db = require('../utils/database');
const { sendError } = require('../helpers/embeds');
const { gateCommand } = require('../helpers/commandGate');

// Native slash-command path. Commands expose `executeSlash(interaction)` —
// the real interaction is passed straight through (no message shims). The
// shared gate in helpers/commandGate reads .user/.member/.guild/.channel,
// which interactions provide natively.
module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction, client) {
        // Modal submits route by custom id just like components, into
        // command.executeModal — e.g. the voicemaster rename modal.
        if (interaction.isModalSubmit()) {
            const command = client.commands.get(interaction.customId.split(':')[0]);
            if (!command?.executeModal) return;
            try {
                await command.executeModal(interaction, client);
            } catch (err) {
                logger.error(`Modal "${interaction.customId}" failed:`, err);
                sentry.capture(err, {
                    kind: 'modal', command: command.name, customId: interaction.customId,
                    user: interaction.user?.id, guild: interaction.guild?.id,
                });
            }
            return;
        }

        // Component interactions (select menus etc.) route by custom id:
        // "<command>:<step>:<ownerId>:<data>" -> command.executeComponent.
        if (interaction.isMessageComponent()) {
            const command = client.commands.get(interaction.customId.split(':')[0]);
            if (!command?.executeComponent) return;
            try {
                await command.executeComponent(interaction, client);
            } catch (err) {
                logger.error(`Component "${interaction.customId}" failed:`, err);
                sentry.capture(err, {
                    kind: 'component', command: command.name, customId: interaction.customId,
                    user: interaction.user?.id, guild: interaction.guild?.id,
                });
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;
        if (interaction.guild && db.isGuildBlacklisted(interaction.guild.id)) return;

        const command = client.commands.get(interaction.commandName);
        if (!command?.executeSlash) return; // registration is in sync — nothing to do

        interaction.guildSettings = interaction.guild
            ? await db.getGuildSettings(interaction.guild.id).catch(() => null)
            : null;
        interaction.prefix = '/'; // usage hints in replies read this

        if (await gateCommand(interaction, command, client)) return;

        try {
            await command.executeSlash(interaction, client);
        } catch (err) {
            logger.error(`Slash command "/${command.name}" failed:`, err);
            sentry.capture(err, {
                kind: 'slash', command: command.name,
                subcommand: interaction.options?.getSubcommand(false) || undefined,
                user: interaction.user?.id, guild: interaction.guild?.id,
                channel: interaction.channel?.id,
            });
            await sendError(interaction, 'Something went wrong while running that command.');
        }
    },
};
