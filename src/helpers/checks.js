// Shared moderation sanity checks (role hierarchy etc).

// Verifies that `message.member` is allowed to moderate `target` and that the
// bot can too. Returns { ok, reason } — when ok is false, `reason` is a
// ready-to-show error message.
function canModerate(message, target) {
    const { guild, member: actor, author, client } = message;
    const me = guild.members.me;

    if (target.id === author.id) return { ok: false, reason: 'You cannot do that to yourself.' };
    if (target.id === client.user.id) return { ok: false, reason: 'I cannot do that to myself.' };
    if (target.id === guild.ownerId)
        return { ok: false, reason: 'You cannot moderate the server owner.' };
    if (author.id !== guild.ownerId && actor.roles.highest.position <= target.roles.highest.position)
        return { ok: false, reason: 'That member has a role equal to or higher than yours.' };
    if (target.roles.highest.position >= me.roles.highest.position)
        return { ok: false, reason: 'My role is not high enough to moderate that member.' };
    return { ok: true };
}

module.exports = { canModerate };
