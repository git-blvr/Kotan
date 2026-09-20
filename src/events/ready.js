const { Events, ActivityType } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { startTasks } = require('../utils/tasks');
const { startWebsite } = require('../website/server');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        logger.success(
            `Logged in as ${client.user.tag} — ${client.guilds.cache.size} guilds, ` +
                `${client.commands.size} commands`
        );

        client.user.setPresence({
            status: 'online',
            activities: [{ name: `${config.prefix}help`, type: ActivityType.Watching }],
        });

        startTasks(client);

        // Single process — the site lives inside it.
        startWebsite(client).catch((err) => logger.error('Website failed to start:', err));
    },
};
