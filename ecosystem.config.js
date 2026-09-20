// PM2 process config — `pm2 start ecosystem.config.js`.
//
// IMPORTANT: keep instances:1 + fork mode — a second instance would double-
// login the same token and fight over the SQLite file.

module.exports = {
    apps: [
        {
            name: 'kotan',
            script: 'index.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            max_memory_restart: '500M', // restart on memory leaks
            restart_delay: 3000,
            kill_timeout: 10_000, // let the bot flush the DB on SIGTERM
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
