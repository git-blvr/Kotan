const path = require('node:path');
const { AttachmentBuilder, ApplicationCommandOptionType: Opt } = require('discord.js');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { base, sendError, cv2 } = require('../../helpers/embeds');
const { resolveMember, resolveUser } = require('../../helpers/resolve');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');
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

// Score-tiered verdict lines — 3 per tier, picked at random.
const SHIP_LINES = [
    [100, [
        'Both are certified ideal lovers!',
        'A match made in heaven — frame this one.',
        'Perfect score. The wedding date is being set as we speak.',
    ]],
    [75, [
        'Looks like we got a couple over here.',
        'Strong chemistry detected — proceed.',
        'Cupid is already loading his bow.',
    ]],
    [50, [
        'There\'s a spark — don\'t blow it.',
        'Could go either way. Might as well flip a coin.',
        'A solid maybe. Buy flowers just in case.',
    ]],
    [25, [
        'Slim chance — but stranger things have happened.',
        'The odds aren\'t great. They\'re not zero though.',
        'Keep expectations… modest.',
    ]],
    [0, [
        'Ship sunk before it left the harbor.',
        'Maybe just stay friends. Distant friends.',
        'Kotan checked twice — still a no.',
    ]],
];
const shipLine = pct => {
    const [, lines] = SHIP_LINES.find(([min]) => pct >= min) || SHIP_LINES.at(-1);
    return `${pct}% | ${lines[Math.floor(Math.random() * lines.length)]}`;
};

async function run(ctx, userA, userB) {
    // One target ships them with the invoker; two targets ship each other.
    const a = userB ? userA : ctx.user;
    const b = userB || userA;
    if (!b)
        return sendError(ctx, `Mention who to ship. Usage: \`${ctx.prefix}ship @member [@member2]\``);

    const pct = shipPercent(a.id, b.id);
    const buf = await shipCard(a, b, pct).catch(() => null);
    if (!buf) return sendError(ctx, 'Could not render the ship card.');

    const container = base({
        color: pct >= 30 ? 0xff6b9d : 0x8a93a8,
        title: `💞 ${a.username} × ${b.username}`,
        description: shipLine(pct),
        image: 'attachment://ship.png',
    });
    return ctx.reply({
        ...cv2(container),
        files: [new AttachmentBuilder(buf, { name: 'ship.png' })],
    });
}

module.exports = {
    name: 'ship',
    description: 'Ships two people (or you with someone) — draws a card with both avatars and the match %.',
    usage: '<@member> [@member2]',
    aliases: ['love', 'match'],
    cooldown: 5,
    guildOnly: false,
    slash: [
        { name: 'member', description: 'First person — ships them with you when member2 is empty', type: Opt.User, required: true },
        { name: 'member2', description: 'Second person — ships member × member2 instead', type: Opt.User },
    ],
    execute: async (message, args) => {
        const resolve = message.guild
            ? async (a) => (await resolveMember(message, a))?.user ?? null
            : async (a) => resolveUser(message.client, a);
        const userA = await resolve(args[0]);
        const userB = args[1] ? await resolve(args[1]) : null;
        if (args[1] && !userB)
            return sendError(message, `Couldn't find "${args[1]}".`);
        return run(fromMessage(message), userA, userB);
    },
    executeSlash: (interaction) =>
        run(
            fromInteraction(interaction),
            interaction.options.getUser('member'),
            interaction.options.getUser('member2')
        ),
};

