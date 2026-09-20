const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { fetchRetry } = require('./http');

// Dominant Color — extracts the most representative color from an image so it
// can tint embeds / CV2 containers to match the picture.
//
//   const color = await dominantColor(user.displayAvatarURL());
//   if (color !== null) embed.setColor(color); // or container.setAccentColor(color)
//
// How it works: the image is drawn onto a tiny canvas, every pixel is sorted
// into a quantized RGB bucket, and the most populous bucket wins — slightly
// weighted towards saturated pixels so the result is a lively color instead
// of muddy gray. Near-black and transparent pixels are ignored.
//
// Returns a number like 0x5865F2 (ready for setColor / accent_color), or null
// when the image cannot be read. Results are cached per URL.

const SAMPLE_SIZE = 48; // image is downscaled to 48x48 before analysis — plenty for color stats
const CACHE_LIMIT = 512;
const cache = new Map(); // url -> color int

async function toBuffer(input) {
    if (Buffer.isBuffer(input)) return input;
    if (typeof input === 'string' && /^https?:\/\//.test(input)) {
        const res = await fetchRetry(input);
        if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
    }
    return input; // local path, stream, etc — loadImage handles these
}

async function dominantColor(input) {
    const key = typeof input === 'string' ? input : null;
    if (key && cache.has(key)) return cache.get(key);

    let color = null;
    try {
        const image = await loadImage(await toBuffer(input));
        const canvas = createCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
        const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

        // bucket pixels by quantized rgb (32 steps per channel)
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
            const alpha = data[i + 3];
            if (alpha < 125) continue;

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            if (max / 255 < 0.12) continue; // skip near-black pixels

            const q = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
            const bucket = buckets.get(q) || { count: 0, r: 0, g: 0, b: 0, sat: 0 };
            bucket.count++;
            bucket.r += r;
            bucket.g += g;
            bucket.b += b;
            bucket.sat += max === 0 ? 0 : (max - min) / max;
            buckets.set(q, bucket);
        }

        let best = null;
        let bestScore = -1;
        for (const bucket of buckets.values()) {
            // score = population, boosted up to 60% by average saturation
            const score = bucket.count * (0.4 + 0.6 * (bucket.sat / bucket.count));
            if (score > bestScore) {
                bestScore = score;
                best = bucket;
            }
        }

        if (best) {
            const r = Math.round(best.r / best.count);
            const g = Math.round(best.g / best.count);
            const b = Math.round(best.b / best.count);
            color = (r << 16) | (g << 8) | b;
        }
    } catch {
        color = null; // unreadable image — callers fall back to default colors
    }

    if (key && color !== null) {
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
        cache.set(key, color);
    }
    return color;
}

// 0x5865F2 -> "#5865f2" — handy for displaying the color as text.
const toHex = (color) => `#${color.toString(16).padStart(6, '0')}`;

module.exports = { dominantColor, toHex };
