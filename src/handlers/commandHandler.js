const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Loads every command under src/commands.
//
// Files directly inside src/commands become the "core" category; each
// subfolder becomes a category named after the folder. A command module must
// export at least { name, execute }; everything else is optional:
//
//   module.exports = {
//       name: 'ping',                 // required
//       description: 'Shows latency', // shown in help
//       usage: '[@user]',             // shown in help / usage errors
//       aliases: ['pong'],            // .pong works like .ping
//       triggers: ['net'],            // typing "net" (no prefix) runs it
//       cooldown: 3,                  // seconds, per user (default 3)
//       guildOnly: true,              // default true
//       ownerOnly: false,             // restrict to OWNER_IDS
//       userPermissions: ['BanMembers'],  // required member permissions
//       botPermissions: ['BanMembers'],   // required bot permissions
//       execute: async (message, args, client) => {},      // prefix path
//       slash: [{ name: 'user', type: 6, required: true, description: '...' }],
//       executeSlash: async (interaction, client) => {},   // slash path
//   };
//
// `slash` + `executeSlash` are both required for the command to be registered
// as a slash command (see scripts/deploySlash.js and helpers/slash.js).

module.exports = function loadCommands(client) {
    const baseDir = path.join(__dirname, '..', 'commands');
    let loaded = 0;

    const register = (filePath, category) => {
        const command = require(filePath);
        if (!command?.name || typeof command.execute !== 'function') {
            return logger.warn(`Skipped ${path.relative(baseDir, filePath)} — needs "name" and "execute"`);
        }
        command.category = command.category || category;
        command.aliases ??= [];
        command.triggers ??= [];
        command.cooldown ??= 3;

        client.commands.set(command.name, command);
        for (const alias of command.aliases) client.aliases.set(alias, command.name);
        for (const trigger of command.triggers) {
            const existing = client.triggers.get(trigger);
            if (existing) {
                logger.warn(`Trigger "${trigger}" is used by both "${existing}" and "${command.name}" — keeping "${existing}"`);
                continue;
            }
            client.triggers.set(trigger, command.name);
        }
        loaded++;
    };

    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.js')) {
            register(path.join(baseDir, entry.name), 'core');
        } else if (entry.isDirectory()) {
            for (const file of fs.readdirSync(path.join(baseDir, entry.name))) {
                if (file.endsWith('.js')) register(path.join(baseDir, entry.name, file), entry.name);
            }
        }
    }

    logger.info(`Loaded ${loaded} commands (${client.aliases.size} aliases, ${client.triggers.size} triggers)`);
};
