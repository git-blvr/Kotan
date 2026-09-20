const db = require('./database');
const logger = require('./logger');

// Reaction roles — the dashboard maps emoji on a message to a role. Both
// messageReactionAdd and messageReactionRemove route through here.

// Stored emoji can be a unicode char ("🔥"), a custom id ("1234…"), or the
// full <:name:id> syntax — normalize to whatever reaction.emoji offers.
function emojiMatches(stored, reactionEmoji) {
    const id = String(stored).match(/\d{17,}/)?.[0];
    if (id) return id === reactionEmoji.id;
    return stored === reactionEmoji.name || stored === reactionEmoji.toString();
}

async function apply(reaction, user, add) {
    if (user.bot || !reaction.message.guild) return;

    if (reaction.partial) reaction = await reaction.fetch().catch(() => null);
    if (!reaction) return;
    if (reaction.message.partial)
        reaction.message = await reaction.message.fetch().catch(() => reaction.message);

    const settings = await db.getGuildSettings(reaction.message.guild.id).catch(() => null);
    const rules = settings?.roles?.reactionRoles;
    if (!rules?.length) return;

    const match = rules.find(
        (r) =>
            r.messageId === reaction.message.id &&
            r.channelId === reaction.message.channelId &&
            emojiMatches(r.emoji, reaction.emoji)
    );
    if (!match) return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    await member.roles[add ? 'add' : 'remove'](match.roleId, 'Kotan reaction role').catch((err) =>
        logger.warn(`reaction role ${add ? 'add' : 'remove'} failed: ${err.message}`)
    );
}

module.exports = { apply };
