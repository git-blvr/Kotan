const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Loads every listener in src/events. An event module exports:
//
//   module.exports = {
//       name: Events.MessageCreate, // any discord.js event name
//       once: false,                // true -> client.once(...)
//       execute: (...args, client) => {}, // event args first, client last
//   };

module.exports = function loadEvents(client) {
    const dir = path.join(__dirname, '..', 'events');
    let loaded = 0;

    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
        const event = require(path.join(dir, file));
        if (!event?.name || typeof event.execute !== 'function') {
            logger.warn(`Skipped event ${file} — needs "name" and "execute"`);
            continue;
        }
        const handler = (...args) => event.execute(...args, client);
        if (event.once) client.once(event.name, handler);
        else client.on(event.name, handler);
        loaded++;
    }

    logger.info(`Loaded ${loaded} events`);
};
