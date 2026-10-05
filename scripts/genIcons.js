// Writes Kotan's SVG emoji set into assets/emojis/*.svg.
// These are the canonical icon designs — scripts/uploadEmojis.js rasterizes
// them (resvg) and pushes them to the bot's application emojis. Edit an SVG
// here, re-run `npm run emojis`, done.

const fs = require('node:fs');
const path = require('node:path');

const S = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${body}</svg>\n`;

const icons = {
    // ---- core UI set: flat circle + glyph ----
    check: S(`<circle cx="64" cy="64" r="58" fill="#23a55a"/><path d="M40 66l17 17 33-37" fill="none" stroke="#fff" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`),
    cross: S(`<circle cx="64" cy="64" r="58" fill="#f23f43"/><path d="M45 45l38 38M83 45L45 83" stroke="#fff" stroke-width="13" stroke-linecap="round" fill="none"/>`),
    warn: S(`<path d="M64 16l54 94H10z" fill="#f0b232" stroke="#f0b232" stroke-width="14" stroke-linejoin="round"/><rect x="58" y="46" width="12" height="30" rx="6" fill="#1e1f22"/><circle cx="64" cy="91" r="7" fill="#1e1f22"/>`),
    info: S(`<circle cx="64" cy="64" r="58" fill="#5865f2"/><circle cx="64" cy="38" r="9" fill="#fff"/><rect x="56" y="54" width="16" height="44" rx="8" fill="#fff"/>`),
    bank: S(`<circle cx="64" cy="64" r="58" fill="#f1c40f"/><g fill="#1e1f22"><path d="M64 28l34 22H30z"/><rect x="30" y="54" width="68" height="6" rx="2"/><rect x="36" y="64" width="10" height="24" rx="1"/><rect x="51" y="64" width="10" height="24" rx="1"/><rect x="67" y="64" width="10" height="24" rx="1"/><rect x="82" y="64" width="10" height="24" rx="1"/><rect x="30" y="92" width="68" height="6" rx="2"/><rect x="26" y="100" width="76" height="5" rx="2"/></g>`),
    coin: S(`<circle cx="64" cy="64" r="58" fill="#f1c40f"/><circle cx="64" cy="64" r="44" fill="none" stroke="#b8860b" stroke-width="7"/>`),
    vc: S(`<circle cx="64" cy="64" r="58" fill="#5865f2"/><path d="M28 50h18l24-20v68L46 78H28z" fill="#fff"/><path d="M78 48a22 22 0 010 32" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M90 36a40 40 0 010 56" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/>`),
    spark: S(`<path d="M64 12q8 40 48 52-40 12-48 52-8-40-48-52 40-12 48-52z" fill="#57f287"/>`),
    heart: S(`<path d="M64 106C30 80 18 56 20 40c2-18 26-26 44-6 18-20 42-12 44 6 2 16-10 40-44 66z" fill="#f23f43"/>`),

    // ---- status / actions ----
    lock: S(`<path d="M44 58V42a20 20 0 0140 0v16" fill="none" stroke="#1e1f22" stroke-width="11"/><rect x="28" y="56" width="72" height="54" rx="13" fill="#f0b232"/><circle cx="64" cy="78" r="8" fill="#1e1f22"/><rect x="60" y="82" width="8" height="15" rx="3" fill="#1e1f22"/>`),
    unlock: S(`<path d="M44 58V42a20 20 0 0140 0v6" fill="none" stroke="#1e1f22" stroke-width="11" stroke-linecap="round"/><rect x="28" y="56" width="72" height="54" rx="13" fill="#f0b232"/><circle cx="64" cy="78" r="8" fill="#1e1f22"/><rect x="60" y="82" width="8" height="15" rx="3" fill="#1e1f22"/>`),
    hide: S(`<path d="M18 64s17-27 46-27 46 27 46 27-17 27-46 27-46-27-46-27z" fill="none" stroke="#b9bbbe" stroke-width="8"/><circle cx="64" cy="64" r="12" fill="#b9bbbe"/><path d="M28 102L100 26" stroke="#f23f43" stroke-width="10" stroke-linecap="round"/>`),
    rocket: S(`<path d="M46 58L26 90l20-8z" fill="#e0483f"/><path d="M82 58l20 32-20-8z" fill="#e0483f"/><path d="M52 76c-4 16 0 26 12 38 12-12 16-22 12-38z" fill="#f0b232"/><path d="M58 78c-2 12 0 18 6 26 6-8 8-14 6-26z" fill="#ff8a00"/><path d="M64 10c14 14 20 32 20 54v18H44V64c0-22 6-40 20-54z" fill="#e8e9eb"/><circle cx="64" cy="46" r="10" fill="#55c5e0" stroke="#9aa0a6" stroke-width="3"/>`),
    inbox: S(`<path d="M64 14v36" stroke="#57f287" stroke-width="11" stroke-linecap="round"/><path d="M44 36l20 20 20-20" fill="none" stroke="#57f287" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 72h28l8 15h24l8-15h28v34H16z" fill="#b9bbbe"/>`),
    outbox: S(`<path d="M64 58V22" stroke="#f0b232" stroke-width="11" stroke-linecap="round"/><path d="M44 38l20-20 20 20" fill="none" stroke="#f0b232" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 72h28l8 15h24l8-15h28v34H16z" fill="#b9bbbe"/>`),

    // ---- games / objects ----
    eightball: S(`<circle cx="64" cy="64" r="56" fill="#1e1f22"/><circle cx="64" cy="70" r="25" fill="#fff"/><circle cx="64" cy="63" r="6" fill="#1e1f22"/><circle cx="64" cy="78" r="8" fill="#1e1f22"/>`),
    target: S(`<circle cx="64" cy="64" r="56" fill="#f23f43"/><circle cx="64" cy="64" r="40" fill="#fff"/><circle cx="64" cy="64" r="26" fill="#f23f43"/><circle cx="64" cy="64" r="12" fill="#fff"/>`),
    spade: S(`<path d="M64 16C42 44 26 58 26 76c0 14 10 22 22 22 6 0 12-3 14-8l-4 22h12l-4-22c2 5 8 8 14 8 12 0 22-8 22-22 0-18-16-32-38-60z" fill="#1e1f22"/>`),
    diamond: S(`<path d="M64 14l36 50-36 50-36-50z" fill="#f23f43"/>`),
    club: S(`<circle cx="44" cy="74" r="20" fill="#1e1f22"/><circle cx="84" cy="74" r="20" fill="#1e1f22"/><circle cx="64" cy="44" r="20" fill="#1e1f22"/><path d="M64 78l-10 30h20z" fill="#1e1f22"/>`),
    dice: S(`<rect x="18" y="18" width="92" height="92" rx="20" fill="#fff"/><g fill="#1e1f22"><circle cx="42" cy="42" r="10"/><circle cx="86" cy="42" r="10"/><circle cx="64" cy="64" r="10"/><circle cx="42" cy="86" r="10"/><circle cx="86" cy="86" r="10"/></g>`),
    rock: S(`<path d="M24 84C18 58 34 34 64 30c30-4 46 20 42 46-3 22-22 32-44 30-22-2-34-6-38-22z" fill="#808e96"/><path d="M40 58c8-10 20-16 34-16M86 90c8-6 12-14 11-24" stroke="#5d6a72" stroke-width="7" fill="none" stroke-linecap="round"/>`),
    paper: S(`<path d="M32 14h44l20 20v80H32z" fill="#fff"/><path d="M76 14v20h20" fill="#dfe1e5"/><g stroke="#9aa0a6" stroke-width="5" stroke-linecap="round"><path d="M42 56h44M42 72h44M42 88h28"/></g>`),
    scissors: S(`<circle cx="40" cy="88" r="14" fill="none" stroke="#f23f43" stroke-width="8"/><circle cx="88" cy="88" r="14" fill="none" stroke="#f23f43" stroke-width="8"/><path d="M50 76L86 28M78 76L42 28" stroke="#b9bbbe" stroke-width="8" stroke-linecap="round"/><circle cx="64" cy="56" r="5" fill="#7f8c8d"/>`),
    bolt: S(`<path d="M74 8L32 70h22l-8 50 44-64H66z" fill="#f0b232"/>`),
    lovehearts: S(`<path d="M44 34C30 20 10 26 10 44c0 16 14 28 34 40 20-12 34-24 34-40 0-18-20-24-34-10z" fill="#ff7b93"/><path d="M88 68c-8-8-20-4-20 6 0 9 8 16 20 24 12-8 20-15 20-24 0-10-12-14-20-6z" fill="#f23f43"/>`),

    star: S(`<path d="M64 12l16 33 36 4-27 25 8 36-33-19-33 19 8-36-27-25 36-4z" fill="#ffc833"/>`),
    cherry: S(`<path d="M70 16c0 0 2 30-22 62M70 16c0 0 4 32 16 60" stroke="#3e9948" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="44" cy="88" r="20" fill="#e33e4a"/><circle cx="88" cy="90" r="18" fill="#e33e4a"/><circle cx="38" cy="80" r="6" fill="#ff8a93"/>`),
    lemon: S(`<ellipse cx="64" cy="66" rx="38" ry="26" fill="#f5d90a" transform="rotate(-25 64 66)"/><circle cx="30" cy="82" r="7" fill="#f5d90a"/><circle cx="98" cy="50" r="7" fill="#f5d90a"/>`),

    melon: S(`<path d="M64 108L14 52a50 50 0 01100 0z" fill="#2ea35a"/><path d="M64 99L24 54a40 40 0 0180 0z" fill="#fff"/><path d="M64 90L33 55a31 31 0 0162 0z" fill="#ff5b6b"/><g fill="#1e1f22"><circle cx="50" cy="60" r="3.5"/><circle cx="78" cy="60" r="3.5"/><circle cx="64" cy="74" r="3.5"/></g>`),
    medal1: S(`<path d="M50 8l14 30 14-30h18L74 52H54L32 8z" fill="#e0483f"/><circle cx="64" cy="80" r="30" fill="#ffc833"/><circle cx="64" cy="80" r="23" fill="#e0a800"/><rect x="59" y="64" width="10" height="32" rx="4" fill="#fff"/>`),
    medal2: S(`<path d="M50 8l14 30 14-30h18L74 52H54L32 8z" fill="#e0483f"/><circle cx="64" cy="80" r="30" fill="#c9ced6"/><circle cx="64" cy="80" r="23" fill="#9aa0a6"/><rect x="51" y="64" width="9" height="32" rx="4" fill="#fff"/><rect x="68" y="64" width="9" height="32" rx="4" fill="#fff"/>`),
    medal3: S(`<path d="M50 8l14 30 14-30h18L74 52H54L32 8z" fill="#e0483f"/><circle cx="64" cy="80" r="30" fill="#d38b5d"/><circle cx="64" cy="80" r="23" fill="#a5683d"/><rect x="44" y="64" width="8" height="32" rx="4" fill="#fff"/><rect x="60" y="64" width="8" height="32" rx="4" fill="#fff"/><rect x="76" y="64" width="8" height="32" rx="4" fill="#fff"/>`),
};

const dir = path.join(__dirname, '..', 'assets', 'emojis');
fs.mkdirSync(dir, { recursive: true });
for (const [name, svg] of Object.entries(icons))
    fs.writeFileSync(path.join(dir, `${name}.svg`), svg);
console.log(`wrote ${Object.keys(icons).length} svgs to ${path.relative(process.cwd(), dir)}`);
