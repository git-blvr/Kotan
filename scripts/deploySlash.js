require('dotenv').config();
const { REST, Routes, Collection } = require('discord.js');
const loadCommands = require('../src/handlers/commandHandler');
const { toSlashJSON, isSlashReady } = require('../src/helpers/slash');
const logger = require('../src/utils/logger');

// Registers every prefix command as a global slash command. Usage:
//   node scripts/deploySlash.js          -> deploy
//   node scripts/deploySlash.js --dry    -> print the payload, don't send
//   node scripts/deploySlash.js --clear  -> wipe all global commands
//
// Global registrations can take up to an hour to appear in every client.

const NAME_RE = /^[-_\p{L}\p{N}]{1,32}$/u;

async function main() {
    const token = process.env.BOT_MAIN_TOKEN;
    const clientId = process.env.CLIENT_ID;
    if (!token || !clientId) {
        logger.error('BOT_MAIN_TOKEN and CLIENT_ID must be set in .env');
        process.exit(1);
    }

    // Reuse the real loader so registrations always match what's loaded.
    const client = { commands: new Collection(), aliases: new Collection(), triggers: new Collection() };
    loadCommands(client);

    const body = [];
    for (const command of client.commands.values()) {
        if (!isSlashReady(command)) continue; // prefix-only command — not registered
        if (!NAME_RE.test(command.name) || command.name !== command.name.toLowerCase()) {
            logger.warn(`Skipping "${command.name}" — not a valid slash command name`);
            continue;
        }
        try {
            body.push(toSlashJSON(command));
        } catch (err) {
            logger.warn(`Skipping "${command.name}" — ${err.message}`);
        }
    }

    if (process.argv.includes('--dry')) {
        console.log(JSON.stringify(body, null, 2));
        process.exit(0);
    }

    const rest = new REST({ version: '10' }).setToken(token);
    const route = Routes.applicationCommands(clientId);
    const payload = process.argv.includes('--clear') ? [] : body;
    const data = await rest.put(route, { body: payload });
    logger.info(`${process.argv.includes('--clear') ? 'Cleared' : 'Deployed'} ${data.length} global slash command(s)`);
    for (const c of data) logger.info(`  /${c.name}`);
    process.exit(0); // sqlite stays in WAL mode — abrupt exit is safe
}

main().catch((err) => {
    logger.error('Deploy failed:', err?.rawError?.errors ? JSON.stringify(err.rawError.errors, null, 2) : err);
    process.exit(1);
});
