const {
    ApplicationCommandOptionType: Opt,
    PermissionFlagsBits,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
} = require('discord.js');
const { success, error, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const tk = require('../../utils/tickets');
const db = require('../../utils/database');
const config = require('../../config');

const eph = (payload) => ({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
const ACTIONS = ['panel', 'close', 'add', 'remove', 'rename'];

// Inside a ticket channel? returns the record or null.
async function ticketHere(guildId, channelId) {
    const data = await db.getTickets(guildId);
    return data.channels[channelId] ? { data, rec: data.channels[channelId] } : null;
}

async function run(ctx, action, targetUser, text) {
    const settings = ctx.settings;
    const t = settings.tickets;
    action = (action || '').toLowerCase();

    if (!t?.enabled) return sendError(ctx, 'Tickets are disabled — enable them on the dashboard.');
    if (!ACTIONS.includes(action))
        return sendError(ctx, `Usage: \`${ctx.prefix}ticket <${ACTIONS.join('|')}>\``);

    if (action === 'panel') {
        // Posting a panel is a staff action, not something members can spam.
        if (!ctx.member.permissions.has(PermissionFlagsBits.ManageGuild))
            return sendError(ctx, 'You need **Manage Server** to post a ticket panel.');
        await ctx.channel.send(tk.panelPayload(ctx.guild, t)).catch(() => {});
        return ctx.reply(cv2(success('Ticket panel posted.', 'Tickets'))).catch(() => {});
    }

    const inside = await ticketHere(ctx.guild.id, ctx.channel.id);
    if (action === 'close') {
        if (!inside) return sendError(ctx, 'This isn\'t a ticket channel.');
        // Members may close their own ticket; others need support perms.
        if (inside.rec.user !== ctx.user.id && !tk.isSupport(ctx.member, t))
            return sendError(ctx, 'Only the ticket owner or support staff can close this.');
        return tk.closeTicket(ctx.channel, ctx.guild, ctx.user, settings);
    }

    if (!tk.isSupport(ctx.member, t))
        return sendError(ctx, 'You need a support role (or Manage Server) for that.');
    if (!inside) return sendError(ctx, 'Run that inside a ticket channel.');

    if (action === 'rename') {
        if (!text) return sendError(ctx, `Usage: \`${ctx.prefix}ticket rename <name>\``);
        await ctx.channel.setName(text.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').slice(0, 90)).catch(() => {});
        return ctx.reply(cv2(success(`Renamed to \`${ctx.channel.name}\`.`, 'Tickets')));
    }

    // add / remove
    if (!targetUser) return sendError(ctx, `Usage: \`${ctx.prefix}ticket ${action} <user>\``);
    const target = await resolveMember(ctx, targetUser).catch(() => null);
    if (!target) return sendError(ctx, `Couldn't find "${targetUser}".`);
    await ctx.channel.permissionOverwrites
        .edit(target.id, action === 'add'
            ? { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }
            : { ViewChannel: false })
        .catch(() => {});
    return ctx.reply(cv2(success(`${target} ${action === 'add' ? 'added to' : 'removed from'} the ticket.`, 'Tickets')));
}

async function executeComponent(i, client) {
    const [, step] = i.customId.split(':');
    const settings = await db.getGuildSettings(i.guildId);
    const t = settings.tickets;

    if (step === 'open') {
        if (!t?.enabled)
            return i.reply(eph(cv2(error('Tickets are disabled in this server.')))).catch(() => {});
        const topicIdx = i.isStringSelectMenu() ? +i.values[0] : -1;
        try {
            const res = await tk.openTicket(i.guild, i.member, topicIdx, settings, client);
            if (res.err) return i.reply(eph(cv2(error(res.err)))).catch(() => {});
            return i.reply(eph(cv2(success(`Your ticket is ready: ${res.channel}`, 'Tickets')))).catch(() => {});
        } catch (e) {
            return i
                .reply(eph(cv2(error(`Couldn't create the ticket — check my permissions and the configured category.`))))
                .catch(() => {});
        }
    }

    if (step === 'claim') {
        if (!tk.isSupport(i.member, t))
            return i.reply(eph(cv2(error('Only support staff can claim tickets.')))).catch(() => {});
        const data = await db.getTickets(i.guildId);
        if (data.channels[i.channel.id]) {
            data.channels[i.channel.id].claimedBy = i.user.id;
            await db.saveTickets(i.guildId, data);
        }
        return i.update(cv2(
            new ContainerBuilder()
                .setAccentColor(config.colors.main)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`## Ticket claimed\n${i.user} is handling this ticket.`)
                )
        )).catch(() => {});
    }

    if (step === 'close') {
        const data = await db.getTickets(i.guildId);
        const rec = data.channels[i.channel.id];
        if (rec && rec.user !== i.user.id && !tk.isSupport(i.member, t))
            return i.reply(eph(cv2(error('Only the ticket owner or support staff can close this.')))).catch(() => {});
        await i.deferUpdate().catch(() => {});
        return tk.closeTicket(i.channel, i.guild, i.user, settings);
    }
}

module.exports = {
    name: 'ticket',
    description: 'Ticket system — post a panel, or manage the current ticket channel.',
    usage: '<panel|close|add|remove|rename> [user|text]',
    aliases: ['tickets', 'newticket'],
    triggers: ['ticket'],
    cooldown: 3,
    slash: [
        {
            name: 'action',
            description: 'What to do',
            type: Opt.String,
            required: true,
            choices: ACTIONS.map((v) => ({ name: v, value: v })),
        },
        { name: 'user', description: 'Member to add/remove', type: Opt.User },
        { name: 'text', description: 'Close reason / new channel name', type: Opt.String },
    ],
    execute: (message, args) =>
        run(fromMessage(message), args[0], args[1], args.slice(1).join(' ') || null),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getString('action'),
            interaction.options.getUser('user')?.id,
            interaction.options.getString('text')
        ),
    executeComponent,
};
