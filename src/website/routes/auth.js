const express = require('express');
const logger = require('../../utils/logger');
const oauth = require('../oauth');
const { renderError } = require('../views/error');

// Discord OAuth2: /auth/login -> discord authorize -> /auth/callback -> session.
module.exports = function authRouter(client, publicUrl) {
    const router = express.Router();

    router.get('/login', (req, res) => {
        if (!oauth.oauthEnabled(client)) {
            return res.status(503).send(
                renderError({
                    status: 503,
                    message: 'Login is not configured — CLIENT_SECRET is missing in .env.',
                })
            );
        }
        const state = oauth.newState();
        req.session.oauthState = state;
        res.redirect(oauth.authorizeUrl(client, publicUrl, state));
    });

    router.get('/callback', async (req, res) => {
        const { code, state } = req.query;
        if (!code || !state || state !== req.session.oauthState) {
            return res.status(400).send(renderError({ status: 400, message: 'Invalid OAuth2 callback.' }));
        }
        delete req.session.oauthState;

        try {
            const tokens = await oauth.exchangeCode(client, publicUrl, code);
            const [me, guilds] = await Promise.all([
                oauth.fetchMe(tokens.access_token),
                oauth.fetchMyGuilds(tokens.access_token),
            ]);
            req.session.user = {
                id: me.id,
                username: me.username,
                avatarUrl: oauth.avatarUrl(me),
            };
            req.session.guilds = guilds; // raw list incl. per-guild permissions
            res.redirect('/dashboard');
        } catch (err) {
            logger.error('OAuth callback failed:', err);
            res.status(502).send(renderError({ status: 502, message: 'Discord login failed. Try again.' }));
        }
    });

    router.get('/logout', (req, res) => {
        req.session.destroy(() => res.redirect('/'));
    });

    return router;
};
