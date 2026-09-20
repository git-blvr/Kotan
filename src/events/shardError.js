const { Events } = require('discord.js');
const logger = require('../utils/logger');

module.exports = {
    name: Events.ShardError,
    execute(error, shardId) {
        logger.error(`Shard ${shardId} websocket error:`, error);
    },
};
