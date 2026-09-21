const express = require('express');
const config = require('../../config');
const db = require('../../utils/database');
const oauth = require('../oauth');
const { botGuildIds, botGuildInfo, botGuildChannels, botGuildRoles, botGuildMember, botGuildMessages, botGuildEmojis, inviteUrl } = require('../guilds');
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
//   GET  /dashboard/:id/leveling    xp + level-up config + role rewards
//   GET  /dashboard/:id/access      dashboard access tiers + audit trail
//   GET  /dashboard/theme           per-user appearance (accent/mode/size)
//   POST /dashboard/:id/settings    saves any section (field "section")

// Access tiers, lowest to highest. 'manager' = Discord ManageGuild/owner via
// OAuth — always allowed. Other tiers come from dashboard-assigned roles.
const TIER_RANK = { member: 0, mod: 1, admin: 2, manager: 3 };
const TIER_LABELS = { member: 'Members', mod: 'Mods', admin: 'Admins', manager: 'Managers only' };

module.exports = function dashboardRouter(client) {
    const router = express.Router();

    // Gate: no session -> start the OAuth2 flow.
    router.use((req, res, next) => {
        if (!req.session.user) return res.redirect('/auth/login');
        req.session.csrf ||= oauth.newState();
        next();
    });

    // The user's guild row from the OAuth guilds list — proves they may manage it.
    const managedGuild = (req) =>
        /^\d{17,20}$/.test(req.params.id)
            ? (req.session.guilds || []).find((g) => g.id === req.params.id && oauth.canManage(g))
            : null;

    // Resolves the caller's dashboard tier for a guild: OAuth managers are
    // 'manager'; everyone else needs a mod/admin role assigned on the Access
    // page (plain members get 'member' tier, which only unlocks sections that
    // were explicitly opened to members).
    async function resolveAccess(req, settings) {
        if (managedGuild(req)) return { tier: 'manager' };
        const member = await botGuildMember(client, req.params.id, req.session.user.id).catch(() => null);
        if (!member) return null;
        const a = settings?.access;
        if (a?.adminRoles?.some((r) => member.roles.cache.has(r))) return { tier: 'admin', member };
        if (a?.modRoles?.some((r) => member.roles.cache.has(r))) return { tier: 'mod', member };
        return { tier: 'member', member };
    }

    // /dashboard — picker of servers the user can open the dashboard for
    router.get('/', async (req, res) => {
        const botIds = await botGuildIds(client).catch(() => new Set());
        const mine = req.session.guilds || [];
        const guilds = [];

        for (const g of mine) {
            if (oauth.canManage(g)) {
                guilds.push({ id: g.id, name: g.name, icon: oauth.guildIcon(g), botIn: botIds.has(g.id) });
                continue;
            }
            // Not a manager — visible only if the bot is in the guild and the
            // member holds an access role.
            if (!botIds.has(g.id)) continue;
            const [settings, member] = await Promise.all([
                db.getGuildSettings(g.id).catch(() => null),
                botGuildMember(client, g.id, req.session.user.id).catch(() => null),
            ]);
            const a = settings?.access;
            if (member && (a?.adminRoles?.some((r) => member.roles.cache.has(r)) || a?.modRoles?.some((r) => member.roles.cache.has(r))))
                guilds.push({ id: g.id, name: g.name, icon: oauth.guildIcon(g), botIn: true });
        }

        guilds.sort((a, b) => Number(b.botIn) - Number(a.botIn) || a.name.localeCompare(b.name));
        res.send(
            renderPicker({
                user: req.session.user,
                guilds,
                inviteUrl: (guildId) => inviteUrl(client, guildId),
            })
        );
    });

    // Per-user appearance — not guild-scoped, stored on the session.
    router.get('/theme', (req, res) => {
        res.send(dashPages.renderTheme({ user: req.session.user, theme: req.session.theme, saved: req.query.saved === '1', csrf: req.session.csrf }));
    });
    router.post('/theme', (req, res) => {
        if (req.body.csrf !== req.session.csrf)
            return res.status(403).send(renderError({ user: req.session.user, status: 403, message: 'Bad CSRF token.' }));
        const accent = /^#[0-9a-fA-F]{6}$/.test(req.body.accent || '') ? req.body.accent : '#5865f2';
        req.session.theme = {
            accent,
            mode: ['dark', 'light', 'auto'].includes(req.body.mode) ? req.body.mode : 'dark',
            sidebar: req.body.sidebar === 'compact' ? 'compact' : 'comfortable',
            font: ['normal', 'large', 'larger'].includes(req.body.font) ? req.body.font : 'normal',
            motion: req.body.motion === 'reduced' ? 'reduced' : 'on',
        };
        res.redirect('/dashboard/theme?saved=1');
    });

    // Shared guard for /:id routes — resolves guild + access tier once.
    async function loadGuild(req, res, next) {
        const settings = await db.getGuildSettings(req.params.id).catch(() => null);
        const access = await resolveAccess(req, settings);
        if (!access)
            return res.status(403).send(
                renderError({ user: req.session.user, status: 403, message: 'You do not have dashboard access to this server.' })
            );

        const guild = await botGuildInfo(client, req.params.id).catch(() => null);
        if (!guild)
            return res.status(404).send(
                renderError({
                    user: req.session.user,
                    status: 404,
                    message: 'Kotan is not in this server.',
                    link: { href: inviteUrl(client, req.params.id), label: 'Invite Kotan' },
                })
            );

        req.guild = guild;
        req.tier = access.tier;
        req.guildSettings = settings;
        req.session.csrf ||= oauth.newState();
        next();
    }

    // Section gate — compares the caller's tier against the configured
    // requirement for a page. Missing config = 'manager' (unchanged default).
    const requireTier = (slug) => async (req, res, next) => {
        const need = req.guildSettings?.access?.sections?.[slug || 'overview'] ?? 'manager';
        if ((TIER_RANK[req.tier] ?? 0) < TIER_RANK[need])
            return res.status(403).send(
                renderError({
                    user: req.session.user,
                    status: 403,
                    message: `This section requires ${TIER_LABELS[need]} access.`,
                })
            );
        next();
    };

    const common = async (req) => {
        const settings = req.guildSettings ?? (await db.getGuildSettings(req.guild.id));
        const rank = TIER_RANK[req.tier] ?? 3;
        return {
            user: req.session.user,
            guild: req.guild,
            settings,
            csrf: req.session.csrf,
            saved: req.query.saved === '1',
            commands: client.commands,
            tier: req.tier,
            theme: req.session.theme,
            // Which sidebar items this user may see.
            allowed: (slug) => rank >= TIER_RANK[settings.access?.sections?.[slug || 'overview'] ?? 'manager'],
        };
    };

    // Resolves user ids to display names for the activity feeds.
    const resolveNames = async (ids) => {
        const names = {};
        for (const id of [...new Set(ids)].slice(0, 12))
            names[id] = (await client.users.fetch(id).catch(() => null))?.username || 'unknown';
        return names;
    };

    router.get('/:id', loadGuild, requireTier(''), async (req, res) => {
        const [mod, usage, members, channels, modRecent] = await Promise.all([
            db.getModActivity(req.guild.id),
            db.getCommandUsage(req.guild.id),
            db.getMemberGrowth(req.guild.id),
            botGuildChannels(client, req.guild.id).catch(() => []),
            db.getRecentModActions(req.guild.id).catch(() => []),
        ]);
        const base = await common(req);
        const modlogName = channels.find((c) => c.id === base.settings.modlogChannel)?.name;
        const names = await resolveNames([
            ...(usage.recent || []).map((r) => r.userId),
            ...modRecent.flatMap((r) => [r.userId, r.moderatorId]),
        ]);
        res.send(
            dashPages.renderOverview({
                ...base,
                stats: { mod, usage, members, modlogName, modRecent, names },
            })
        );
    });

    router.get('/:id/general', loadGuild, requireTier('general'), async (req, res) =>
        res.send(dashPages.renderGeneral(await common(req)))
    );

    router.get('/:id/modules', loadGuild, requireTier('modules'), async (req, res) => {
        const roles = await botGuildRoles(client, req.guild.id).catch(() => []);
        res.send(dashPages.renderModules({ ...(await common(req)), roles }));
    });

    router.get('/:id/commands', loadGuild, requireTier('commands'), async (req, res) => {
        const usage = await db.getCommandUsage(req.guild.id).catch(() => null);
        res.send(dashPages.renderCommands({ ...(await common(req)), usage }));
    });

    router.get('/:id/moderation', loadGuild, requireTier('moderation'), async (req, res) => {
        const [channels, mod] = await Promise.all([
            botGuildChannels(client, req.guild.id).catch(() => []),
            db.getModActivity(req.guild.id).catch(() => null),
        ]);
        res.send(dashPages.renderModeration({ ...(await common(req)), channels, mod }));
    });

    router.get('/:id/automod', loadGuild, requireTier('automod'), async (req, res) =>
        res.send(dashPages.renderAutomod(await common(req)))
    );

    router.get('/:id/logging', loadGuild, requireTier('logging'), async (req, res) => {
        const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
        res.send(dashPages.renderLogging({ ...(await common(req)), channels }));
    });

    router.get('/:id/welcome', loadGuild, requireTier('welcome'), async (req, res) => {
        const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
        res.send(dashPages.renderWelcome({ ...(await common(req)), channels }));
    });

    router.get('/:id/roles', loadGuild, requireTier('roles'), async (req, res) => {
        const [channels, roles, emojis] = await Promise.all([
            botGuildChannels(client, req.guild.id).catch(() => []),
            botGuildRoles(client, req.guild.id).catch(() => []),
            botGuildEmojis(client, req.guild.id).catch(() => []),
        ]);
        res.send(dashPages.renderRoles({ ...(await common(req)), channels, roles, emojis }));
    });

    // JSON: recent messages of a channel — feeds the reaction-role picker.
    router.get('/:id/messages', loadGuild, requireTier('roles'), async (req, res) => {
        const msgs = await botGuildMessages(client, req.guild.id, String(req.query.channel || ''));
        res.json(msgs);
    });

    router.get('/:id/tags', loadGuild, requireTier('tags'), async (req, res) => {
        const tags = await db.getTags(req.guild.id).catch(() => ({}));
        res.send(dashPages.renderTags({ ...(await common(req)), tags }));
    });

    router.get('/:id/economy', loadGuild, requireTier('economy'), async (req, res) =>
        res.send(dashPages.renderEconomy(await common(req)))
    );

    router.get('/:id/leveling', loadGuild, requireTier('leveling'), async (req, res) => {
        const [channels, roles] = await Promise.all([
            botGuildChannels(client, req.guild.id).catch(() => []),
            botGuildRoles(client, req.guild.id).catch(() => []),
        ]);
        res.send(dashPages.renderLeveling({ ...(await common(req)), channels, roles }));
    });

    router.get('/:id/access', loadGuild, requireTier('access'), async (req, res) => {
        const [roles, auditLog] = await Promise.all([
            botGuildRoles(client, req.guild.id).catch(() => []),
            db.getAudit(req.guild.id, 15).catch(() => []),
        ]);
        // Resolve audit user ids to display names where possible.
        const names = {};
        for (const e of auditLog) {
            if (!names[e.userId])
                names[e.userId] = (await client.users.fetch(e.userId).catch(() => null))?.username || e.userId;
        }
        res.send(dashPages.renderAccess({ ...(await common(req)), roles, auditLog, names }));
    });

    // POST /:id/settings — section field picks what to save.
    router.post('/:id/settings', loadGuild, async (req, res) => {
        if (req.body.csrf !== req.session.csrf)
            return res.status(403).send(renderError({ user: req.session.user, status: 403, message: 'Bad CSRF token.' }));

        const settings = req.guildSettings ?? (await db.getGuildSettings(req.guild.id));
        const section = String(req.body.section || '');

        // Per-section access gate — POSTs respect the same tiers as GETs.
        const SECTION_SLUG = {
            general: 'general', overview: 'general', modules: 'modules', commands: 'commands',
            'tag-add': 'tags', 'tag-del': 'tags', automod: 'automod', moderation: 'moderation',
            logging: 'logging', welcome: 'welcome', roles: 'roles', 'rr-add': 'roles',
            'rr-del': 'roles', economy: 'economy', leveling: 'leveling', 'lr-add': 'leveling',
            'lr-del': 'leveling', access: 'access',
        };
        const slug = SECTION_SLUG[section];
        if (slug) {
            const need = settings.access?.sections?.[slug] ?? 'manager';
            if ((TIER_RANK[req.tier] ?? 0) < TIER_RANK[need])
                return res.status(403).send(
                    renderError({ user: req.session.user, status: 403, message: 'Insufficient dashboard access for this section.' })
                );
        }

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
            const moduleRoles = {};
            const allRoles = await botGuildRoles(client, req.guild.id).catch(() => []);
            for (const cmd of client.commands.values()) {
                // unchecked checkboxes simply don't appear in the body
                modules[cmd.category] = req.body[`mod_${cmd.category}`] === 'on';
            }
            for (const cat of Object.keys(modules)) {
                // role multi-selects submit as arrays (single pick = string)
                const raw = req.body[`mroles_${cat}`];
                const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((id) =>
                    allRoles.some((r) => r.id === id)
                );
                if (ids.length) moduleRoles[cat] = ids;
            }
            settings.modules = modules;
            settings.moduleRoles = moduleRoles;
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
        } else if (section === 'leveling') {
            const channels = await botGuildChannels(client, req.guild.id).catch(() => []);
            const int = (v, lo, hi) => Math.min(hi, Math.max(lo, parseInt(v, 10) || 0));
            const mult = Math.min(10, Math.max(0.1, parseFloat(req.body.multiplier) || 1));
            const xpMin = int(req.body.xpMin, 1, 500);
            const xpMax = Math.max(xpMin, int(req.body.xpMax, 1, 500));
            const wanted = String(req.body.channel || '');
            settings.leveling = {
                enabled: req.body.lv_enabled === 'on',
                xpMin,
                xpMax,
                cooldown: int(req.body.cooldown, 0, 600),
                multiplier: mult,
                announce: req.body.lv_announce === 'on',
                channel: channels.some((c) => c.id === wanted) ? wanted : null,
                message: String(req.body.message || '').slice(0, 300) || 'GG {user} — you reached **level {level}**!',
                rewards: settings.leveling?.rewards || [],
            };
            back = 'leveling';
        } else if (section === 'lr-add') {
            const roles = await botGuildRoles(client, req.guild.id).catch(() => []);
            const level = parseInt(req.body.lvLevel, 10);
            const roleId = String(req.body.lvRole || '');
            if (!Number.isInteger(level) || level < 1 || !roles.some((r) => r.id === roleId))
                return res
                    .status(400)
                    .send(renderError({ user: req.session.user, status: 400, message: 'Invalid level reward.' }));
            settings.leveling.rewards = (settings.leveling.rewards || [])
                .filter((r) => r.level !== level) // one reward per level
                .slice(0, 49);
            settings.leveling.rewards.push({ level, roleId });
            settings.leveling.rewards.sort((a, b) => a.level - b.level);
            back = 'leveling';
        } else if (section === 'lr-del') {
            const idx = parseInt(req.body.idx, 10);
            if (settings.leveling.rewards?.[idx]) settings.leveling.rewards.splice(idx, 1);
            back = 'leveling';
        } else if (section === 'access') {
            const allRoles = await botGuildRoles(client, req.guild.id).catch(() => []);
            const ids = (v) =>
                (Array.isArray(v) ? v : v ? [v] : []).filter((id) => allRoles.some((r) => r.id === id));
            const sections = {};
            for (const key of Object.keys(req.body)) {
                const m = key.match(/^sec_(.+)$/);
                if (m && ['member', 'mod', 'admin', 'manager'].includes(req.body[key]))
                    sections[m[1]] = req.body[key];
            }
            settings.access = {
                modRoles: ids(req.body.modRoles),
                adminRoles: ids(req.body.adminRoles),
                sections,
            };
            back = 'access';
        } else if (section === 'overview') {
            // Ordered stat cards — checkbox presence + numeric order fields.
            const picks = ['members', 'commands', 'warns', 'tempbans']
                .filter((c) => req.body[`ov_${c}`] === 'on')
                .map((c) => ({ c, o: parseInt(req.body[`ord_${c}`], 10) || 99 }));
            picks.sort((a, b) => a.o - b.o);
            settings.overview = { cards: picks.length ? picks.map((p) => p.c) : ['members', 'commands', 'warns', 'tempbans'] };
            back = 'general';
        } else {
            return res.status(400).send(renderError({ status: 400, message: 'Unknown settings section.' }));
        }

        await db.saveGuildSettings(req.guild.id, settings);
        db.logAudit(req.guild.id, req.session.user.id, section).catch(() => {});
        res.redirect(`/dashboard/${req.guild.id}/${back}?saved=1`);
    });

    return router;
};
