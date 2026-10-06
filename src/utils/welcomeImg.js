const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const { AttachmentBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, EmbedBuilder } = require('discord.js');
const { fmt } = require('./welcomeMsg');
const config = require('../config');
const logger = require('./logger');

// Welcome image renderer — the dashboard editor positions elements
// (avatar circles / text runs) on a virtual canvas; positions and sizes are
// stored as 0-1 fractions so the layout is resolution-independent.
//
//   cfg = { enabled, width, height, background, bgColor,
//           elements: [ {type:'avatar', x, y, size, ring}
//                     | {type:'text', x, y, text, size, color, bold, align} ] }

const FONT = (() => {
    try {
        GlobalFonts.registerFromPath(path.join(__dirname, '../assets/fonts/Inter-Bold.woff'), 'Kotan');
        return 'Kotan';
    } catch { return 'sans-serif'; }
})();

const isHttp = (u) => /^https?:\/\//i.test(u || '');
const num01 = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
};

async function render(member, cfg) {
    const W = Math.min(2000, Math.max(200, Math.round(cfg.width) || 800));
    const H = Math.min(1000, Math.max(100, Math.round(cfg.height) || 300));
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');

    ctx.fillStyle = `#${cfg.bgColor || '1e1f22'}`;
    ctx.fillRect(0, 0, W, H);
    if (isHttp(cfg.background)) {
        try {
            const bg = await loadImage(cfg.background);
            const s = Math.max(W / bg.width, H / bg.height);
            ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s);
        } catch { /* bad bg url — color fill stands */ }
    }

    let avatarImg = null;
    if ((cfg.elements || []).some((e) => e.type === 'avatar')) {
        avatarImg = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 })).catch(() => null);
    }

    for (const el of cfg.elements || []) {
        try {
            if (el.type === 'avatar') {
                const r = Math.max(4, num01(el.size, 0.35) * H * 0.5);
                const cx = num01(el.x, 0.5) * W;
                const cy = num01(el.y, 0.4) * H;
                if (avatarImg) {
                    ctx.save();
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
                    ctx.drawImage(avatarImg, cx - r, cy - r, r * 2, r * 2);
                    ctx.restore();
                }
                if (el.ring) {
                    ctx.strokeStyle = `#${el.ring}`;
                    ctx.lineWidth = Math.max(2, r * 0.07);
                    ctx.beginPath(); ctx.arc(cx, cy, r - ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
                }
            } else if (el.type === 'text') {
                const px = Math.max(8, num01(el.size, 0.1) * H);
                ctx.font = `${el.bold ? '800' : '600'} ${px}px ${FONT}`;
                ctx.textAlign = ['left', 'right'].includes(el.align) ? el.align : 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = `#${el.color || 'ffffff'}`;
                ctx.fillText(fmt(el.text, member) || ' ', num01(el.x, 0.5) * W, num01(el.y, 0.5) * H, W * 0.94);
            }
        } catch { /* skip broken element */ }
    }
    return cv.toBuffer('image/png');
}

// Folds the rendered image into a memberPayload result: appended as a media
// gallery inside CV2 containers, as the image of a classic embed, or as a
// bare attachment under a plain text message.
function attachImage(payload, buf) {
    const file = new AttachmentBuilder(buf, { name: 'welcome.png' });
    const p = typeof payload === 'string' ? { content: payload } : payload;
    p.files = [...(p.files || []), file];
    const cont = p.components?.[0];
    if (cont?.addMediaGalleryComponents)
        cont.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://welcome.png'))
        );
    else if (p.embeds?.[0]) p.embeds[0].setImage('attachment://welcome.png');
    else p.embeds = [new EmbedBuilder().setColor(config.colors.main).setImage('attachment://welcome.png')];
    return p;
}

// Render + attach in one shot — used by guildMemberAdd.
async function attach(member, payload, cfg) {
    try {
        return attachImage(payload, await render(member, cfg));
    } catch (err) {
        logger.warn(`welcome image render failed for ${member.id}: ${err.message}`);
        return payload;
    }
}

module.exports = { render, attachImage, attach };
