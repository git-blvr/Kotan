const { Events, ActivityType } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const { startTasks } = require('../utils/tasks');
const { startWebsite } = require('../website/server');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        const cluster = client.cluster ? ` (cluster ${client.cluster.id})` : '';
        logger.success(
            `Logged in as ${client.user.tag}${cluster} — ${client.guilds.cache.size} guilds, ` +
                `${client.commands.size} commands`
        );

        client.user.setPresence({
            status: 'online',
            activities: [{ name: `${config.prefix}help`, type: ActivityType.Watching }],
        });

        startTasks(client);

        // The site runs once — on cluster 0 (or always when unsharded).
        if (!client.cluster || client.cluster.id === 0) {
            startWebsite(client).catch((err) => logger.error('Website failed to start:', err));
        }
    },
};
