// Fixed-window in-memory rate limiter for public/API routes.
const buckets = new Map();
let lastSweep = 0;

function sweep() {
    const now = Date.now();
    if (now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}

// Fastify preHandler — send+return inside a hook ends the request.
function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
    return async (req, reply) => {
        sweep();
        const key = `${req.ip}|${req.routeOptions?.url || req.url.split('?')[0]}`;
        const now = Date.now();
        let b = buckets.get(key);
        if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
        if (++b.count > max) {
            reply.header('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
            return reply.code(429).send({ ok: false, error: 'Too many requests' });
        }
    };
}

module.exports = { rateLimit };
