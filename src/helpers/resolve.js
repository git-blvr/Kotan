// Resolvers that turn user input (mention, id, name) into Discord objects.

// Extracts a snowflake out of "<@123>", "<@!123>" or "123". Returns null when
// the input is not an id/mention at all.
function extractId(input) {
    if (!input) return null;
    const match = String(input).trim().match(/^<@!?(\d{17,20})>$|^(\d{17,20})$/);
    return match ? match[1] || match[2] : null;
}

// Resolves a guild member by mention, id or (partial) username/nickname.
async function resolveMember(message, input) {
    if (!input) return null;
    const id = extractId(input);
    if (id) {
        return message.guild.members.fetch(id).catch(() => null);
    }
    const query = String(input).toLowerCase();
    const results = await message.guild.members
        .search({ query: String(input), limit: 10 })
        .catch(() => null);
    if (!results?.size) return null;
    const nameOf = (m) => [m.user.username.toLowerCase(), m.displayName.toLowerCase(), m.user.tag.toLowerCase()];
    return (
        results.find((m) => nameOf(m).includes(query)) ||
        results.find((m) => nameOf(m).some((n) => n.startsWith(query))) ||
        results.first()
    );
}

// Resolves any Discord user by mention or id (works outside the guild too).
async function resolveUser(client, input) {
    const id = extractId(input);
    if (!id) return null;
    return client.users.fetch(id).catch(() => null);
}

// Resolves a guild role by mention (<@&id>), id or (partial) name.
function resolveRole(guild, input) {
    if (!input) return null;
    const str = String(input).trim();
    const mention = str.match(/^<@&(\d{17,20})>$/) || str.match(/^(\d{17,20})$/);
    if (mention) return guild.roles.cache.get(mention[1]) || null;
    const query = str.toLowerCase();
    return (
        guild.roles.cache.find((r) => r.name.toLowerCase() === query) ||
        guild.roles.cache.find((r) => r.name.toLowerCase().startsWith(query)) ||
        guild.roles.cache.find((r) => r.name.toLowerCase().includes(query)) ||
        null
    );
}

module.exports = { extractId, resolveMember, resolveUser, resolveRole };
