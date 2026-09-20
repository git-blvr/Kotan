const { base, sendError } = require('../helpers/embeds');
const { capitalize } = require('../helpers/format');
const config = require('../config');

module.exports = {
    name: 'help',
    description: 'Lists all commands, or shows details about one command or category.',
    usage: '[command | category]',
    aliases: ['h', 'commands', 'cmds'],
    triggers: ['commands'],
    cooldown: 5,
    async execute(message, args, client) {
        const query = args.join(' ').toLowerCase();

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
                    `Prefix: \`${config.prefix}\`\n` +
                    `Use \`${config.prefix}help <command>\` for details about a command.\n` +
                    'Some commands also answer to plain words (triggers) — no prefix needed.',
            });
            for (const [category, commands] of byCategory) {
                embed.addFields({
                    name: `${capitalize(category)} (${commands.length})`,
                    value: commands.join(', '),
                });
            }
            return message.reply({ embeds: [embed] });
        }

        // .help <command>
        const command =
            client.commands.get(query) ?? client.commands.get(client.aliases.get(query));
        if (command) {
            const embed = base({
                title: `Command: ${command.name}`,
                description: command.description || 'No description provided.',
                fields: [
                    {
                        name: 'Usage',
                        value: `\`${config.prefix}${command.name}${command.usage ? ` ${command.usage}` : ''}\``,
                        inline: true,
                    },
                    { name: 'Category', value: capitalize(command.category), inline: true },
                    { name: 'Cooldown', value: `${command.cooldown}s`, inline: true },
                ],
            });
            if (command.aliases.length)
                embed.addFields({
                    name: 'Aliases',
                    value: command.aliases.map((a) => `\`${a}\``).join(', '),
                    inline: true,
                });
            if (command.triggers.length)
                embed.addFields({
                    name: 'Triggers',
                    value: command.triggers.map((t) => `\`${t}\``).join(', '),
                    inline: true,
                });
            if (command.userPermissions?.length)
                embed.addFields({
                    name: 'Required permissions',
                    value: command.userPermissions.map((p) => `\`${p}\``).join(', '),
                });
            return message.reply({ embeds: [embed] });
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
            return message.reply({ embeds: [embed] });
        }

        return sendError(message, `There is no command or category called \`${query}\`.`);
    },
};
