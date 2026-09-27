const { Collection } = require('discord.js');

// Dual-interface command context. Prefix and slash entry points each build a
// `ctx` from their own native event object, then hand it to the command's
// shared implementation. This is command-owned normalization — the
// interaction itself is never wrapped or faked; `executeSlash` still receives
// the real ChatInputCommandInteraction and reads typed options directly.
//
// Fields:
//   guild, channel      — real Guild / channel objects in both modes
//   user / author       — the invoking User (both keys for helpers like
//                         canModerate/sendError that read .author)
//   member              — invoking GuildMember (null in DMs)
//   client              — the bot client
//   settings            — per-guild settings (null outside guilds)
//   prefix              — display prefix for usage hints ('/' on slash)
//   reply(payload)      — first reply; Message in both modes
//   attachments         — Collection of attachments (slash: from options)

const fromMessage = (message, extra) => ({
    guild: message.guild,
    channel: message.channel,
    user: message.author,
    author: message.author,
    member: message.member,
    client: message.client,
    settings: message.guildSettings,
    prefix: message.prefix,
    attachments: message.attachments,
    mentions: message.mentions,
    reply: (payload) => message.reply(payload),
    ...extra,
});

const fromInteraction = (interaction, extra) => {
    // Attachment options land in message-style form so commands using
    // `ctx.attachments.find(a => a.contentType.startsWith('image/'))` work.
    const attachments = new Collection();
    // `options` only exists on application-command interactions — component
    // interactions (select menus, buttons) reaching ctx have none.
    for (const opt of interaction.options?.data ?? [])
        if (opt.attachment) attachments.set(opt.attachment.id, opt.attachment);

    return {
        guild: interaction.guild,
        channel: interaction.channel,
        user: interaction.user,
        author: interaction.user,
        member: interaction.member,
        client: interaction.client,
        settings: interaction.guildSettings,
        prefix: '/',
        attachments,
        // fetchReply gives back a real Message — .edit/.delete work like the
        // prefix path. After the first reply, follow up via editReply.
        reply: (payload) =>
            interaction.replied || interaction.deferred
                ? interaction.editReply(payload)
                : interaction.reply({ ...payload, fetchReply: true }),
        interaction, // commands needing the raw interaction can reach it
        ...extra,
    };
};

module.exports = { fromMessage, fromInteraction };
