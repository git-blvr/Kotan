// Small console logger with timestamps and colors.

const colors = {
    reset: '\x1b[0m',
    gray: '\x1b[90m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m',
};

function stamp() {
    return `${colors.gray}${new Date().toLocaleTimeString('en-GB')}${colors.reset}`;
}

function line(color, level, args) {
    return [`${stamp()} ${color}${level}${colors.reset}`, ...args];
}

// HTTP request logger — toggle with WEB_REQUEST_LOG=true env var or
// at runtime via logger.httpLog.enabled = true/false.
const httpLog = {
    // Default ON when WEB_REQUEST_LOG=true; defaults OFF to keep prod logs clean.
    enabled: process.env.WEB_REQUEST_LOG === 'true',

    // Fastify onResponse hook — call app.addHook('onResponse', logger.httpLog.hook)
    hook: async (req, reply) => {
        if (!httpLog.enabled) return;
        const ms = reply.elapsedTime?.toFixed(1) ?? '?';
        const status = reply.statusCode;
        // Color-code: green 2xx, yellow 3xx/4xx, red 5xx
        const sc = status >= 500 ? colors.red : status >= 300 ? colors.yellow : colors.green;
        const method = (req.method || 'GET').padEnd(6);
        const url = req.url || '/';
        const ip = req.ip || '-';
        console.log(
            `${stamp()} ${colors.blue}HTTP  ${colors.reset}`,
            `${sc}${status}${colors.reset}`,
            `${method} ${url}`,
            `${colors.gray}${ms}ms ${ip}${colors.reset}`,
        );
    },
};

module.exports = {
    info: (...args) => console.log(...line(colors.cyan, 'INFO ', args)),
    success: (...args) => console.log(...line(colors.green, 'DONE ', args)),
    warn: (...args) => console.warn(...line(colors.yellow, 'WARN ', args)),
    error: (...args) => console.error(...line(colors.red, 'ERROR', args)),
    debug: (...args) => console.log(...line(colors.gray, 'DEBUG', args)),
    bot: (...args) => console.log(...line(colors.cyan, 'BOT  ', args)),
    sentry: (...args) => console.log(...line(colors.magenta, 'SENTY', args)),
    httpLog,
};
