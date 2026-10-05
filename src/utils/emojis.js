const fs = require('node:fs');
const path = require('node:path');

// App-emoji accessor — emojis.json is produced by `npm run emojis`
// (scripts/uploadEmojis.js) and committed, so every deployment uses the
// custom Kotan emoji set. Unknown names resolve to "" — callers that inline
// them should .trim() the result so a missing emoji never leaves stray space.
//
//   const E = require('../utils/emojis');
//   `**${E.check} Saved**`   →  "**<:kotan_check:…> Saved**"

let map = {};
try {
    map = JSON.parse(fs.readFileSync(path.join(__dirname, 'emojis.json'), 'utf8'));
} catch { /* map not generated yet */ }

module.exports = new Proxy(
    {},
    { get: (_, key) => map[key] ?? '' }
);
