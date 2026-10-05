// Uploads Kotan's emoji set to the bot's application emojis so commands can
// use them anywhere — server doesn't need them added. Run:
//
//   npm run emojis
//
// Renders each icon to PNG with @napi-rs/canvas (Discord doesn't take SVG),
// replaces any existing emoji with the same name, then writes the
// name -> "<:name:id>" map to data/emojis.json, which src/utils/emojis.js
// loads at require-time. Drop extra images (png/jpg/gif/webp) into
// assets/emojis/ and they get uploaded too — filename becomes the key.

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');
const logger = require('../src/utils/logger');

const OUT_DIR = path.join(__dirname, '..', 'data', 'emojis');
const MAP_FILE = path.join(__dirname, '..', 'data', 'emojis.json');
const CUSTOM_DIR = path.join(__dirname, '..', 'assets', 'emojis');
const SIZE = 128;

// ---------- icon drawing (flat, transparent background) ----------

const circle = (ctx, color) => {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(64, 64, 58, 0, Math.PI * 2); ctx.fill();
};
const mark = (ctx, width = 13) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
};

const ICONS = {
    check(ctx) {
        circle(ctx, '#23a55a');
        ctx.beginPath(); ctx.moveTo(38, 67); ctx.lineTo(57, 86); ctx.lineTo(91, 47); mark(ctx);
    },
    cross(ctx) {
        circle(ctx, '#f23f43');
        ctx.beginPath();
        ctx.moveTo(46, 46); ctx.lineTo(82, 82);
        ctx.moveTo(82, 46); ctx.lineTo(46, 82);
        mark(ctx, 12);
    },
    warn(ctx) {
        ctx.fillStyle = '#f0b232';
        ctx.beginPath();
        ctx.moveTo(64, 14); ctx.lineTo(116, 106); ctx.lineTo(12, 106); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1e1f22';
        ctx.fillRect(58, 42, 12, 34);
        ctx.beginPath(); ctx.arc(64, 90, 7, 0, Math.PI * 2); ctx.fill();
    },
    info(ctx) {
        circle(ctx, '#5865f2');
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(64, 38, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(56, 54, 16, 42);
    },
    music(ctx) {
        circle(ctx, '#8b5cf6');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(70, 30, 10, 52);                    // stem
        ctx.beginPath(); ctx.moveTo(80, 30); ctx.quadraticCurveTo(98, 36, 100, 52);
        ctx.lineTo(80, 46); ctx.closePath(); ctx.fill(); // flag
        ctx.beginPath(); ctx.ellipse(58, 84, 15, 11, -0.35, 0, Math.PI * 2); ctx.fill(); // head
    },
    bank(ctx) {
        circle(ctx, '#f1c40f');
        ctx.fillStyle = '#1e1f22';
        ctx.fillRect(34, 46, 60, 10);                    // roof
        for (const x of [38, 57, 76]) ctx.fillRect(x, 60, 11, 28); // columns
        ctx.fillRect(34, 92, 60, 8);                     // base
    },
    coin(ctx) {
        circle(ctx, '#f1c40f');
        ctx.strokeStyle = '#b8860b';
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.arc(64, 64, 44, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#7a5c00';
        ctx.font = 'bold 62px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('$', 64, 68);
    },
    vc(ctx) {
        circle(ctx, '#5865f2');
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();                                 // speaker body
        ctx.moveTo(30, 50); ctx.lineTo(48, 50); ctx.lineTo(70, 30);
        ctx.lineTo(70, 98); ctx.lineTo(48, 78); ctx.lineTo(30, 78);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 8; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(72, 64, 20, -0.9, 0.9); ctx.stroke();   // wave 1
        ctx.beginPath(); ctx.arc(72, 64, 34, -0.75, 0.75); ctx.stroke(); // wave 2
    },
    spark(ctx) {
        ctx.fillStyle = '#57f287';
        ctx.beginPath();                                 // 4-point star
        ctx.moveTo(64, 12);
        ctx.quadraticCurveTo(72, 52, 112, 64);
        ctx.quadraticCurveTo(72, 76, 64, 116);
        ctx.quadraticCurveTo(56, 76, 16, 64);
        ctx.quadraticCurveTo(56, 52, 64, 12);
        ctx.fill();
    },
};

// ---------- main ----------

async function main() {
    if (!process.env.BOT_MAIN_TOKEN) {
        logger.error('BOT_MAIN_TOKEN missing — set it in .env first');
        process.exit(1);
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });

    // 1. Render the built-in set + pick up any user images.
    const jobs = {}; // emojiName -> file path, mapKey
    for (const [key, draw] of Object.entries(ICONS)) {
        const canvas = createCanvas(SIZE, SIZE);
        draw(canvas.getContext('2d'));
        const file = path.join(OUT_DIR, `kotan_${key}.png`);
        fs.writeFileSync(file, canvas.toBuffer('image/png'));
        jobs[`kotan_${key}`] = file;
    }
    if (fs.existsSync(CUSTOM_DIR))
        for (const f of fs.readdirSync(CUSTOM_DIR)) {
            if (!/\.(png|jpe?g|gif|webp)$/i.test(f)) continue;
            const base = path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9_]/g, '_');
            if (base.length >= 2 && base.length <= 25) jobs[`kotan_${base}`] = path.join(CUSTOM_DIR, f);
        }

    // 2. Login and sync the application emoji set.
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    await client.login(process.env.BOT_MAIN_TOKEN);
    const existing = await client.application.emojis.fetch();
    logger.info(`${existing.size} app emojis exist, uploading ${Object.keys(jobs).length}…`);

    const map = {};
    for (const [name, file] of Object.entries(jobs)) {
        try {
            const old = existing.find((e) => e.name === name);
            if (old) await client.application.emojis.delete(old.id).catch(() => {});
            const e = await client.application.emojis.create({ name, attachment: file });
            map[name.replace(/^kotan_/, '')] = `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
            logger.success(`${name} → ${map[name.replace(/^kotan_/, '')]}`);
        } catch (err) {
            logger.warn(`${name} failed: ${err.message}`);
        }
    }

    // Merge with whatever was already uploaded (keys we didn't touch survive).
    let prev = {};
    try { prev = JSON.parse(fs.readFileSync(MAP_FILE, 'utf8')); } catch {}
    fs.writeFileSync(MAP_FILE, JSON.stringify({ ...prev, ...map }, null, 2));
    logger.success(`wrote ${Object.keys({ ...prev, ...map }).length} emoji refs to data/emojis.json`);
    client.destroy();
}

main().then(() => process.exit(0)).catch((e) => { logger.error(e); process.exit(1); });
