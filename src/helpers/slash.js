const { PermissionsBitField } = require('discord.js');

// Builds the registration JSON for one command. Slash support is opt-in per
// command: it must export `slash` (a raw Discord API options array) and
// `executeSlash(interaction, client)`. Nothing is generated or translated —
// the schema you declare is the schema Discord gets.
//
// Option type reference (ApplicationCommandOptionType):
//   1 SubCommand · 2 SubCommandGroup · 3 String · 4 Integer · 5 Boolean
//   6 User · 7 Channel · 8 Role · 9 Mentionable · 10 Number · 11 Attachment
function toSlashJSON(command) {
    const body = {
        name: command.name,
        description: (command.description || 'Kotan command').slice(0, 100),
        options: command.slash ?? [],
    };
    body.dm_permission = command.guildOnly === false;
    if (command.userPermissions?.length)
        body.default_member_permissions = String(new PermissionsBitField(command.userPermissions).bitfield);
    return body;
}

// A command is slash-ready only when it declares both the schema and the
// native handler — anything else stays prefix/trigger only.
const isSlashReady = (command) => Array.isArray(command.slash) && typeof command.executeSlash === 'function';

module.exports = { toSlashJSON, isSlashReady };
