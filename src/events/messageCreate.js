const { Events } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const db = require('../utils/database');
const { sendError } = require('../helpers/embeds');
const { gateCommand } = require('../helpers/commandGate');
const automod = require('../utils/automod');
const leveling = require('../utils/leveling');
const afk = require('../utils/afk');

// The heart of the bot: turns a raw message into a command call.
//
// Resolution order:
//   1. "<prefix><name or alias> [args]"  -> .ping, .bal @user
//   2. "<trigger> [args]"                -> "net" runs ping without a prefix

module.exports = {
    name: Events.MessageCreate,
    async execute(message, client) {
        if (message.author.bot || message.webhookId) return;

        // Developer guild blacklist — a blacklisted guild gets nothing, not
        // even an error reply or tag expansion (silent by design).
        if (message.guild && db.isGuildBlacklisted(message.guild.id)) return;

        // Activity tracking — feeds the dashboard's message/channel
        // leaderboards. Buffered in memory: a sync counter bump, not a
        // store write. Thread messages roll up to the parent channel.
        if (message.guild)
            db.trackMessage(
                message.guild.id,
                message.channel.isThread() ? message.channel.parentId || message.channel.id : message.channel.id,
                message.author.id
            );

        const content = message.content.trim();

        // Per-guild settings: prefix, module toggles, disabled
        // commands. One fetch covers all of it — settings are TTL-cached.
        const settings = message.guild ? await db.getGuildSettings(message.guild.id) : null;
        const prefix = settings?.prefix || config.prefix;
        message.prefix = prefix; // commands show this in usage hints
        message.guildSettings = settings; // commands reuse it (currency etc.)

        // Automod scans every message — invites, blacklist, spam velocity.
        // If it deleted the message we stop here, before command resolution.
        if (settings && (await automod.checkMessage(message, settings.automod, client))) return;

        // Leveling — every surviving message earns XP (commands included).
        // Fire-and-forget: never blocks or slows command resolution.
        if (settings) leveling.awardXp(message, settings).catch(() => {});

        let command = null;
        let args = [];
        let tagName = null; // prefix used but no builtin matched -> try tags

        if (content.startsWith(prefix)) {
            const body = content.slice(prefix.length).trim();
            if (!body) return;
            args = body.split(/\s+/);
            const name = args.shift().toLowerCase();
            command = client.commands.get(name) ?? client.commands.get(client.aliases.get(name));
            if (!command) tagName = name;
        } else {
            // Triggers let a plain word invoke a command ("net" -> ping).
            const [first, ...rest] = content.split(/\s+/);
            const trigger = client.triggers.get(first.toLowerCase());
            if (trigger) {
                command = client.commands.get(trigger);
                args = rest;
            } else if (message.guild) {
                // Bare-word triggers — the tag's content is a command line:
                // "balance @user" runs .balance. Words after the trigger word
                // append to the stored args, so "mycf 500" can expand a stored
                // "coinflip heads" into "coinflip heads 500".
                const tagContent = await db.useTag(message.guild.id, first.toLowerCase(), true).catch(() => null);
                if (tagContent) {
                    const [cname, ...cargs] = tagContent.split(/\s+/);
                    command = client.commands.get(cname.toLowerCase()) ?? client.commands.get(client.aliases.get(cname.toLowerCase()));
                    if (command) args = [...cargs, ...rest];
                    else
                        return message
                            .reply({ content: tagContent, allowedMentions: { parse: [] } }) // text trigger fallback
                            .catch(() => {});
                }
            }
        }

        // Custom commands (tags): "<prefix><tagname>" replies
        // with the saved text. Builtins always win over tags.
        if (!command && tagName && message.guild) {
            const tagContent = await db.useTag(message.guild.id, tagName);
            if (tagContent)
                return message
                    .reply({ content: tagContent, allowedMentions: { parse: [] } }) // tags can't mass-ping
                    .catch(() => {});
        }
        // AFK — runs for every surviving message (commands or not). A real
        // message clears your status; pinging an AFK member announces it.
        // `.afk` itself resolves to a command named afk and is excluded from
        // the self-clear so it can show status instead of wiping it.
        if (settings)
            afk.handleMessage(message, settings.afk, command?.name === 'afk').catch(() => {});

        if (!command) return;

        // Anti-spam, dashboard toggles, permission and cooldown gates — shared
        // with slash commands via helpers/commandGate.
        if (await gateCommand(message, command, client)) return;

        try {
            await command.execute(message, args, client);
        } catch (err) {
            logger.error(`Command "${command.name}" failed:`, err);
            sentry.capture(err, {
                kind: 'command', command: command.name,
                args: args.join(' ').slice(0, 200),
                user: message.author?.id, guild: message.guild?.id,
                channel: message.channel?.id,
            });
            await sendError(message, 'Something went wrong while running that command.');
        }
    },
};
