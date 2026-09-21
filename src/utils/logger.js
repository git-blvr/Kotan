// Small console logger with timestamps and colors.

const colors = {
    reset: '\x1b[0m',
    gray: '\x1b[90m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
};

function stamp() {
    return `${colors.gray}${new Date().toLocaleTimeString('en-GB')}${colors.reset}`;
}

function line(color, level, args) {
    return [`${stamp()} ${color}${level}${colors.reset}`, ...args];
}

module.exports = {
    info: (...args) => console.log(...line(colors.cyan, 'INFO ', args)),
    success: (...args) => console.log(...line(colors.green, 'DONE ', args)),
    warn: (...args) => console.warn(...line(colors.yellow, 'WARN ', args)),
    error: (...args) => console.error(...line(colors.red, 'ERROR', args)),
    debug: (...args) => console.log(...line(colors.gray, 'DEBUG', args)), 
    bot: (...args) => console.log(...line(colors.cyan, 'BOT ', args)), 
};
