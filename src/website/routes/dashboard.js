const express = require('express');
const config = require('../../config');
const db = require('../../utils/database');
const oauth = require('../oauth');
const { botGuildIds, botGuildInfo, botGuildChannels, inviteUrl } = require('../guilds');
const { renderPicker } = require('../views/picker');
const dashPages = require('../views/dashPages');
const { renderError } = require('../views/error');

// Everything behind Discord login: server picker + per-guild configuration.
//
//   GET  /dashboard               server picker
//   GET  /dashboard/:id           overview
//   GET  /dashboard/:id/general   prefix
//   GET  /dashboard/:id/modules   category toggles
//   GET  /dashboard/:id/commands  per-command toggles
//   GET  /dashboard/:id/moderation  modlog channel
//   POST /dashboard/:id/settings  saves any section (field "section")

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
        const [warns, tempbans, channels] = await Promise.all([
            db.countWarns(req.guild.id),
            db.countTempbans(req.guild.id),
            botGuildChannels(client, req.guild.id).catch(() => []),
        ]);
        const base = await common(req);
        const modlogName = channels.find((c) => c.id === base.settings.modlogChannel)?.name;
        res.send(
            dashPages.renderOverview({
                ...base,
                stats: { warns, tempbans, commands: client.commands.size, modlogName },
            })
        );
    });

    router.get('/:id/general', loadGuild, async (req, res) =>
        res.send(dashPages.renderGeneral(await common(req)))
    );

    router.get('/:id/modules', loadGuild, async (req, res) =>
        res.send(dashPages.renderModules(await common(req)))
    );

    router.get('/:id/commands', loadGuild, async (req, res) =>
        res.send(dashPages.renderCommands(await common(req)))
    );

    router.get('/:id/moderation', loadGuild, async (req, res) => {
        const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
        res.send(dashPages.renderModeration({ ...(await common(req)), channels }));
    });

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
        } else {
            return res.status(400).send(renderError({ status: 400, message: 'Unknown settings section.' }));
        }

        await db.saveGuildSettings(req.guild.id, settings);
        res.redirect(`/dashboard/${req.guild.id}/${back}?saved=1`);
    });

    return router;
};
