const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.GuildCreate,
    execute(guild) {
        logger.info(`Joined guild "${guild.name}" (${guild.id}) — ${guild.memberCount} members`);
    },
};
