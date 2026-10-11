const path = require('node:path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// High-Performance Rust-Accelerated Studio Renderer
// Utilizes @napi-rs/canvas (compiled native Rust Skia bindings) for lightning-fast
// rasterization of static images, variable templates, and multi-frame GIF sequences.

const FONT = (() => {
    try {
        GlobalFonts.registerFromPath(path.join(__dirname, '../assets/fonts/Inter-Bold.woff'), 'Kotan');
        return 'Kotan';
    } catch {
        return 'sans-serif';
    }
})();

const isHttp = (u) => /^https?:\/\//i.test(u || '');
const num01 = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d;
};

// Shape clipping and drawing
function shapePath(ctx, cx, cy, r, shape) {
    ctx.beginPath();
    if (shape === 'square') {
        ctx.rect(cx - r, cy - r, r * 2, r * 2);
    } else if (shape === 'rounded') {
        ctx.roundRect(cx - r, cy - r, r * 2, r * 2, r * 0.4);
    } else if (shape === 'hexagon') {
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const x = cx + r * Math.cos(angle);
            const y = cy + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    } else {
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
}

// Replaces placeholders like {user}, {username}, {server}, {members}, {level}, {xp}
function replaceVars(str, vars = {}) {
    if (!str) return '';
    return String(str)
        .replaceAll('{user}', vars.user || '@Member')
        .replaceAll('{username}', vars.username || 'Member')
        .replaceAll('{server}', vars.server || 'Server')
        .replaceAll('{members}', String(vars.members || '1,284'))
        .replaceAll('{level}', String(vars.level || '42'))
        .replaceAll('{xp}', String(vars.xp || '2,450'))
        .replaceAll('{tag}', vars.tag || '#0001');
}

/**
 * Render a single image layout using Rust-backed @napi-rs/canvas.
 * @param {Object} cfg Layout configuration
 * @param {Object} vars Dynamic placeholder variables
 * @returns {Promise<{ buffer: Buffer, dataUrl: string, width: number, height: number, renderTimeMs: number }>}
 */
async function renderImage(cfg = {}, vars = {}) {
    const start = performance.now();
    const W = Math.min(2400, Math.max(100, Math.round(cfg.width) || 800));
    const H = Math.min(1600, Math.max(100, Math.round(cfg.height) || 300));
    const cv = createCanvas(W, H);
    const ctx = cv.getContext('2d');

    // Background fill
    ctx.fillStyle = `#${(cfg.bgColor || '0f1117').replace('#', '')}`;
    ctx.fillRect(0, 0, W, H);

    // Gradient background if defined
    if (cfg.bgGradient && Array.isArray(cfg.bgGradient.stops) && cfg.bgGradient.stops.length >= 2) {
        const angle = (cfg.bgGradient.angle || 135) * (Math.PI / 180);
        const x1 = W / 2 - Math.cos(angle) * (W / 2);
        const y1 = H / 2 - Math.sin(angle) * (H / 2);
        const x2 = W / 2 + Math.cos(angle) * (W / 2);
        const y2 = H / 2 + Math.sin(angle) * (H / 2);
        const grad = ctx.createLinearGradient(x1, y1, x2, y2);
        cfg.bgGradient.stops.forEach((st, idx) => {
            const offset = st.offset != null ? st.offset : idx / (cfg.bgGradient.stops.length - 1);
            grad.addColorStop(offset, st.color.startsWith('#') ? st.color : `#${st.color}`);
        });
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
    }

    // Background Image
    if (isHttp(cfg.background)) {
        try {
            const bg = await loadImage(cfg.background);
            const s = Math.max(W / bg.width, H / bg.height);
            const bw = bg.width * s;
            const bh = bg.height * s;
            ctx.save();
            if (cfg.bgDim) ctx.globalAlpha = Math.max(0.1, 1 - (cfg.bgDim || 0.4));
            ctx.drawImage(bg, (W - bw) / 2, (H - bh) / 2, bw, bh);
            ctx.restore();
        } catch {
            // Bad URL falls back to solid/gradient
        }
    }

    const elements = Array.isArray(cfg.elements) ? cfg.elements : [];

    // Preload media URLs
    const mediaImgs = new Map();
    const mediaUrls = elements
        .filter((e) => e && (e.type === 'media' || e.type === 'avatar') && e.url && isHttp(e.url))
        .map((e) => e.url);

    await Promise.all(
        [...new Set(mediaUrls)].map(async (u) => {
            try {
                const img = await loadImage(u);
                if (img) mediaImgs.set(u, img);
            } catch {
                // Ignore load error
            }
        })
    );

    // Draw elements
    for (const el of elements) {
        if (!el || el.hidden) continue;
        ctx.save();

        if (el.type === 'media' || el.type === 'avatar') {
            const r = Math.max(4, num01(el.size, 0.3) * H * 0.5);
            const cx = num01(el.x, 0.5) * W;
            const cy = num01(el.y, 0.5) * H;
            const shape = el.shape || 'circle';

            // Glow / Shadow
            if (el.glow) {
                ctx.shadowColor = el.glow.startsWith('#') ? el.glow : `#${el.glow}`;
                ctx.shadowBlur = el.glowBlur || 24;
            }

            const img = el.url ? mediaImgs.get(el.url) : null;
            if (img) {
                shapePath(ctx, cx, cy, r, shape);
                ctx.clip();
                ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
            } else {
                // Placeholder avatar / icon
                shapePath(ctx, cx, cy, r, shape);
                ctx.fillStyle = `#${(el.fill || '5865f2').replace('#', '')}`;
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = `bold ${Math.round(r * 0.8)}px ${FONT}`;
                ctx.fillText((vars.username || 'K')[0].toUpperCase(), cx, cy);
            }

            // Border ring
            if (el.ring) {
                ctx.strokeStyle = el.ring.startsWith('#') ? el.ring : `#${el.ring}`;
                ctx.lineWidth = Math.max(2, el.ringWidth || r * 0.08);
                shapePath(ctx, cx, cy, r - ctx.lineWidth / 2, shape);
                ctx.stroke();
            }
        } else if (el.type === 'text') {
            const px = Math.max(8, num01(el.size, 0.08) * H);
            ctx.font = `${el.bold ? '800' : '600'} ${px}px ${FONT}`;
            ctx.textAlign = ['left', 'right', 'center'].includes(el.align) ? el.align : 'center';
            ctx.textBaseline = 'middle';

            const cx = num01(el.x, 0.5) * W;
            const cy = num01(el.y, 0.5) * H;
            const text = replaceVars(el.text || '', vars);

            if (el.shadow) {
                ctx.shadowColor = el.shadow.startsWith('#') ? el.shadow : `#${el.shadow}`;
                ctx.shadowBlur = el.shadowBlur || 12;
            }

            ctx.fillStyle = el.color ? (el.color.startsWith('#') ? el.color : `#${el.color}`) : '#ffffff';
            ctx.fillText(text, cx, cy);
        } else if (el.type === 'shape' || el.type === 'bar') {
            const cx = num01(el.x, 0.5) * W;
            const cy = num01(el.y, 0.5) * H;
            const w = num01(el.w || el.width, 0.4) * W;
            const h = Math.max(4, num01(el.h || el.height, 0.05) * H);
            const rx = el.radius != null ? el.radius : Math.min(h / 2, 8);

            // Background bar
            ctx.fillStyle = `#${(el.bgColor || '2b2d31').replace('#', '')}`;
            ctx.beginPath();
            ctx.roundRect(cx - w / 2, cy - h / 2, w, h, rx);
            ctx.fill();

            // Progress Fill if progress specified
            if (el.progress != null) {
                const pct = Math.min(1, Math.max(0, Number(el.progress)));
                const fillW = Math.max(0, w * pct);
                ctx.fillStyle = `#${(el.fill || '10b981').replace('#', '')}`;
                ctx.beginPath();
                ctx.roundRect(cx - w / 2, cy - h / 2, fillW, h, rx);
                ctx.fill();
            }
        } else if (el.type === 'badge') {
            const cx = num01(el.x, 0.5) * W;
            const cy = num01(el.y, 0.5) * H;
            const text = replaceVars(el.text || 'BADGE', vars);
            const px = Math.max(10, num01(el.size, 0.04) * H);
            ctx.font = `bold ${px}px ${FONT}`;
            const metrics = ctx.measureText(text);
            const bw = metrics.width + px * 1.6;
            const bh = px * 1.8;

            ctx.fillStyle = `#${(el.bgColor || '5865f2').replace('#', '')}`;
            ctx.beginPath();
            ctx.roundRect(cx - bw / 2, cy - bh / 2, bw, bh, bh / 2);
            ctx.fill();

            ctx.fillStyle = `#${(el.color || 'ffffff').replace('#', '')}`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, cx, cy);
        }

        ctx.restore();
    }

    const buffer = cv.toBuffer('image/png');
    const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
    const renderTimeMs = Math.round((performance.now() - start) * 10) / 10;

    return { buffer, dataUrl, width: W, height: H, renderTimeMs };
}

/**
 * Lightweight pure JavaScript GIF89a encoder for multi-frame animations.
 * Efficiently indexes colors and creates standard animated GIF buffers.
 */
function encodeGif(frames = [], options = {}) {
    const W = Math.max(1, Math.min(1200, Math.round(options.width || 400)));
    const H = Math.max(1, Math.min(800, Math.round(options.height || 200)));
    const fps = Math.min(30, Math.max(1, Math.round(options.fps || 10)));
    const delayHundredths = Math.max(2, Math.round(100 / fps));
    const loop = options.loop !== false;

    // Stream writer
    const bytes = [];
    const writeByte = (b) => bytes.push(b & 0xff);
    const writeWord = (w) => { bytes.push(w & 0xff); bytes.push((w >> 8) & 0xff); };
    const writeString = (s) => { for (let i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i)); };

    // GIF89a Header
    writeString('GIF89a');

    // Logical Screen Descriptor
    writeWord(W);
    writeWord(H);
    // Global Color Table Flag: 1, Color Resolution: 7 (8 bits), Sort: 0, Size: 7 (256 colors)
    writeByte(0xf7);
    writeByte(0x00); // Background Color Index
    writeByte(0x00); // Pixel Aspect Ratio

    // Generate Standard 256 Color Palette (6x6x6 color cube + 40 grays)
    const palette = [];
    const steps = [0, 51, 102, 153, 204, 255];
    for (let r of steps) {
        for (let g of steps) {
            for (let b of steps) {
                palette.push([r, g, b]);
            }
        }
    }
    for (let i = 0; i < 40; i++) {
        const val = Math.round((i / 39) * 255);
        palette.push([val, val, val]);
    }
    while (palette.length < 256) palette.push([0, 0, 0]);

    // Write Global Color Table
    for (let i = 0; i < 256; i++) {
        const [r, g, b] = palette[i];
        writeByte(r); writeByte(g); writeByte(b);
    }

    // Netscape Application Extension for looping
    if (loop) {
        writeByte(0x21); // Extension Introducer
        writeByte(0xff); // Application Extension
        writeByte(0x0b); // Block Size
        writeString('NETSCAPE2.0');
        writeByte(0x03); // Sub-block Size
        writeByte(0x01); // Sub-block ID
        writeWord(0x0000); // Loop count (0 = infinite)
        writeByte(0x00); // Block Terminator
    }

    // Color lookup helper (nearest color in palette)
    const colorCache = new Map();
    const getColorIndex = (r, g, b) => {
        const key = (r << 16) | (g << 8) | b;
        if (colorCache.has(key)) return colorCache.get(key);
        let bestIdx = 0, bestDist = Infinity;
        for (let i = 0; i < 256; i++) {
            const [pr, pg, pb] = palette[i];
            const dist = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
                if (dist === 0) break;
            }
        }
        colorCache.set(key, bestIdx);
        return bestIdx;
    };

    // Write each frame
    for (const frame of frames) {
        const rgba = frame.data; // Uint8ClampedArray of RGBA
        const delay = frame.delay != null ? Math.round(frame.delay / 10) : delayHundredths;

        // Graphic Control Extension
        writeByte(0x21);
        writeByte(0xf9);
        writeByte(0x04); // Byte size
        writeByte(0x04); // Disposal method (04 = restore to bg), no transparency
        writeWord(delay); // Delay time in 1/100ths of second
        writeByte(0x00); // Transparent color index
        writeByte(0x00); // Block terminator

        // Image Descriptor
        writeByte(0x2c); // Image Separator
        writeWord(0); // Left position
        writeWord(0); // Top position
        writeWord(W); // Width
        writeWord(H); // Height
        writeByte(0x00); // No local color table

        // LZW Compression
        const indexedPixels = new Uint8Array(W * H);
        const pixelCount = W * H;
        for (let i = 0; i < pixelCount; i++) {
            const offset = i * 4;
            indexedPixels[i] = getColorIndex(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
        }

        // LZW Encoder
        const minCodeSize = 8;
        writeByte(minCodeSize);

        const clearCode = 1 << minCodeSize;
        const eoiCode = clearCode + 1;
        let codeSize = minCodeSize + 1;
        let nextCode = clearCode + 2;

        const maxCode = (1 << 12);
        const prefixTable = new Int16Array(4096).fill(-1);
        const suffixTable = new Uint8Array(4096);
        const codeTable = new Int16Array(4096).fill(-1);

        // Bit accumulator
        let curAccum = 0;
        let curBits = 0;
        const packet = [];

        const flushPacket = () => {
            if (packet.length > 0) {
                writeByte(packet.length);
                for (let b of packet) writeByte(b);
                packet.length = 0;
            }
        };

        const writeCode = (c) => {
            curAccum |= (c << curBits);
            curBits += codeSize;
            while (curBits >= 8) {
                packet.push(curAccum & 0xff);
                if (packet.length === 254) flushPacket();
                curAccum >>= 8;
                curBits -= 8;
            }
        };

        const resetTable = () => {
            prefixTable.fill(-1);
            codeTable.fill(-1);
            codeSize = minCodeSize + 1;
            nextCode = clearCode + 2;
        };

        writeCode(clearCode);

        let prefix = indexedPixels[0];
        for (let i = 1; i < pixelCount; i++) {
            const suffix = indexedPixels[i];
            const hash = ((prefix << 8) ^ suffix) % 4096;
            let code = -1;

            if (prefixTable[hash] === prefix && suffixTable[hash] === suffix) {
                code = codeTable[hash];
            }

            if (code !== -1) {
                prefix = code;
            } else {
                writeCode(prefix);
                if (nextCode < maxCode) {
                    prefixTable[hash] = prefix;
                    suffixTable[hash] = suffix;
                    codeTable[hash] = nextCode++;
                    if (nextCode === (1 << codeSize) && codeSize < 12) {
                        codeSize++;
                    }
                } else {
                    writeCode(clearCode);
                    resetTable();
                }
                prefix = suffix;
            }
        }
        writeCode(prefix);
        writeCode(eoiCode);

        // Flush remaining bits
        if (curBits > 0) {
            packet.push(curAccum & 0xff);
        }
        flushPacket();
        writeByte(0x00); // Block terminator
    }

    // GIF Trailer
    writeByte(0x3b);

    return Buffer.from(bytes);
}

// ---------- GIF keyframe interpolation ----------
// Animation curves shared with the dashboard preview — `steps` holds the
// current keyframe until the next one (classic per-frame look).
const GIF_EASE = {
    linear: (p) => p,
    easeIn: (p) => p * p,
    easeOut: (p) => 1 - (1 - p) ** 2,
    easeInOut: (p) => (p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2),
    elastic: (p) => (p === 0 || p === 1 ? p : 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    bounce: (p) => {
        const n = 7.5625, d = 2.75;
        if (p < 1 / d) return n * p * p;
        if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
        if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
        return n * (p -= 2.625 / d) * p + 0.984375;
    },
    steps: () => 0,
};
const gifHexRgb = (c) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const gifLerp = (a, b, p) => a + (b - a) * p;
const gifLerpHex = (ca, cb, p) => {
    const pa = gifHexRgb(ca), pb = gifHexRgb(cb);
    if (!pa || !pb) return ca || cb;
    return `#${pa.map((v, i) => Math.round(gifLerp(v, pb[i], p)).toString(16).padStart(2, '0')).join('')}`;
};
const GIF_NUMP = ['x', 'y', 'size', 'w', 'h', 'progress', 'opacity'];
const GIF_COLP = ['color', 'fill', 'ring', 'bgColor'];
function lerpGifEl(a, b, p) {
    if (a.type !== b.type) return { ...a };
    const r = { ...a };
    for (const k of GIF_NUMP) if (isFinite(+a[k]) && isFinite(+b[k])) r[k] = gifLerp(+a[k], +b[k], p);
    for (const k of GIF_COLP) if (gifHexRgb(a[k]) && gifHexRgb(b[k])) r[k] = gifLerpHex(a[k], b[k], p);
    return r;
}

// Sample the keyframed timeline at normalized time tn (0..1); wraps
// last→first so the animation loops seamlessly.
function sampleGifKeyframes(kfs, tn, easeFn) {
    if (kfs.length === 1) return { ...kfs[0] };
    let i = kfs.length - 1;
    for (let j = 0; j < kfs.length - 1; j++) if (tn < kfs[j + 1].t) { i = j; break; }
    const a = kfs[i], b = kfs[(i + 1) % kfs.length];
    const t1 = i === kfs.length - 1 ? 1 + b.t : b.t;
    const raw = Math.min(1, Math.max(0, (tn - a.t) / Math.max(t1 - a.t, 1e-6)));
    const p = easeFn(raw);
    return {
        bgColor: gifLerpHex(a.bgColor || '0b0c10', b.bgColor || a.bgColor || '0b0c10', p),
        elements: (a.elements || []).map((e, ei) => ((b.elements || [])[ei] ? lerpGifEl(e, b.elements[ei], p) : e)),
    };
}

function drawGifElement(ctx, el, W, H, vars) {
    if (!el || el.hidden) return;
    ctx.save();
    ctx.globalAlpha = el.opacity ?? 1;
    if (el.type === 'text') {
        const px = Math.max(8, num01(el.size, 0.1) * H);
        ctx.font = `${el.bold ? '800' : '600'} ${px}px ${FONT}`;
        ctx.textAlign = el.align || 'center';
        ctx.textBaseline = 'middle';
        const cx = num01(el.x, 0.5) * W;
        const cy = num01(el.y, 0.5) * H;
        ctx.fillStyle = el.color ? (String(el.color).startsWith('#') ? el.color : `#${el.color}`) : '#ffffff';
        ctx.fillText(replaceVars(el.text || '', vars), cx, cy);
    } else if (el.type === 'media') {
        const r = Math.max(4, num01(el.size, 0.3) * H * 0.5);
        const cx = num01(el.x, 0.5) * W;
        const cy = num01(el.y, 0.5) * H;
        shapePath(ctx, cx, cy, r, el.shape || 'circle');
        ctx.fillStyle = `#${String(el.fill || '5865f2').replace('#', '')}`;
        ctx.fill();
        if (el.ring) {
            ctx.strokeStyle = `#${String(el.ring).replace('#', '')}`;
            ctx.lineWidth = Math.max(2, r * 0.1);
            ctx.stroke();
        }
    } else if (el.type === 'bar') {
        const cx = num01(el.x, 0.5) * W;
        const cy = num01(el.y, 0.5) * H;
        const w = num01(el.w || 0.6, 0.6) * W;
        const h = Math.max(4, num01(el.h || 0.08, 0.08) * H);
        ctx.fillStyle = `#${String(el.bgColor || '2b2d31').replace('#', '')}`;
        ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
        ctx.fill();
        if (el.progress != null) {
            const fillW = w * Math.min(1, Math.max(0, el.progress));
            ctx.fillStyle = `#${String(el.fill || '10b981').replace('#', '')}`;
            ctx.roundRect(cx - w / 2, cy - h / 2, fillW, h, h / 2);
            ctx.fill();
        }
    }
    ctx.restore();
}

/**
 * Render an animated GIF. Accepts either a keyframed timeline
 * ({ keyframes, durationMs, easing, fps }) or a legacy discrete
 * { frames } sequence (rendered frame-by-frame as before).
 * Uses Rust-backed canvas for frame drawing + optimized GIF encoder.
 */
async function renderGif(gifCfg = {}, vars = {}) {
    const start = performance.now();
    const W = Math.min(800, Math.max(100, Math.round(gifCfg.width) || 400));
    const H = Math.min(600, Math.max(100, Math.round(gifCfg.height) || 200));
    const fps = Math.min(24, Math.max(2, Math.round(gifCfg.fps) || 10));
    const frameDelay = Math.round(1000 / fps);

    const renderedFrames = [];
    const pushFrame = (frameCfg, delay) => {
        const cv = createCanvas(W, H);
        const ctx = cv.getContext('2d');
        ctx.fillStyle = `#${String(frameCfg.bgColor || gifCfg.bgColor || '0f1117').replace('#', '')}`;
        ctx.fillRect(0, 0, W, H);
        const elements = Array.isArray(frameCfg.elements) ? frameCfg.elements : (gifCfg.elements || []);
        for (const el of elements) drawGifElement(ctx, el, W, H, vars);
        renderedFrames.push({ data: ctx.getImageData(0, 0, W, H).data, delay });
    };

    if (Array.isArray(gifCfg.keyframes) && gifCfg.keyframes.length) {
        // Keyframed timeline — sample `fps` frames per second over durationMs.
        const durationMs = Math.min(5000, Math.max(500, Math.round(gifCfg.durationMs) || 3000));
        const easeFn = GIF_EASE[gifCfg.easing] || GIF_EASE.easeInOut;
        const kfs = gifCfg.keyframes
            .map((k) => ({ ...k, t: Math.min(1, Math.max(0, +k.t || 0)) }))
            .sort((a, b) => a.t - b.t);
        const total = Math.max(1, Math.round((durationMs / 1000) * fps));
        for (let i = 0; i < total; i++) pushFrame(sampleGifKeyframes(kfs, i / total, easeFn), frameDelay);
    } else {
        const frames = Array.isArray(gifCfg.frames) ? gifCfg.frames : [];
        if (!frames.length) throw new Error('GIF has no frames defined');
        for (const frameCfg of frames) pushFrame(frameCfg, frameCfg.delay ?? frameDelay);
    }

    const gifBuffer = encodeGif(renderedFrames, { width: W, height: H, fps, loop: gifCfg.loop !== false });
    const dataUrl = `data:image/gif;base64,${gifBuffer.toString('base64')}`;
    const renderTimeMs = Math.round((performance.now() - start) * 10) / 10;

    return { buffer: gifBuffer, dataUrl, width: W, height: H, frameCount: renderedFrames.length, renderTimeMs };
}

module.exports = {
    renderImage,
    renderGif,
    encodeGif,
    replaceVars,
};
