// Small console logger with timestamps, colors and cluster awareness.
// Every cluster (index.js) and the bot process share this so logs are
// always tagged with where they came from.

const colors = {
    reset: '\x1b[0m',
    gray: '\x1b[90m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

const clusterId = process.env.CLUSTER; // set by discord-hybrid-sharding
const scope = clusterId !== undefined ? `[Cluster ${clusterId}] ` : '';

function stamp() {
    return `${colors.gray}${new Date().toLocaleTimeString('en-GB')}${colors.reset}`;
}

function line(color, level, args) {
    return [`${stamp()} ${scope}${color}${level}${colors.reset}`, ...args];
}

module.exports = {
    info: (...args) => console.log(...line(colors.cyan, 'INFO ', args)),
    success: (...args) => console.log(...line(colors.green, 'OK   ', args)),
    warn: (...args) => console.warn(...line(colors.yellow, 'WARN ', args)),
    error: (...args) => console.error(...line(colors.red, 'ERROR', args)),
};
