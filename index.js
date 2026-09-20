require('dotenv').config();
const logger = require('./src/utils/logger');

// Entry point. npm start / pm2 run this file; it simply boots the bot
// process (src/bot.js), which owns all crash + shutdown handling.

if (!process.env.BOT_MAIN_TOKEN) {
    logger.error('BOT_MAIN_TOKEN is not set in .env');
    process.exit(1);
}

require('./src/bot');
