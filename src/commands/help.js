const {
    ApplicationCommandOptionType: Opt,
    StringSelectMenuBuilder,
    ActionRowBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    TextDisplayBuilder,
} = require('discord.js');
const { base, sendError, cv2 } = require('../helpers/embeds');
const { capitalize } = require('../helpers/format');
const { fromMessage, fromInteraction } = require('../helpers/ctx');
const config = require('../config');

// ---- interactive browser -------------------------------------------------

// Placeholder values for required slash options, per option type.
const OPT_HINT = { 3: 'text', 4: '1', 5: 'true', 6: '@user', 7: '#channel', 8: '@role', 9: '@user', 10: '1', 11: 'image' };

function slashExample(command) {
    const required = (command.slash || []).filter((o) => o.required);
    const tail = required
        .map((o) => `${o.name}:${o.choices?.[0]?.value ?? OPT_HINT[o.type] ?? 'value'}`)
        .join(' ');
    return `/${command.name}${tail ? ` ${tail}` : ''}`;
}

// The card shown after a command is picked — "# name / Aliases / Example".
// Both invocation forms are always shown, regardless of how help was called.
function commandCard(ctx, command) {
    const prefix = ctx.settings?.prefix || config.prefix;
    return base({
        color: config.colors.main,
        description:
            `# ${command.name}\n` +
            `Aliases: ${command.aliases.length ? command.aliases.map((a) => `\`${a}\``).join(', ') : '—'}`,
    })
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `**Example:**\n` +
                    `\`${prefix}${command.name}${command.usage ? ` ${command.usage}` : ''}\`\n` +
                    `\`${slashExample(command)}\``
            )
        );
}

// Category pick — the top level of the browser.
function categoryMenu(ctx, client, uid) {
    const byCategory = new Map();
    for (const cmd of client.commands.values()) {
        if (!byCategory.has(cmd.category)) byCategory.set(cmd.category, []);
        byCategory.get(cmd.category).push(cmd.name);
    }
    const select = new StringSelectMenuBuilder()
        .setCustomId(`help:cat:${uid}`)
        .setPlaceholder('Pick a category…')
        .addOptions(
            [...byCategory].map(([cat, cmds]) => ({
                label: capitalize(cat),
                value: cat,
                description: `${cmds.length} command${cmds.length === 1 ? '' : 's'}`,
            }))
        );
    return base({
        title: 'Kotan — Help',
        description:
            `Prefix: \`${ctx.prefix}\` — every command also works as a slash command.\n` +
            'Browse by category below, or use `help <command>` for a direct lookup.',
    }).addActionRowComponents(new ActionRowBuilder().addComponents(select));
}

// Command pick — shown once a category is chosen.
function commandMenu(ctx, client, uid, category) {
    const commands = [...client.commands.values()].filter((c) => c.category === category);
    const select = new StringSelectMenuBuilder()
        .setCustomId(`help:cmd:${uid}:${category}`)
        .setPlaceholder('Pick a command…')
        .addOptions(
            commands.slice(0, 25).map((c) => ({
                label: c.name,
                value: c.name,
                description: (c.description || 'No description.').slice(0, 100),
            }))
        );
    return base({ title: `${capitalize(category)} — pick a command` })
        .addActionRowComponents(new ActionRowBuilder().addComponents(select));
}

async function run(ctx, client, query) {
    // `help` — the interactive browser
    if (!query) return ctx.reply(cv2(categoryMenu(ctx, client, ctx.user.id)));

    // `help <command>`
    const command =
        client.commands.get(query) ?? client.commands.get(client.aliases.get(query));
    if (command) return ctx.reply(cv2(commandCard(ctx, command)));

    // `help <category>`
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
        run(fromMessage(message, { client }), client, args.join(' ').toLowerCase()),
    executeSlash: (interaction, client) =>
        run(fromInteraction(interaction, { client }), client, interaction.options.getString('command')?.toLowerCase()),

    // Select-menu flow: help:cat:<uid> -> command menu, help:cmd:<uid>:<cat> -> card.
    async executeComponent(interaction, client) {
        const [, step, uid, category] = interaction.customId.split(':');
        if (interaction.user.id !== uid)
            return interaction.reply({ ephemeral: true, content: 'This menu isn\'t yours — run `/help` yourself.' });

        const ctx = fromInteraction(interaction, { client });
        if (step === 'cat') {
            const cat = interaction.values[0];
            return interaction.update({ components: [commandMenu(ctx, client, uid, cat)] });
        }
        if (step === 'cmd') {
            const command = client.commands.get(interaction.values[0]);
            if (!command) return interaction.reply({ ephemeral: true, content: 'That command no longer exists.' });
            return interaction.update({ components: [commandCard(ctx, command)] });
        }
    },
};
