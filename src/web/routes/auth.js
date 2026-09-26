const express = require('express');
const env = require('../env');
const oauth = require('../oauth');
const sessions = require('../sessionStore');
const { COOKIE, cookieHeader } = require('../auth');
const { isDeveloper } = require('../permissions');
const blacklist = require('../blacklist');
const { rateLimit } = require('../rateLimit');

const router = express.Router();

// /auth/discord → Discord authorize URL. `next` rides inside the signed state.
router.get('/auth/discord', rateLimit({ max: 20 }), (req, res) => {
    const next = typeof req.query.next === 'string' && req.query.next.startsWith('/') ? req.query.next : '/dashboard';
    res.redirect(oauth.authorizeUrl(next));
});

router.get('/auth/callback', rateLimit({ max: 20 }), async (req, res) => {
    const state = oauth.readState(req.query.state);
    if (!state || !req.query.code) return res.redirect('/login?error=oauth');

    const tokens = await oauth.exchangeCode(String(req.query.code));
    if (!tokens?.access_token) return res.redirect('/login?error=oauth');

    const [user, guilds] = await Promise.all([
        oauth.fetchUser(tokens.access_token),
        oauth.fetchGuilds(tokens.access_token),
    ]);
    if (!user?.id) return res.redirect('/login?error=oauth');

    const sid = await sessions.create({
        user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            developer: isDeveloper(user.id),
        },
        guilds: Array.isArray(guilds) ? guilds.map((g) => ({
            id: g.id, name: g.name, icon: g.icon, owner: !!g.owner, permissions: g.permissions,
        })) : [],
    });
    res.set('Set-Cookie', cookieHeader(COOKIE, sid, sessions.SESSION_TTL));
    res.redirect(state.next);
});

router.get('/auth/logout', async (req, res) => {
    if (req.sid) await sessions.destroy(req.sid);
    res.set('Set-Cookie', cookieHeader(COOKIE, '', 0));
    res.redirect('/');
});

module.exports = router;
