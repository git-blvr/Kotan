const logger = require('./logger');

// Optional Sentry integration — activate by installing @sentry/node and
// setting SENTRY_DSN in .env. Without either, this is a silent no-op and
// nothing breaks.

let sentry = null;

if (process.env.SENTRY_DSN) {
    try {
        sentry = require('@sentry/node');
        sentry.init({ dsn: process.env.SENTRY_DSN });
        logger.info('Sentry enabled');
    } catch {
        logger.warn('SENTRY_DSN is set but @sentry/node is not installed — run: npm i @sentry/node');
    }
}

module.exports = {
    enabled: Boolean(sentry),
    capture: (err) => sentry?.captureException(err),
};
