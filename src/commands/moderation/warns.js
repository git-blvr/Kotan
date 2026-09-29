const {
    PermissionFlagsBits, ApplicationCommandOptionType: Opt, MessageFlags,
    ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, StringSelectMenuBuilder,
} = require('discord.js');
const { base, error, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { timestamp } = require('../../helpers/format');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const { logModAction } = require('../../utils/modlog');
const db = require('../../utils/database');

const eph = (payload) => ({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
const text = (t) => new TextDisplayBuilder().setContent(t);

// CV2 warns view — lists every warn, plus a removal dropdown when the viewer
// can moderate. customId: warns:del:<ownerId>:<targetId>; owner-locked.
function warnsView(ownerId, target, warns, canRemove) {
    const c = new ContainerBuilder();
    c.addTextDisplayComponents(text(`## Warns for ${target.user.tag} (${warns.length})`));

    // Warn lines grouped two per text block so many warns stay under the
    // 10-component container cap (header + ≤4 blocks + menu ≤ 10).
    const lines = warns.slice(-25).map((w) => `\`${w.id}\` — ${timestamp(w.at)}\n${w.reason}`);
    for (let i = 0; i < lines.length; i += 5) {
        c.addTextDisplayComponents(text(lines.slice(i, i + 5).join('\n')));
        if (c.toJSON().components.length >= 9) break; // leave room for the menu
    }

    if (canRemove) {
        c.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`warns:del:${ownerId}:${target.id}`)
                    .setPlaceholder('Select a warn to remove it')
                    .addOptions(
                        warns.slice(-25).map((w) => ({
                            label: w.id,
                            description: String(w.reason || '').slice(0, 90) || '(no reason)',
                            value: w.id,
                        }))
                    )
            )
        );
    }
    return c;
}

async function run(ctx, target) {
    if (!target) return sendErr(ctx, 'Member not found.');

    // Anyone can see their own warns; checking others needs perms.
    const checkingOther = target.id !== ctx.user.id;
    const canMod = ctx.member?.permissions.has(PermissionFlagsBits.ModerateMembers);
    if (checkingOther && !canMod)
        return sendErr(ctx, 'You need the `ModerateMembers` permission to view other people\'s warns.');

    const warns = await db.getWarns(ctx.guild.id, target.id);
    if (!warns.length)
        return ctx.reply(cv2(base({ title: 'Warns', description: `**${target.user.tag}** has no warnings.` })));

    return ctx.reply(cv2(warnsView(ctx.user.id, target, warns, canMod)));
}

const sendErr = (ctx, msg) => ctx.reply(cv2(error(msg)));

// Component router — warns:del:<owner>:<target>; selecting a warn removes it.
async function executeComponent(i, client) {
    const [, step, ownerId, targetId] = i.customId.split(':');
    if (step !== 'del') return;
    if (i.user.id !== ownerId)
        return i.reply(eph(cv2(error('That menu belongs to someone else — run /warns yourself.')))).catch(() => {});
    if (!i.member.permissions.has(PermissionFlagsBits.ModerateMembers))
        return i.reply(eph(cv2(error('You need the `ModerateMembers` permission to remove warns.')))).catch(() => {});

    const warnId = i.values?.[0];
    const removed = await db.deleteWarn(i.guildId, targetId, warnId);
    if (!removed)
        return i.reply(eph(cv2(error(`Warn \`${warnId}\` is already gone.`)))).catch(() => {});

    const targetUser = await client.users.fetch(targetId).catch(() => null);
    logModAction(client, i.guildId, {
        action: 'Delete warn',
        target: `${targetUser?.tag || targetId} (${targetId})`,
        moderator: i.user.tag,
        extra: `Warn \`${removed.id}\` — "${removed.reason}"`,
    });

    const warns = await db.getWarns(i.guildId, targetId);
    if (!warns.length)
        return i
            .update(cv2(base({ title: 'Warns', description: `**${targetUser?.tag || targetId}** has no warnings — all clear.` })))
            .catch(() => {});
    return i.update(cv2(warnsView(ownerId, { id: targetId, user: targetUser || { tag: targetId } }, warns, true))).catch(() => {});
}

module.exports = {
    name: 'warns',
    description: 'Lists the warnings of a member (or your own). Moderators get a removal dropdown.',
    usage: '[@member]',
    aliases: ['warnings', 'warnlist'],
    cooldown: 3,
    slash: [
        { name: 'member', description: 'Whose warns to list (default: you)', type: Opt.User },
    ],
    execute: async (message, args) =>
        run(fromMessage(message), args[0] ? await resolveMember(message, args[0]) : message.member),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getMember('member') ?? interaction.member
        ),
    executeComponent,
};
