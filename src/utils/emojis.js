const fs = require('node:fs');
const path = require('node:path');

// App-emoji accessor — data/emojis.json is produced by `npm run emojis`
// (scripts/uploadEmojis.js). Any emoji that hasn't been uploaded yet falls
// back to a unicode emoji so messages never regress to blank text.
//
//   const E = require('../utils/emojis');
//   `**${E.check} Saved**`   →  "**<:kotan_check:…> Saved**" or "**✅ Saved**"

const FALLBACK = {
    check: '✅', cross: '❌', warn: '⚠️', info: 'ℹ️',
    music: '🎵', bank: '🏦', coin: '🪙', vc: '🔊', spark: '✨',
};

let map = {};
try {
    map = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'emojis.json'), 'utf8'));
} catch { /* not generated yet — fallbacks handle it */ }

module.exports = new Proxy(
    {},
    { get: (_, key) => map[key] ?? FALLBACK[key] ?? '' }
);
