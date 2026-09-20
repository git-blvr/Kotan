// PM2 process config — `pm2 start ecosystem.config.js`.
//
// IMPORTANT: keep instances:1 + fork mode. discord-hybrid-sharding is already
// the process supervisor — PM2 only watches the manager, not the clusters.

module.exports = {
    apps: [
        {
            name: 'kotan',
            script: 'index.js',
            instances: 1,
            exec_mode: 'fork',
            autorestart: true,
            max_memory_restart: '500M', // restart if the manager itself leaks
            restart_delay: 3000,
            kill_timeout: 10_000, // let clusters flush the DB on SIGTERM
            env: {
                NODE_ENV: 'production',
            },
        },
    ],
};
