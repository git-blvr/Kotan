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
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.stroke();
}

async function shipCard(userA, userB, pct) {
    const W = 800, H = 340;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#11141c';
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 22); ctx.fill();

    const [avA, avB, kotan] = await Promise.all([
        avatarOf(userA),
        avatarOf(userB),
        loadImage(path.join(IMG_DIR, pct >= 30 ? 'kotanhappyup.png' : 'kotansadup.png')),
    ]);

    // score — top center
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = pct >= 30 ? '#ff6b9d' : '#8a93a8';
    ctx.font = `700 56px ${FONT}`;
    ctx.fillText(`${pct}%`, W / 2, 76);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = '#6e7588';
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
            description: `**${message.author.username}** × **${target.user.username}**`,
            image: 'attachment://ship.png',
        });
        return message.reply({
            ...cv2(container),
            files: [new AttachmentBuilder(buf, { name: 'ship.png' })],
        });
    },
};
