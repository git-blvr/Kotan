// Fixed-window in-memory rate limiter for public/API routes.
const buckets = new Map();
let lastSweep = 0;

function sweep() {
    const now = Date.now();
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}

function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
    return (req, res, next) => {
        sweep();
        const key = `${req.ip}|${req.baseUrl}${req.path}`;
        const now = Date.now();
        let b = buckets.get(key);
        if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
        if (++b.count > max) {
            res.set('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
            return res.status(429).json({ ok: false, error: 'Too many requests' });
        }
        next();
    };
}

module.exports = { rateLimit };
