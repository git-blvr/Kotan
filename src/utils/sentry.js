const os = require('node:os');
const logger = require('./logger');
const pkg = require('../../package.json');

// Optional Sentry integration — activate by installing @sentry/node and
// setting SENTRY_DSN in .env. Without either, this is a silent no-op and
// nothing breaks.
//
// Env knobs:
//   SENTRY_DSN           — the project's DSN (required, off when unset)
//   SENTRY_ENVIRONMENT   — defaults to NODE_ENV, then 'production'
//   SENTRY_TRACES=0.1    — performance tracing sample rate (0-1, off default)
//   SENTRY_PROFILES=0.1  — CPU profiling sample rate (needs @sentry/profiling-node)
//
// Every capture() also prints a SENTRY line to the terminal so you can see
// it reporting in real time; the full stack trace is already logged by the
// caller.

let sentry = null;

if (process.env.SENTRY_DSN) {
    try {
        sentry = require('@sentry/node');

        const integrations = [];
        const profilesRate = Number(process.env.SENTRY_PROFILES || 0);
        if (profilesRate > 0) {
            try {
                const { nodeProfilingIntegration } = require('@sentry/profiling-node');
                integrations.push(nodeProfilingIntegration());
            } catch {
                logger.warn('SENTRY_PROFILES is set but @sentry/profiling-node could not load — profiling off');
            }
        }

        const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production';
        sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment,
            release: `kotan@${pkg.version}`,
            serverName: os.hostname(),
            integrations,
            tracesSampleRate: Number(process.env.SENTRY_TRACES || 0),
            profilesSampleRate: integrations.length ? profilesRate : 0,
            sendDefaultPii: false,
        });
        const dsnHost = process.env.SENTRY_DSN.split('@')[1]?.split('/')[0] || '?';
        logger.sentry(
            `enabled — env=${environment} release=kotan@${pkg.version}` +
            ` traces=${Number(process.env.SENTRY_TRACES || 0) * 100}% profiles=${integrations.length ? profilesRate * 100 + '%' : 'off'} → ${dsnHost}`
        );
    } catch {
        logger.warn('SENTRY_DSN is set but @sentry/node is not installed — run: npm i @sentry/node');
        sentry = null;
    }
}

// capture(err, { kind, command, subcommand, customId, guild, user, ... })
// kind: 'command' | 'slash' | 'component' | 'modal' | 'process' | free text.
function capture(err, context = {}) {
    if (!sentry) return;
    logger.sentry(`captured ${context.kind || 'error'}${context.command ? ` "${context.command}"` : ''} → ${err?.message || err}`);
    sentry.withScope((scope) => {
        if (context.kind) scope.setTag('kind', context.kind);
        if (context.command) scope.setTag('command', context.command);
        if (context.subcommand) scope.setTag('subcommand', context.subcommand);
        if (context.guild) scope.setTag('guild', context.guild);
        if (context.user) scope.setUser({ id: context.user });
        const extras = { ...context };
        delete extras.user; // already on the scope's user field
        if (Object.keys(extras).length) scope.setContext('kotan', extras);
        sentry.captureException(err);
    });
}

module.exports = {
    enabled: Boolean(sentry),
    capture,
    // Flush pending events before exit — await this in shutdown paths.
    close: (timeout = 2000) => (sentry ? sentry.close(timeout) : Promise.resolve()),
};
