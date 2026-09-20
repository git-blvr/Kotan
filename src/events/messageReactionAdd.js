const { Events } = require('discord.js');
const reactionRoles = require('../utils/reactionRoles');
const logger = require('../utils/logger');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user, client) {
        await reactionRoles.apply(reaction, user, true).catch((err) =>
            logger.error('reaction role add failed:', err)
        );
    },
};
