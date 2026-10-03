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

// Remote fetches only ever touch image hosts the dashboard can display —
// enforced here (not just in the API route) because accentFor() also fetches
// at message-send time from stored card config. Off-list URLs return null and
// callers fall back to the card's custom hex.
const ALLOWED_IMAGE_HOSTS = /^(cdn\.discordapp\.com|media\.discordapp\.net|images-ext-\d+\.discordapp\.net|i\.imgur\.com)$/;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function toBuffer(input) {
    if (Buffer.isBuffer(input)) return input;
    if (typeof input === 'string' && /^https?:\/\//.test(input)) {
        const u = new URL(input); // throws on garbage — the caller's catch maps to null
        if (u.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.test(u.hostname)) return null;
        // redirect:'error' — the allowlist would be meaningless if a 30x could
        // bounce the fetch to an internal address.
        const res = await fetchRetry(input, { redirect: 'error', signal: AbortSignal.timeout(8_000) });
        if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
        if (Number(res.headers.get('content-length')) > MAX_IMAGE_BYTES)
            throw new Error('image too large');
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_IMAGE_BYTES) throw new Error('image too large');
        return buf;
    }
    return input; // local path, stream, etc — loadImage handles these
}

async function dominantColor(input) {
    const key = typeof input === 'string' ? input : null;
    if (key && cache.has(key)) return cache.get(key);

    let color = null;
    try {
        const buf = await toBuffer(input);
        if (buf === null) return null;
        const image = await loadImage(buf);
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

// Resolves a card's accent color from its colorMode:
//   ''        -> the card's custom hex, else `fallback`
//   dominant  -> extracted from `src` (thumb/avatar/icon/first image),
//                falling back to the custom hex then `fallback`
//   none      -> false — callers skip setColor/setAccentColor entirely
async function accentFor(card, src, fallback) {
    if (card?.colorMode === 'none') return false;
    if (card?.colorMode === 'dominant') {
        const c = /^https?:\/\//i.test(src || '') ? await dominantColor(src) : null;
        if (c !== null) return c;
    }
    const n = card?.color ? parseInt(String(card.color).replace('#', ''), 16) : NaN;
    return Number.isFinite(n) ? n : fallback;
}

module.exports = { dominantColor, toHex, accentFor, ALLOWED_IMAGE_HOSTS };
