const path = require('node:path');
const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember } = require('../../helpers/resolve');
const { fetchRetry } = require('../../utils/http');

// Bundled so the % renders even on hosts with no system fonts.
const FONT = (() => {
    try {
        GlobalFonts.registerFromPath(path.join(__dirname, '../../assets/fonts/Inter-Bold.woff'), 'Kotan');
        return 'Kotan';
    } catch { return 'sans-serif'; }
})();

const IMG_DIR = path.join(__dirname, '../../assets/img');

// Same pair always ships the same score — hash of the sorted id pair.
function shipPercent(idA, idB) {
    const key = [String(idA), String(idB)].sort().join(':');
    let h = 5381;
    for (const ch of key) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
    return h % 101;
}

async function avatarOf(user) {
    const url = user.displayAvatarURL({ extension: 'png', size: 256 });
    const res = await fetchRetry(url);
    if (!res.ok) throw new Error(`avatar fetch failed: ${res.status}`);
    return loadImage(Buffer.from(await res.arrayBuffer()));
}

function circle(ctx, img, cx, cy, r) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.closePath();
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.stroke();
}

const SPARKLES = [[150, 55], [310, 120], [490, 118], [655, 60], [80, 240], [720, 245], [200, 300], [600, 298]];

async function shipCard(userA, userB, pct) {
    const W = 800, H = 340;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const happy = pct >= 30;

    // backdrop — warm plum gradient for a match, cooler slate when it's grim
    const bg = ctx.createLinearGradient(0, 0, W, H);
    if (happy) { bg.addColorStop(0, '#2a1220'); bg.addColorStop(0.55, '#161423'); bg.addColorStop(1, '#10121d'); }
    else { bg.addColorStop(0, '#141a26'); bg.addColorStop(0.55, '#111320'); bg.addColorStop(1, '#0e1018'); }
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 22); ctx.fillStyle = bg; ctx.fill();

    // glow behind the middle
    const glow = ctx.createRadialGradient(W / 2, 200, 10, W / 2, 200, 230);
    glow.addColorStop(0, happy ? 'rgba(255,107,157,0.22)' : 'rgba(122,136,168,0.14)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    // sparkle dots — tiny 4-point stars
    ctx.fillStyle = happy ? 'rgba(255,190,214,0.6)' : 'rgba(170,185,215,0.35)';
    for (const [sx, sy] of SPARKLES) {
        ctx.beginPath();
        ctx.moveTo(sx, sy - 5); ctx.quadraticCurveTo(sx, sy, sx + 5, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy + 5); ctx.quadraticCurveTo(sx, sy, sx - 5, sy);
        ctx.quadraticCurveTo(sx, sy, sx, sy - 5); ctx.closePath(); ctx.fill();
    }

    // faint inner border
    ctx.beginPath(); ctx.roundRect(1, 1, W - 2, H - 2, 21);
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.stroke();

    const [avA, avB, kotan] = await Promise.all([
        avatarOf(userA),
        avatarOf(userB),
        loadImage(path.join(IMG_DIR, happy ? 'kotanhappyup.png' : 'kotansadup.png')),
    ]);

    // score — top center
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = happy ? '#ff6b9d' : '#8a93a8';
    ctx.font = `700 56px ${FONT}`;
    ctx.fillText(`${pct}%`, W / 2, 76);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = happy ? '#a0718a' : '#5f6878';
    ctx.fillText('C O M P A T I B I L I T Y', W / 2, 100);

    // kotan in the middle — happy for >=30%, sad below
    const kh = 168, kw = kh * (1145 / 1374);
    ctx.drawImage(kotan, W / 2 - kw / 2, 122, kw, kh);

    circle(ctx, avA, 170, 200, 66);
    circle(ctx, avB, W - 170, 200, 66);

    ctx.fillStyle = '#a7adbf';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(`${userA.username}  ×  ${userB.username}`, W / 2, 322);

    return canvas.encode('png');
}

// Score-tiered banter for the container text.
const DIALOGUES = [
    [80, (a, b) => `**${a}:** so… we're basically soulmates?\n**${b}:** that's what the card says.\n**Kotan:** it's over for the rest of you.`],
    [50, (a, b) => `**${a}:** decent odds, right?\n**${b}:** i've had worse.\n**Kotan:** that counts as a compliment, i think.`],
    [30, (a, b) => `**${a}:** it's… a number.\n**${b}:** technically true.\n**Kotan:** i'm staying out of this one.`],
    [0, (a, b) => `**${a}:** please tell me it's broken.\n**${b}:** it's not broken.\n**Kotan:** *slowly leaves the channel*`],
];
const dialogue = (a, b, pct) => (DIALOGUES.find(([min]) => pct >= min) || DIALOGUES.at(-1))[1](a, b);

module.exports = {
    name: 'ship',
    description: 'Ships you with another member — draws a card with both avatars and the match %.',
    usage: '<@member>',
    aliases: ['love', 'match'],
    cooldown: 5,
    async execute(message, args) {
        const target = await resolveMember(message, args[0]);
        if (!target)
            return sendError(message, `Mention someone to ship you with. Usage: \`${message.prefix}ship @member\``);

        const pct = shipPercent(message.author.id, target.id);
        const buf = await shipCard(message.author, target.user, pct).catch(() => null);
        if (!buf) return sendError(message, 'Could not render the ship card.');

        const container = base({
            color: pct >= 30 ? 0xff6b9d : 0x8a93a8,
            title: `💞 ${message.author.username} × ${target.user.username}`,
            description: dialogue(message.author.username, target.user.username, pct),
            image: 'attachment://ship.png',
        });
        return message.reply({
            ...cv2(container),
            files: [new AttachmentBuilder(buf, { name: 'ship.png' })],
        });
    },
};
