const {
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { sendError } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const vm = require('../../utils/voicemaster');
const db = require('../../utils/database');

// VoiceMaster command — the chat side of the feature. `.vc <action>` in a
// voice channel's built-in chat (or anywhere) controls your channel; the
// dashboard-posted panel's buttons/selects/modal arrive here as
// `voicemaster:*` interactions. Both paths funnel into utils/voicemaster's
// shared `run()` so behavior can't drift between UIs.

const ACTIONS = 'lock, unlock, hide, show, rename <name>, limit <n>, bitrate <kbps>, invite, kick @user, trust @user, untrust @user, block @user, unblock @user, transfer @user, claim, info';
const USER_ACTIONS = ['kick', 'trust', 'untrust', 'block', 'unblock', 'transfer'];
const PICK_ACTIONS = ['trust', 'untrust', 'block', 'unblock', 'kick', 'transfer'];

const HELP = [
    '**VoiceMaster — your channel, your rules**',
    'Join the trigger channel to get your own voice channel, then control it here or from the panel.',
    '```',
    'vc lock | unlock          — toggle who can join',
    'vc hide | show            — toggle visibility in the channel list',
    'vc rename <name>          — rename your channel',
    'vc limit <n>              — set a user cap (0 = unlimited)',
    'vc bitrate <kbps>         — set audio quality (default = server default)',
    'vc invite                 — get a shareable invite link',
    'vc kick @user             — disconnect someone from your channel',
    'vc trust @user            — always lets them join, even locked',
    'vc untrust @user          — remove trust',
    'vc block @user            — hide + deny join, kicks them if inside',
    'vc unblock @user          — remove a block',
    'vc transfer @user         — hand ownership to someone in the channel',
    'vc claim                  — take over if the owner left',
    'vc info                   — show channel status',
    '```',
].join('\n');

async function execute(message, args) {
    const act = (args[0] || '').toLowerCase();

    if (!act || act === 'help')
        return message.reply({ content: HELP, allowedMentions: { parse: [] } }).catch(() => {});

    if (act === 'panel') {
        if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
            return sendError(message, 'You need the **Manage Server** permission to post the panel.');
        const s = message.guildSettings || (await db.getGuildSettings(message.guild.id));
        const cfg = s.voicemaster;
        if (!cfg?.enabled || !cfg.triggerId)
            return sendError(message, 'VoiceMaster isn\'t configured — enable it and pick a trigger channel on the dashboard.');
        await message.channel.send(await vm.panelPayload(message.guild, cfg)).catch(() => {});
        return;
    }

    if (USER_ACTIONS.includes(act)) {
        const target = await resolveMember(message, args[1]);
        if (!target) return sendError(message, `Mention the member — e.g. \`vc ${act} @user\`.`);
        const r = await vm.run(message.guild, message.member, act, target.id);
        return message.reply({ content: `${r.ok ? '✅' : '⚠️'} ${r.msg}`, allowedMentions: { parse: [] } }).catch(() => {});
    }

    const r = await vm.run(message.guild, message.member, act, args.slice(1).join(' '));
    return message.reply({ content: `${r.ok ? '✅' : '⚠️'} ${r.msg}`, allowedMentions: { parse: [] } }).catch(() => {});
}

// "voicemaster:<action>" buttons/selects and "voicemaster:pick:<action>"
// member pickers. Replies are ephemeral so the panel stays clean.
async function executeComponent(i) {
    const [, act, sub] = i.customId.split(':');
    const member = i.member;
    if (!member) return;
    const eph = (msg, extra = {}) => ({ content: msg, ephemeral: true, ...extra });
    const done = (r) => `${r.ok ? '✅' : '⚠️'} ${r.msg}`;

    if (act === 'pick') {
        const target = i.values?.[0];
        if (!target) return;
        const r = await vm.run(i.guild, member, sub, target);
        return i.update({ content: done(r), components: [] }).catch(() => {});
    }

    if (act === 'bitrate') {
        const r = await vm.run(i.guild, member, 'bitrate', i.values?.[0]);
        return i.reply(eph(done(r))).catch(() => {});
    }

    if (act === 'rename') {
        const modal = new ModalBuilder().setCustomId('voicemaster:rename').setTitle('Rename your channel').addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('name')
                    .setLabel('New channel name')
                    .setStyle(TextInputStyle.Short)
                    .setMaxLength(100)
                    .setRequired(true)
            )
        );
        return i.showModal(modal).catch(() => {});
    }

    // trust/untrust/block/unblock take any user — user picker. kick and
    // transfer only make sense for members inside the channel, so they get
    // a string select built from the live member list.
    if (PICK_ACTIONS.includes(act)) {
        if (act === 'kick' || act === 'transfer') {
            const { ch } = await vm.ownedChannel(i.guild, member);
            if (!ch) return i.reply(eph("⚠️ You don't have a channel — join the trigger channel to make one.")).catch(() => {});
            const opts = ch.members
                .filter((m) => !m.user.bot && m.id !== member.id)
                .map((m) => ({ label: m.displayName.slice(0, 100), value: m.id }));
            if (!opts.length) return i.reply(eph('⚠️ Nobody else is in your channel.')).catch(() => {});
            const row = new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`voicemaster:pick:${act}`)
                    .setPlaceholder(`Pick a member to ${act}…`)
                    .addOptions(opts.slice(0, 25))
            );
            return i.reply(eph(`Pick a member to **${act}**:`, { components: [row] })).catch(() => {});
        }
        const row = new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`voicemaster:pick:${act}`)
                .setPlaceholder(`Pick a user to ${act}…`)
        );
        return i.reply(eph(`Pick a user to **${act}**:`, { components: [row] })).catch(() => {});
    }

    const r = await vm.run(i.guild, member, act);
    return i.reply(eph(done(r))).catch(() => {});
}

// The Rename button's modal lands here.
async function executeModal(i) {
    if (i.customId !== 'voicemaster:rename') return;
    const r = await vm.run(i.guild, i.member, 'rename', i.fields.getTextInputValue('name'));
    return i.reply({ content: `${r.ok ? '✅' : '⚠️'} ${r.msg}`, ephemeral: true }).catch(() => {});
}

module.exports = {
    name: 'voicemaster',
    description: 'VoiceMaster — control your personal voice channel (`.vc help` lists every action).',
    usage: '<action> [value]',
    aliases: ['vc', 'vm'],
    cooldown: 2,
    guildOnly: true,
    execute,
    executeComponent,
    executeModal,
};
