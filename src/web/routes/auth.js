const env = require('../env');
const oauth = require('../oauth');
const sessions = require('../sessionStore');
const { COOKIE, cookieHeader } = require('../auth');
const { isDeveloper } = require('../permissions');
const blacklist = require('../blacklist');
const { rateLimit } = require('../rateLimit');

module.exports = async (app) => {
    const authLimit = rateLimit({ max: 20 });

    // /auth/discord → Discord authorize URL. `next` rides inside the signed state.
    app.get('/auth/discord', { preHandler: authLimit }, async (req, reply) => {
        return reply.redirect(oauth.authorizeUrl(oauth.safeNext(req.query.next) || '/dashboard'));
    });

    app.get('/auth/callback', { preHandler: authLimit }, async (req, reply) => {
        const state = oauth.readState(req.query.state);
        if (!state || !req.query.code) return reply.redirect('/login?error=oauth');

        const tokens = await oauth.exchangeCode(String(req.query.code));
        if (!tokens?.access_token) return reply.redirect('/login?error=oauth');

        const [user, guilds] = await Promise.all([
            oauth.fetchUser(tokens.access_token),
            oauth.fetchGuilds(tokens.access_token),
        ]);
        if (!user?.id) return reply.redirect('/login?error=oauth');

        if (req.sid) await sessions.destroy(req.sid); // rotate — kill any pre-login session
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
        return reply.header('Set-Cookie', cookieHeader(COOKIE, sid, sessions.SESSION_TTL)).redirect(state.next);
    });

    app.get('/auth/logout', async (req, reply) => {
        if (req.sid) await sessions.destroy(req.sid);
        return reply.header('Set-Cookie', cookieHeader(COOKIE, '', 0)).redirect('/');
    });
};
