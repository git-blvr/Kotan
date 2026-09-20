const express = require('express');
const config = require('../../config');
const db = require('../../utils/database');
const oauth = require('../oauth');
const { botGuildIds, botGuildInfo, botGuildChannels, botGuildRoles, inviteUrl } = require('../guilds');
const { renderPicker } = require('../views/picker');
const dashPages = require('../views/dashPages');
const { renderError } = require('../views/error');

// Everything behind Discord login: server picker + per-guild configuration.
//
//   GET  /dashboard               server picker
//   GET  /dashboard/:id             overview
//   GET  /dashboard/:id/general     prefix
//   GET  /dashboard/:id/modules     category toggles
//   GET  /dashboard/:id/commands    per-command toggles + usage
//   GET  /dashboard/:id/tags        custom commands
//   GET  /dashboard/:id/automod     spam/invite/blacklist/raid filters
//   GET  /dashboard/:id/moderation  modlog channel + activity chart
//   GET  /dashboard/:id/logging     server event log
//   GET  /dashboard/:id/welcome     join/leave messages
//   GET  /dashboard/:id/roles       autorole + reaction roles
//   GET  /dashboard/:id/economy     currency + daily reward
//   POST /dashboard/:id/settings    saves any section (field "section")

module.exports = function dashboardRouter(client) {
    const router = express.Router();

    // Gate: no session -> start the OAuth2 flow.
    router.use((req, res, next) => {
        if (!req.session.user) return res.redirect('/auth/login');
        next();
    });

    // The user's guild row from the OAuth guilds list — proves they may manage it.
    const managedGuild = (req) =>
        /^\d{17,20}$/.test(req.params.id)
            ? (req.session.guilds || []).find((g) => g.id === req.params.id && oauth.canManage(g))
            : null;

    // /dashboard — picker of servers the user manages
    router.get('/', async (req, res) => {
        const botIds = await botGuildIds(client).catch(() => new Set());
        const guilds = (req.session.guilds || [])
            .filter(oauth.canManage)
            .map((g) => ({
                id: g.id,
                name: g.name,
                icon: oauth.guildIcon(g),
                botIn: botIds.has(g.id),
            }))
            .sort((a, b) => Number(b.botIn) - Number(a.botIn) || a.name.localeCompare(b.name));

        res.send(
            renderPicker({
                user: req.session.user,
                guilds,
                inviteUrl: (guildId) => inviteUrl(client, guildId),
            })
        );
    });

    // Shared guard for /:id routes — resolves + authorizes the guild once.
    async function loadGuild(req, res, next) {
        const grant = managedGuild(req);
        if (!grant)
            return res
                .status(403)
                .send(renderError({ user: req.session.user, status: 403, message: 'You cannot manage this server.' }));

        const guild = await botGuildInfo(client, grant.id).catch(() => null);
        if (!guild)
            return res.status(404).send(
                renderError({
                    user: req.session.user,
                    status: 404,
                    message: 'Kotan is not in this server.',
                    link: { href: inviteUrl(client, grant.id), label: 'Invite Kotan' },
                })
            );

        req.guild = guild;
        req.session.csrf ||= oauth.newState();
        next();
    }

    const common = async (req) => ({
        user: req.session.user,
        guild: req.guild,
        settings: await db.getGuildSettings(req.guild.id),
        csrf: req.session.csrf,
        saved: req.query.saved === '1',
        commands: client.commands,
    });

    router.get('/:id', loadGuild, async (req, res) => {
        const [mod, usage, members, channels] = await Promise.all([
            db.getModActivity(req.guild.id),
            db.getCommandUsage(req.guild.id),
            db.getMemberGrowth(req.guild.id),
            botGuildChannels(client, req.guild.id).catch(() => []),
        ]);
        const base = await common(req);
        const modlogName = channels.find((c) => c.id === base.settings.modlogChannel)?.name;
        res.send(
            dashPages.renderOverview({
                ...base,
                stats: { mod, usage, members, modlogName },
            })
        );
    });

    router.get('/:id/general', loadGuild, async (req, res) =>
        res.send(dashPages.renderGeneral(await common(req)))
    );

    router.get('/:id/modules', loadGuild, async (req, res) =>
        res.send(dashPages.renderModules(await common(req)))
    );

    router.get('/:id/commands', loadGuild, async (req, res) => {
        const usage = await db.getCommandUsage(req.guild.id).catch(() => null);
        res.send(dashPages.renderCommands({ ...(await common(req)), usage }));
    });

    router.get('/:id/moderation', loadGuild, async (req, res) => {
        const [channels, mod] = await Promise.all([
            botGuildChannels(client, req.guild.id).catch(() => []),
            db.getModActivity(req.guild.id).catch(() => null),
        ]);
        res.send(dashPages.renderModeration({ ...(await common(req)), channels, mod }));
    });

    router.get('/:id/automod', loadGuild, async (req, res) =>
        res.send(dashPages.renderAutomod(await common(req)))
    );

    router.get('/:id/logging', loadGuild, async (req, res) => {
        const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
        res.send(dashPages.renderLogging({ ...(await common(req)), channels }));
    });

    router.get('/:id/welcome', loadGuild, async (req, res) => {
        const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
        res.send(dashPages.renderWelcome({ ...(await common(req)), channels }));
    });

    router.get('/:id/roles', loadGuild, async (req, res) => {
        const [channels, roles] = await Promise.all([
            botGuildChannels(client, req.guild.id).catch(() => []),
            botGuildRoles(client, req.guild.id).catch(() => []),
        ]);
        res.send(dashPages.renderRoles({ ...(await common(req)), channels, roles }));
    });

    router.get('/:id/tags', loadGuild, async (req, res) => {
        const tags = await db.getTags(req.guild.id).catch(() => ({}));
        res.send(dashPages.renderTags({ ...(await common(req)), tags }));
    });

    router.get('/:id/economy', loadGuild, async (req, res) =>
        res.send(dashPages.renderEconomy(await common(req)))
    );

    // POST /:id/settings — section field picks what to save.
    router.post('/:id/settings', loadGuild, async (req, res) => {
        if (req.body.csrf !== req.session.csrf)
            return res.status(403).send(renderError({ user: req.session.user, status: 403, message: 'Bad CSRF token.' }));

        const settings = await db.getGuildSettings(req.guild.id);
        const section = String(req.body.section || '');
        let back = '';

        if (section === 'general') {
            const prefix = String(req.body.prefix || '').trim();
            if (prefix && !/^[^\s]{1,5}$/.test(prefix))
                return res.status(400).send(
                    renderError({
                        user: req.session.user,
                        status: 400,
                        message: 'Prefix must be 1–5 characters with no spaces.',
                    })
                );
            settings.prefix = prefix || null; // empty resets to global default
            back = 'general';
        } else if (section === 'modules') {
            const modules = {};
            for (const cmd of client.commands.values()) {
                // unchecked checkboxes simply don't appear in the body
                modules[cmd.category] = req.body[`mod_${cmd.category}`] === 'on';
            }
            settings.modules = modules;
            back = 'modules';
        } else if (section === 'commands') {
            settings.disabledCommands = [...client.commands.keys()].filter(
                (name) => req.body[`cmd_${name}`] !== 'on'
            );
            back = 'commands';
        } else if (section === 'moderation') {
            const wanted = String(req.body.modlogChannel || '');
            const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
            settings.modlogChannel = channels.some((c) => c.id === wanted) ? wanted : null;
            back = 'moderation';
        } else if (section === 'automod') {
            const int = (v, lo, hi) => Math.min(hi, Math.max(lo, parseInt(v, 10) || 0));
            settings.automod = {
                antiInvite: req.body.antiInvite === 'on',
                blacklist: String(req.body.blacklist || '')
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .slice(0, 200),
                spamMax: int(req.body.spamMax, 0, 50),
                spamWindow: int(req.body.spamWindow, 2, 60),
                raidMax: int(req.body.raidMax, 0, 50),
                raidWindow: int(req.body.raidWindow, 2, 120),
                raidAction: req.body.raidAction === 'kick' ? 'kick' : 'alert',
            };
            back = 'automod';
        } else if (section === 'logging') {
            const wanted = String(req.body.logChannel || '');
            const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
            settings.logging = {
                channel: channels.some((c) => c.id === wanted) ? wanted : null,
                messageDelete: req.body.messageDelete === 'on',
                messageEdit: req.body.messageEdit === 'on',
                joinLeave: req.body.joinLeave === 'on',
                channelEvents: req.body.channelEvents === 'on',
            };
            back = 'logging';
        } else if (section === 'welcome') {
            const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
            const pick = (v) => (channels.some((c) => c.id === v) ? v : null);
            settings.welcome = {
                channel: pick(String(req.body.welcomeChannel || '')),
                message: String(req.body.welcomeMessage || '').slice(0, 500) || 'Welcome {user} to {server}!',
                goodbyeChannel: pick(String(req.body.goodbyeChannel || '')),
                goodbyeMessage: String(req.body.goodbyeMessage || '').slice(0, 500) || '**{username}** left {server}.',
            };
            back = 'welcome';
        } else if (section === 'roles') {
            const wanted = String(req.body.autorole || '');
            const roles = await botGuildRoles(client, req.guild.id).catch(() => []);
            settings.roles.autorole = roles.some((r) => r.id === wanted) ? wanted : null;
            back = 'roles';
        } else if (section === 'rr-add') {
            const [channels, roles] = await Promise.all([
                botGuildChannels(client, req.guild.id).catch(() => []),
                botGuildRoles(client, req.guild.id).catch(() => []),
            ]);
            const channelId = String(req.body.rrChannel || '');
            const messageId = String(req.body.rrMessage || '').trim();
            const emoji = String(req.body.rrEmoji || '').trim().slice(0, 64);
            const roleId = String(req.body.rrRole || '');
            const ok =
                channels.some((c) => c.id === channelId) &&
                /^\d{17,20}$/.test(messageId) &&
                emoji &&
                roles.some((r) => r.id === roleId);
            if (!ok)
                return res.status(400).send(
                    renderError({ user: req.session.user, status: 400, message: 'Invalid reaction role mapping.' })
                );
            settings.roles.reactionRoles = (settings.roles.reactionRoles || [])
                .filter((r) => !(r.messageId === messageId && r.emoji === emoji)) // replace same msg+emoji
                .slice(0, 24);
            settings.roles.reactionRoles.push({ channelId, messageId, emoji, roleId });
            back = 'roles';
        } else if (section === 'rr-del') {
            const idx = parseInt(req.body.idx, 10);
            if (settings.roles.reactionRoles?.[idx]) settings.roles.reactionRoles.splice(idx, 1);
            back = 'roles';
        } else if (section === 'tag-add') {
            const name = String(req.body.name || '').trim().toLowerCase();
            const content = String(req.body.content || '').trim();
            const added = content && (await db.addTag(req.guild.id, name, content, req.session.user.id));
            if (!added)
                return res.status(400).send(
                    renderError({
                        user: req.session.user,
                        status: 400,
                        message: 'Invalid tag — name must be 1–32 chars of a-z 0-9 - _ and content is required.',
                    })
                );
            back = 'tags';
        } else if (section === 'tag-del') {
            await db.deleteTag(req.guild.id, String(req.body.name || ''));
            back = 'tags';
        } else if (section === 'economy') {
            const currency = String(req.body.currency || '').trim().slice(0, 16);
            const dailyBase = parseInt(req.body.dailyBase, 10);
            settings.economy = {
                currency: currency || null,
                dailyBase: Number.isInteger(dailyBase) && dailyBase > 0 && dailyBase <= 1_000_000 ? dailyBase : null,
            };
            back = 'economy';
        } else {
            return res.status(400).send(renderError({ status: 400, message: 'Unknown settings section.' }));
        }

        await db.saveGuildSettings(req.guild.id, settings);
        res.redirect(`/dashboard/${req.guild.id}/${back}?saved=1`);
    });

    return router;
};
