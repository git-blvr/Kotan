const { PermissionFlagsBits, ApplicationCommandOptionType: Opt } = require('discord.js');
const { success, sendError, cv2 } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const db = require('../../utils/database');
const { parseHM, validTz, describeRule } = require('../../utils/commandRules');

// Parses the scope tail of a prefix invocation: an optional channel (mention,
// #name, id, or bare name), an optional "HH:MM-HH:MM" window and an optional
// timezone name. Returns { channelId, start, end, tz, err }.
function parseScope(message, rest) {
    let channelId = null;
    let start = null;
    let end = null;

    const tm = rest.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (tm) {
        start = `${tm[1].padStart(2, '0')}:${tm[2]}`;
        end = `${tm[3].padStart(2, '0')}:${tm[4]}`;
        if (parseHM(start) == null || parseHM(end) == null)
            return { err: `Invalid time window \`${tm[0]}\` — use 24-hour \`HH:MM-HH:MM\`.` };
        rest = rest.replace(tm[0], ' ');
    }

    const cm = rest.match(/<#(\d{17,20})>|#([^\s#]+)|\b(\d{17,20})\b/);
    if (cm) {
        const id = cm[1] || cm[3];
        const name = cm[2];
        const ch = id
            ? message.guild.channels.cache.get(id)
            : message.guild.channels.cache.find((c) => c.name === name && c.isTextBased());
        if (!ch || !ch.isTextBased())
            return { err: `Channel \`${cm[0]}\` not found in this server.` };
        channelId = ch.id;
        rest = rest.replace(cm[0], ' ');
    }

    const tz = rest.trim().split(/\s+/)[0] || 'UTC';
    if (!validTz(tz))
        return { err: `Unknown timezone \`${tz}\` — use an IANA name like \`Europe/London\` or \`UTC\`.` };
    return { channelId, start, end, tz };
}

const findCommand = (client, name) =>
    client.commands.get(name) ?? client.commands.get(client.aliases.get(name));

// ctx-based core; scope is { channelId, start, end, tz } or { list: true }.
async function run(ctx, name, scope) {
    if (!name && !scope.list)
        return sendError(
            ctx,
            `Usage: \`${ctx.prefix}disable <command> [#channel] [HH:MM-HH:MM] [timezone]\` — or \`${ctx.prefix}disable list\`.`
        );

    const settings = await db.getGuildSettings(ctx.guild.id);

    if (scope.list || name === 'list') {
        const rules = settings.commandRules || [];
        const disabled = settings.disabledCommands || [];
        const lines = rules.map((r) => {
            const chName = r.channelId ? ctx.guild.channels.cache.get(r.channelId)?.name : null;
            return `\`${r.command}\` — ${describeRule(r, chName)}`;
        });
        return ctx.reply(
            cv2(
                success(
                    `${disabled.length ? `Globally disabled: ${disabled.map((c) => `\`${c}\``).join(', ')}\n` : ''}` +
                        `${lines.length ? lines.join('\n') : 'No scoped rules.'}`,
                    'Disabled commands'
                )
            )
        );
    }

    const command = findCommand(ctx.client, name);
    if (!command) return sendError(ctx, `Unknown command \`${name}\`.`);
    if (['disable', 'enable'].includes(command.name))
        return sendError(ctx, `The \`${command.name}\` command can't be disabled.`);

    // No scope = a global disable, same as the Commands page toggle.
    if (!scope.channelId && !scope.start) {
        if (settings.disabledCommands?.includes(command.name))
            return sendError(ctx, `\`${command.name}\` is already disabled globally.`);
        settings.disabledCommands = [...(settings.disabledCommands || []), command.name];
        await db.saveGuildSettings(ctx.guild.id, settings);
        return ctx.reply(cv2(success(`\`${command.name}\` is now disabled everywhere.`)));
    }

    const rules = settings.commandRules || [];
    const dupe = rules.some(
        (r) =>
            r.command === command.name &&
            (r.channelId || null) === scope.channelId &&
            (r.start || null) === scope.start &&
            (r.end || null) === scope.end &&
            (r.tz || 'UTC') === scope.tz
    );
    if (dupe) return sendError(ctx, 'That exact rule already exists.');

    rules.push({ command: command.name, channelId: scope.channelId, start: scope.start, end: scope.end, tz: scope.tz });
    settings.commandRules = rules;
    await db.saveGuildSettings(ctx.guild.id, settings);

    const chName = scope.channelId ? ctx.guild.channels.cache.get(scope.channelId)?.name : null;
    return ctx.reply(
        cv2(success(`\`${command.name}\` is now disabled in ${describeRule(rules[rules.length - 1], chName)}.`))
    );
}

module.exports = {
    name: 'disable',
    description: 'Disable a command globally, in a channel, or during a daily time window.',
    usage: '<command> [#channel] [HH:MM-HH:MM] [timezone] | list',
    aliases: ['disablecmd'],
    userPermissions: [PermissionFlagsBits.ManageGuild],
    cooldown: 3,
    slash: [
        { name: 'command', description: 'Command to disable — or "list"', type: Opt.String, required: true },
        { name: 'channel', description: 'Only disable in this channel', type: Opt.Channel, channel_types: [0, 5] },
        { name: 'window', description: 'Daily window like 22:00-07:00', type: Opt.String },
        { name: 'timezone', description: 'IANA timezone, e.g. Europe/London (default UTC)', type: Opt.String },
    ],
    execute: (message, args) => {
        const name = (args[0] || '').toLowerCase();
        if (name === 'list') return run(fromMessage(message), name, { list: true });
        const scope = parseScope(message, args.slice(1).join(' '));
        if (scope.err) return sendError(message, scope.err);
        return run(fromMessage(message), name, scope);
    },
    executeSlash: (interaction) => {
        const name = interaction.options.getString('command')?.toLowerCase();
        const channel = interaction.options.getChannel('channel');
        const window = interaction.options.getString('window');
        const tz = interaction.options.getString('timezone') || 'UTC';

        if (channel && !channel.isTextBased())
            return sendError(interaction, 'That is not a text channel.');
        let start = null, end = null;
        if (window) {
            const m = window.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
            start = m && `${m[1].padStart(2, '0')}:${m[2]}`;
            end = m && `${m[3].padStart(2, '0')}:${m[4]}`;
            if (!m || parseHM(start) == null || parseHM(end) == null)
                return sendError(interaction, `Invalid time window \`${window}\` — use 24-hour \`HH:MM-HH:MM\`.`);
        }
        if (!validTz(tz))
            return sendError(interaction, `Unknown timezone \`${tz}\` — use an IANA name like \`Europe/London\` or \`UTC\`.`);

        return run(fromInteraction(interaction), name, {
            list: name === 'list',
            channelId: channel?.id ?? null,
            start, end, tz,
        });
    },
};
