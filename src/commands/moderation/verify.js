const { PermissionFlagsBits, MessageFlags } = require('discord.js');
const { success, error, sendError, cv2 } = require('../../helpers/embeds');
const cap = require('../../utils/captcha');
const db = require('../../utils/database');

// CAPTCHA verification — configured on the dashboard (CAPTCHA page), the
// panel's Verify button routes here as `verify:start`; the three answer
// buttons arrive as `verify:ans:<nonce>:<idx>`. `.verify` reposts the panel.
const eph = (payload) => ({ ...payload, flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });

async function executeComponent(i) {
    const [, step, nonce, idx] = i.customId.split(':');
    const settings = await db.getGuildSettings(i.guildId);
    const c = settings.captcha;

    if (!c?.enabled)
        return i.reply(eph(cv2(error('CAPTCHA verification is disabled in this server.')))).catch(() => {});
    if (!c.roleId)
        return i.reply(eph(cv2(error('Verification isn\'t configured yet — no role is set on the dashboard.')))).catch(() => {});
    if (i.user.bot)
        return i.reply(eph(cv2(error('Bot accounts can\'t verify.')))).catch(() => {});

    if (step === 'start') {
        if (i.member.roles.cache.has(c.roleId))
            return i.reply(eph(cv2(success('You\'re already verified.', 'CAPTCHA')))).catch(() => {});
        const ch = await cap.generate(i.guildId, i.user.id);
        if (!ch)
            return i.reply(eph(cv2(error('Easy there — give it a few seconds and click Verify again.')))).catch(() => {});
        return i.reply(eph(cap.challengePayload(ch))).catch(() => {});
    }

    if (step === 'ans') {
        const res = cap.check(nonce, i.user.id, +idx);
        if (res === 'expired')
            return i.update({ ...cv2(error('That challenge expired — click Verify on the panel again.')), attachments: [] }).catch(() => {});
        if (res === 'fail') {
            // Wrong pick — hand them a fresh image instead of a dead end.
            const ch = await cap.generate(i.guildId, i.user.id, true);
            if (!ch)
                return i.update({ ...cv2(error('Not quite — click Verify on the panel to retry.')), attachments: [] }).catch(() => {});
            return i.update({ ...cap.challengePayload(ch, '**Nope — try again.**'), attachments: [] }).catch(() => {});
        }
        // pass — grant the verified role
        if (i.member.roles.cache.has(c.roleId))
            return i.update({ ...cv2(success('You\'re already verified.', 'CAPTCHA')), attachments: [] }).catch(() => {});
        const ok = await i.member.roles.add(c.roleId, 'Kotan CAPTCHA passed').then(() => true).catch(() => false);
        if (!ok)
            return i.update({ ...cv2(error('You passed, but I couldn\'t give you the role — check my role position/permissions.')) }).catch(() => {});
        cap.clog(i.guild, c, `✅ ${i.user} (${i.user.tag}) passed verification — role granted.`).catch(() => {});
        return i.update({ ...cv2(success('Verified — welcome to the server!', 'CAPTCHA')), attachments: [] }).catch(() => {});
    }
}

module.exports = {
    name: 'verify',
    description: 'Posts the CAPTCHA verification panel in this channel.',
    usage: '',
    aliases: ['captcha'],
    cooldown: 5,
    userPermissions: [PermissionFlagsBits.ManageGuild],
    execute: async (message) => {
        const c = (await db.getGuildSettings(message.guild.id)).captcha;
        if (!c?.enabled)
            return sendError(message, `CAPTCHA is disabled — configure it on the dashboard under **CAPTCHA**.`);
        await message.channel.send(await cap.panelPayload(message.guild, c)).catch(() => {});
        return message.reply(cv2(success('Verification panel posted.', 'CAPTCHA'))).catch(() => {});
    },
    executeComponent,
};
