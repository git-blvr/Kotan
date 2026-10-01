const path = require('node:path');
const crypto = require('node:crypto');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    MediaGalleryBuilder,
    MediaGalleryItemBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    AttachmentBuilder,
} = require('discord.js');
const { base, cv2 } = require('../helpers/embeds');
const { cardContainer, cardImgSrc } = require('./welcomeMsg');
const { accentFor } = require('./dominantColor');
const config = require('../config');
const logger = require('./logger');

// CAPTCHA gate — a dashboard-posted CV2 panel carries a Verify button.
// Clicking it replies ephemerally with a scrambled-code image and three
// answer buttons; the correct pick grants the configured role. Challenges
// live only in memory (nonce -> answer index) so nothing secret is sent
// in a custom id — a stale nonce after restart just asks for a retry.

const FONT = (() => {
    try {
        GlobalFonts.registerFromPath(path.join(__dirname, '../assets/fonts/Inter-Bold.woff'), 'Kotan');
        return 'Kotan';
    } catch { return 'sans-serif'; }
})();

// Unambiguous alphabet — the distortion provides the difficulty, so the
// chars themselves skip 0/O 1/I/L to stay human-readable.
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const rnd = (min, max) => min + Math.random() * (max - min);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const code = (n = 5) => Array.from({ length: n }, () => CHARS[crypto.randomInt(CHARS.length)]).join('');

// ---------- image ----------

// Scrambled-code image: chars on an offscreen layer (per-char rotation,
// size and position jitter + ghost echo), then composited onto the noise
// background in thin sinusoidally-offset slices — a wave the glyphs bend
// through. Heavy line/dot noise sits under and over the text.
function render(codeStr) {
    const W = 380, H = 120;
    const txt = createCanvas(W, H);
    const tc = txt.getContext('2d');
    tc.textBaseline = 'middle';
    tc.textAlign = 'center';
    const step = (W - 70) / codeStr.length;
    [...codeStr].forEach((ch, i) => {
        tc.save();
        tc.translate(46 + i * step + rnd(-9, 9), H / 2 + rnd(-13, 13));
        tc.rotate(rnd(-0.5, 0.5));
        tc.scale(1, rnd(0.85, 1.15));
        tc.font = `700 ${Math.floor(rnd(42, 56))}px ${FONT}`;
        tc.fillStyle = pick(['#e8e8ea', '#cfd3dc', '#b7bdca', '#dcdfe5', '#c3c9d6']);
        tc.globalAlpha = 0.35;
        tc.fillText(ch, rnd(-4, 4), rnd(-4, 4)); // ghost echo smears the glyph
        tc.globalAlpha = 1;
        tc.fillText(ch, 0, 0);
        tc.restore();
    });

    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#20222b');
    bg.addColorStop(0.5, '#181a21');
    bg.addColorStop(1, '#14151b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const squiggle = (alpha, width, yBase) => {
        ctx.beginPath();
        ctx.moveTo(-10, yBase + rnd(-14, 14));
        for (let x = 0; x <= W + 10; x += 40)
            ctx.quadraticCurveTo(x + rnd(4, 22), yBase + rnd(-26, 26), x + 40, yBase + rnd(-14, 14));
        ctx.lineWidth = width;
        ctx.strokeStyle = `rgba(${Math.floor(rnd(150, 255))},${Math.floor(rnd(150, 255))},${Math.floor(rnd(150, 255))},${alpha})`;
        ctx.stroke();
    };
    for (let i = 0; i < 4; i++) squiggle(0.16, rnd(1, 2), rnd(10, H - 10)); // under text
    for (let i = 0; i < 90; i++) {
        ctx.beginPath();
        ctx.arc(rnd(0, W), rnd(0, H), rnd(0.6, 1.8), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${rnd(0.03, 0.14)})`;
        ctx.fill();
    }

    // Slice the text layer into vertical strips and drop each by a sine
    // offset — the glyphs come out wavy/broken without OCR-friendly shapes.
    const phase = rnd(0, Math.PI * 2);
    for (let x = 0; x < W; x += 3) {
        const dy = Math.sin(x / 26 + phase) * 6 + Math.sin(x / 11 + phase * 2) * 2.5;
        ctx.drawImage(txt, x, 0, 3, H, x, dy, 3, H);
    }

    for (let i = 0; i < 3; i++) squiggle(0.32, rnd(1.6, 2.8), rnd(24, H - 24)); // over text
    return c.encode('png');
}

// ---------- pending challenges ----------

const pending = new Map(); // nonce -> { guildId, userId, answer, exp }
const lastStart = new Map(); // userId -> timestamp (start-button throttle)
const TTL = 5 * 60_000;
const START_COOLDOWN = 2500;

// Builds a fresh challenge for a member. Null while their start-button
// throttle is hot — retries from a failed answer pass retry:true since
// clicking inside a challenge is already proof they're mid-flow. A
// re-click replaces any still-open challenge.
function newChallenge(guildId, userId, retry = false) {
    const now = Date.now();
    for (const [k, v] of pending) if (v.exp < now) pending.delete(k);
    for (const [k, v] of lastStart) if (now - v > TTL) lastStart.delete(k);
    if (!retry) {
        if (now - (lastStart.get(userId) || 0) < START_COOLDOWN) return null;
        lastStart.set(userId, now);
    }
    for (const [k, v] of pending) if (v.userId === userId) pending.delete(k);

    const correct = code();
    const decoys = [];
    while (decoys.length < 2) {
        const d = code();
        if (d !== correct && !decoys.includes(d)) decoys.push(d);
    }
    const options = [correct, ...decoys];
    for (let i = options.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [options[i], options[j]] = [options[j], options[i]];
    }
    const nonce = crypto.randomBytes(8).toString('hex');
    pending.set(nonce, { guildId, userId, answer: options.indexOf(correct), exp: now + TTL });
    return { nonce, buf: null, code: correct, options };
}

// Reads and consumes a challenge. Returns 'pass' | 'fail' | 'expired'.
// 'fail' callers regenerate — the consumed nonce can't be retried.
function check(nonce, userId, idx) {
    const e = pending.get(nonce);
    if (!e || e.exp < Date.now()) return 'expired';
    pending.delete(nonce);
    if (e.userId !== userId) return 'expired';
    return idx === e.answer ? 'pass' : 'fail';
}

// ---------- payloads ----------

const accent = (colorStr) =>
    (colorStr ? parseInt(String(colorStr).replace('#', ''), 16) : NaN) || config.colors.main;

// Guild-level placeholders — panels aren't member events (same as tickets).
const gfmt = (s, guild) =>
    String(s ?? '')
        .replaceAll('{server}', guild.name)
        .replaceAll('{members}', String(guild.memberCount))
        .replaceAll('{boosts}', String(guild.premiumSubscriptionCount || 0));

const gimg = (u, guild) =>
    String(u || '').replaceAll('{icon}', guild.iconURL({ size: 256 }) || '');

const verifyRow = () =>
    new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify:start').setLabel('Verify').setStyle(ButtonStyle.Success)
    );

// The ephemeral challenge message: heading, the scrambled image, three
// answer buttons labeled with code candidates.
function challengeContainer(nonce, options, note) {
    const c = new ContainerBuilder().setAccentColor(config.colors.main);
    c.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `${note ? `${note}\n` : ''}## Prove you're human\nPick the characters shown in the image — you have 5 minutes.`
        )
    );
    c.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://captcha.png'))
    );
    c.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            options.map((o, i) =>
                new ButtonBuilder()
                    .setCustomId(`verify:ans:${nonce}:${i}`)
                    .setLabel(o)
                    .setStyle(ButtonStyle.Secondary)
            )
        )
    );
    return c;
}

// Send-ready payload for a challenge — reply or update both take files.
function challengePayload(ch, note) {
    return {
        ...cv2(challengeContainer(ch.nonce, ch.options, note)),
        files: [new AttachmentBuilder(ch.buf, { name: 'captcha.png' })],
    };
}

// Panel payload — the configured card (cv2/embed/plain) with the Verify
// button attached, mirroring the tickets panel. Async since 'dominant'
// color mode extracts the accent from the card's image/icon.
async function panelPayload(guild, c) {
    const row = verifyRow();
    const p = c.panel || {};
    const color = await accentFor(p, cardImgSrc(p, (u) => gimg(u, guild), guild.iconURL({ size: 256 }) || ''), accent(p.color));
    if (p.enabled === false)
        return {
            content: p.description || 'Click **Verify** to prove you\'re human.',
            components: [row],
            allowedMentions: { users: [], roles: [], everyone: false },
        };
    if (p.style === 'embed') {
        const e = new EmbedBuilder();
        if (color !== false) e.setColor(color);
        if (p.title) e.setTitle(gfmt(p.title, guild));
        if (p.description) e.setDescription(gfmt(p.description, guild));
        if (p.footer) e.setFooter({ text: gfmt(p.footer, guild) });
        if (p.thumbnail) {
            const t = gimg(p.thumb || '{icon}', guild);
            if (/^https?:\/\//i.test(t)) e.setThumbnail(t);
        }
        return { embeds: [e], components: [row], allowedMentions: { users: [], roles: [], everyone: false } };
    }
    const comps = p.components?.length
        ? p.components
        : [
              { type: 'heading', text: p.title || 'Verification required' },
              { type: 'text', text: p.description || 'This server is protected — click **Verify** below and pick the characters you see.' },
              ...(p.footer ? [{ type: 'separator', size: 'small' }, { type: 'text', text: p.footer }] : []),
          ];
    const container = cardContainer(comps, color, (s) => gfmt(s, guild), (u) => gimg(u, guild));
    container.addActionRowComponents(row);
    return cv2(container);
}

// Pass/fail announcements to the configured log channel.
async function clog(guild, c, text) {
    if (!c.logChannel) return;
    const ch =
        guild.channels.cache.get(c.logChannel) ||
        (await guild.channels.fetch(c.logChannel).catch(() => null));
    if (ch?.isTextBased())
        await ch.send(cv2(base({ color: config.colors.main, title: 'CAPTCHA', description: text }))).catch(() => {});
}

// generate() = newChallenge + rendered image (kept apart so throttling is
// decided before paying for the render). retry:true skips the throttle.
async function generate(guildId, userId, retry = false) {
    const ch = newChallenge(guildId, userId, retry);
    if (!ch) return null;
    try {
        ch.buf = await render(ch.code);
    } catch (e) {
        logger.warn(`captcha render failed: ${e.message}`);
        return null;
    }
    return ch;
}

module.exports = { generate, check, challengePayload, panelPayload, clog };
