// Fixed-window in-memory rate limiter for public/API routes.
const buckets = new Map();
const MAX_BUCKETS = 50_000; // hard cap — a flood of unique IPs can't OOM the map
let lastSweep = 0;

function sweep(force = false) {
    const now = Date.now();
    if (!force && now - lastSweep < 60_000) return;
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
        if ((!b || b.reset < now) && buckets.size >= MAX_BUCKETS) {
            // Table full of live buckets — under a distributed flood; forcing
            // another sweep and then hard-limiting newcomers is the safe move.
            sweep(true);
            if (buckets.size >= MAX_BUCKETS) {
                reply.header('Retry-After', '30');
                return reply.code(429).send({ ok: false, error: 'Too many requests' });
            }
        }
        if (!b || b.reset < now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
        if (++b.count > max) {
            reply.header('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
            return reply.code(429).send({ ok: false, error: 'Too many requests' });
        }
        reply.header('X-RateLimit-Limit', String(max))
            .header('X-RateLimit-Remaining', String(max - b.count))
            .header('X-RateLimit-Reset', String(Math.ceil(b.reset / 1000)));
    };
}

module.exports = { rateLimit };
