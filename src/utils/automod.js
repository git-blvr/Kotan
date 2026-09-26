const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const logger = require('./logger');
const { logModAction } = require('./modlog');

// Automod — configured per guild (settings.automod). Runs on
// every message before command resolution. Members who can manage messages
// or the guild are exempt, as are bot owners.

const INVITE_RE = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;

function isExempt(message) {
    if (config.ownerIds.includes(message.author.id)) return true;
    const perms = message.member?.permissions;
    return (
        perms?.has(PermissionFlagsBits.ManageMessages) ||
        perms?.has(PermissionFlagsBits.ManageGuild) ||
        false
    );
}

async function deleteAndLog(message, client, title, extra) {
    await message.delete().catch(() => {});
    logModAction(client, message.guild.id, {
        action: title,
        target: `${message.author.tag} (${message.author.id})`,
        moderator: 'Kotan (automod)',
        extra,
    });
}

// Returns true when the message was actioned — caller must stop processing.
async function checkMessage(message, am, client) {
    if (!am || isExempt(message)) return false;
    const content = message.content;

    if (am.antiInvite && INVITE_RE.test(content)) {
        await deleteAndLog(message, client, 'Automod — invite removed', `In ${message.channel}`);
        return true;
    }

    if (am.blacklist?.length) {
        const lower = content.toLowerCase();
        const hit = am.blacklist.find((w) => w && lower.includes(w.toLowerCase()));
        if (hit) {
            await deleteAndLog(message, client, 'Automod — blacklisted word', `In ${message.channel}`);
            return true;
        }
    }

    if (am.spamMax > 0) {
        const now = Date.now();
        const windowMs = (am.spamWindow || 5) * 1000;
        const k = `${message.guild.id}:${message.author.id}`;
        const hits = (client.automodSpam.get(k) || []).filter((t) => now - t < windowMs);
        hits.push(now);
        client.automodSpam.set(k, hits);
        if (hits.length > am.spamMax) {
            await deleteAndLog(
                message,
                client,
                'Automod — spam filter',
                `${hits.length} messages in ${am.spamWindow}s · in ${message.channel}`
            );
            return true;
        }
    }

    return false;
}

// Raid detector, called from guildMemberAdd. Returns 'kick' | 'alert' | null.
function trackJoin(member, am, client) {
    if (!am?.raidMax) return null;
    const now = Date.now();
    const windowMs = (am.raidWindow || 10) * 1000;
    const joins = (client.raidJoins.get(member.guild.id) || []).filter((t) => now - t < windowMs);
    joins.push(now);
    client.raidJoins.set(member.guild.id, joins);
    if (joins.length <= am.raidMax) return null;

    logModAction(client, member.guild.id, {
        action: 'Automod — possible raid',
        target: `${member.user.tag} (${member.id})`,
        moderator: 'Kotan (automod)',
        extra: `${joins.length} joins in ${am.raidWindow}s window`,
    }).catch(() => {});
    return am.raidAction === 'kick' ? 'kick' : 'alert';
}

module.exports = { checkMessage, trackJoin };
