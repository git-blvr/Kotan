const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { base, sendError, cv2 } = require('../helpers/embeds');
const { capitalize } = require('../helpers/format');
const { fromMessage, fromInteraction } = require('../helpers/ctx');

async function run(ctx, query) {
    {
        const client = ctx.client;

        // .help — overview grouped by category
        if (!query) {
            const byCategory = new Map();
            for (const cmd of client.commands.values()) {
                if (!byCategory.has(cmd.category)) byCategory.set(cmd.category, []);
                byCategory.get(cmd.category).push(`\`${cmd.name}\``);
            }

            const embed = base({
                title: 'Kotan — Help',
                description:
                    `Prefix: \`${ctx.prefix}\`\n` +
                    `Use \`${ctx.prefix}help <command>\` for details about a command.\n` +
                    'Some commands also answer to plain words (triggers) — no prefix needed.',
                fields: [...byCategory].map(([category, commands]) => ({
                    name: `${capitalize(category)} (${commands.length})`,
                    value: commands.join(', '),
                })),
            });
            return ctx.reply(cv2(embed));
        }

        // .help <command>
        const command =
            client.commands.get(query) ?? client.commands.get(client.aliases.get(query));
        if (command) {
            const fields = [
                {
                    name: 'Usage',
                    value: `\`${ctx.prefix}${command.name}${command.usage ? ` ${command.usage}` : ''}\``,
                    inline: true,
                },
                { name: 'Category', value: capitalize(command.category), inline: true },
                { name: 'Cooldown', value: `${command.cooldown}s`, inline: true },
            ];
            if (command.aliases.length)
                fields.push({
                    name: 'Aliases',
                    value: command.aliases.map((a) => `\`${a}\``).join(', '),
                    inline: true,
                });
            if (command.triggers.length)
                fields.push({
                    name: 'Triggers',
                    value: command.triggers.map((t) => `\`${t}\``).join(', '),
                    inline: true,
                });
            if (command.userPermissions?.length)
                fields.push({
                    name: 'Required permissions',
                    value: command.userPermissions.map((p) => `\`${p}\``).join(', '),
                });
            const embed = base({
                title: `Command: ${command.name}`,
                description: command.description || 'No description provided.',
                fields,
            });
            return ctx.reply(cv2(embed));
        }

        // .help <category>
        const inCategory = [...client.commands.values()].filter((c) => c.category === query);
        if (inCategory.length) {
            const embed = base({
                title: `${capitalize(query)} commands`,
                description: inCategory
                    .map((c) => `\`${c.name}\` — ${c.description || 'No description.'}`)
                    .join('\n'),
            });
            return ctx.reply(cv2(embed));
        }

        return sendError(ctx, `There is no command or category called \`${query}\`.`);
    }
}

module.exports = {
    name: 'help',
    description: 'Lists all commands, or shows details about one command or category.',
    usage: '[command | category]',
    aliases: ['h', 'commands', 'cmds'],
    triggers: ['commands'],
    cooldown: 5,
    slash: [
        { name: 'command', description: 'A command or category to inspect', type: Opt.String },
    ],
    execute: (message, args, client) =>
        run(fromMessage(message, { client }), args.join(' ').toLowerCase()),
    executeSlash: (interaction, client) =>
        run(fromInteraction(interaction, { client }), interaction.options.getString('command')?.toLowerCase()),
};
