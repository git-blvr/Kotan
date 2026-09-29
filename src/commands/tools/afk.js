const { ApplicationCommandOptionType: Opt } = require('discord.js');
const { info, error, base, cv2 } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
const config = require('../../config');
const afk = require('../../utils/afk');
const db = require('../../utils/database');

// .afk [message]  — set your away status (speaking clears it)
// .afk pings      — who mentioned you while you were away

const canUse = (ctx, cfg) =>
    !cfg.roles?.length ||
    ctx.member?.permissions.has('ManageGuild') ||
    ctx.member?.roles.cache.some((r) => cfg.roles.includes(r.id));

async function showPings(ctx) {
    const rec = await db.getAfk(ctx.guild.id, ctx.user.id);
    const pings = rec?.pings || [];
    if (!pings.length)
        return ctx.reply(cv2(info(
            rec ? 'No one has mentioned you since you went AFK.' : "You're not AFK — nothing to show.",
            'AFK pings'
        )));
    const lines = pings.slice(-20).map((p) => `<@${p.userId}> in <#${p.channelId}> — ${afk.ago(Date.now() - p.at)} ago`);
    await db.clearAfkPings(ctx.guild.id, ctx.user.id); // viewing marks them read
    return ctx.reply(cv2(base({
        color: config.colors.main,
        title: `AFK pings (${pings.length})`,
        description: lines.join('\n'),
    })));
}

async function run(ctx, args, pingsFlag) {
    const cfg = ctx.settings?.afk;
    if (!ctx.guild || !cfg || cfg.enabled === false)
        return ctx.reply(cv2(error('AFK is disabled in this server.')));
    if (!canUse(ctx, cfg))
        return ctx.reply(cv2(error('You need an allowed role to use `.afk` here.')));

    if (pingsFlag || ['pings', 'mentions'].includes(String(args[0] || '').toLowerCase()))
        return showPings(ctx);

    const rec = await db.getAfk(ctx.guild.id, ctx.user.id);
    const text = args.join(' ').trim().slice(0, 200);

    // Bare .afk while AFK — show status instead of resetting.
    if (rec && !text)
        return ctx.reply(cv2(info(
            `You're AFK: **${rec.message}** — ${afk.ago(Date.now() - rec.at)} ago.\n` +
            `${rec.pings?.length ? `**${rec.pings.length}** mention${rec.pings.length === 1 ? '' : 's'} waiting — \`${ctx.prefix}afk pings\`.\n` : ''}` +
            `Send any message to clear it.`,
            'AFK'
        )));

    const message = text || cfg.defaultMessage || 'AFK';
    await db.setAfk(ctx.guild.id, ctx.user.id, { message });
    return ctx.reply(cv2(base({
        color: config.colors.success,
        title: 'AFK',
        description: `You're now AFK — **${message}**\nMentions will point here, and speaking clears it.`,
    })));
}

module.exports = {
    name: 'afk',
    description: 'Set your AFK status, or check who pinged you while away.',
    usage: '[message | pings]',
    aliases: ['away', 'brb'],
    triggers: ['afk'],
    cooldown: 4,
    guildOnly: true,
    slash: [
        { name: 'message', description: 'Your AFK message — empty uses the server default', type: Opt.String, required: false },
        { name: 'pings', description: 'Show who mentioned you while AFK', type: Opt.Boolean, required: false },
    ],
    execute: (message, args) => run(fromMessage(message), args),
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            [interaction.options.getString('message') || ''].filter(Boolean),
            interaction.options.getBoolean('pings') === true
        ),
};
