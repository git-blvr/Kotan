const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.GuildDelete,
    execute(guild) {
        logger.info(`Left guild "${guild.name}" (${guild.id})`);
    },
};
