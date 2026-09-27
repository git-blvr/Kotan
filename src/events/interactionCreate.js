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
            sentry.capture(err);
            await sendError(interaction, 'Something went wrong while running that command.');
        }
    },
};
