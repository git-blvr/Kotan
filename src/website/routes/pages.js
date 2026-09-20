const express = require('express');
const config = require('../../config');
const { botStats, inviteUrl } = require('../guilds');
const { renderHome } = require('../views/home');
const { renderDocs } = require('../views/docs');
const { renderPrivacy, renderTos } = require('../views/legal');

// Public pages: home, documentation, privacy, tos.
module.exports = function pagesRouter(client) {
    const router = express.Router();
    const user = (req) => req.session.user || null;

    router.get('/', async (req, res) => {
        const stats = await botStats(client).catch(() => ({ guilds: 0, users: 0 }));
        res.send(
            renderHome({
                user: user(req),
                stats,
                commands: client.commands.size,
                avatarUrl: client.user.displayAvatarURL({ size: 128 }),
                inviteUrl: inviteUrl(client),
            })
        );
    });

    router.get('/doc', (req, res) => {
        res.send(renderDocs({ user: user(req), commands: client.commands, prefix: config.prefix }));
    });

    // Health endpoint for uptime monitors (UptimeRobot, Better Stack...).
    router.get('/status', (req, res) => {
        res.json({
            status: 'ok',
            uptime: Math.floor(process.uptime()),
            guilds: client.guilds.cache.size,
            timestamp: Date.now(),
        });
    });

    router.get('/privacy', (req, res) => res.send(renderPrivacy({ user: user(req) })));
    router.get('/tos', (req, res) => res.send(renderTos({ user: user(req) })));

    return router;
};
