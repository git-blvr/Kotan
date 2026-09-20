const { Events } = require('discord.js');
const reactionRoles = require('../utils/reactionRoles');
const logger = require('../utils/logger');

module.exports = {
    name: Events.MessageReactionRemove,
    async execute(reaction, user, client) {
        await reactionRoles.apply(reaction, user, false).catch((err) =>
            logger.error('reaction role remove failed:', err)
        );
    },
};
