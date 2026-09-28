const { Events } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const sentry = require('../utils/sentry');
const db = require('../utils/database');
const { sendError } = require('../helpers/embeds');
const { gateCommand } = require('../helpers/commandGate');
const automod = require('../utils/automod');
const leveling = require('../utils/leveling');

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
        if (settings) leveling.awardXp(message, settings.leveling).catch(() => {});

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
                // Custom triggers — tags flagged "trigger" fire without a prefix.
                const tagContent = await db.useTag(message.guild.id, first.toLowerCase(), true).catch(() => null);
                if (tagContent)
                    return message
                        .reply({ content: tagContent, allowedMentions: { parse: [] } })
                        .catch(() => {});
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
        if (!command) return;

        // Anti-spam, dashboard toggles, permission and cooldown gates — shared
        // with slash commands via helpers/commandGate.
        if (await gateCommand(message, command, client)) return;

        try {
            await command.execute(message, args, client);
        } catch (err) {
            logger.error(`Command "${command.name}" failed:`, err);
            sentry.capture(err);
            await sendError(message, 'Something went wrong while running that command.');
        }
    },
};
