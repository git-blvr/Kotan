// Fixed-window in-memory rate limiter for public/API routes.
const buckets = new Map();
const MAX_BUCKETS = 50_000; // hard cap — a flood of unique IPs can't OOM the map
let lastSweep = 0;

// Loopback is exempt entirely — local dev/preview traffic should never
// throttle. Externally reachable deployments are unaffected.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const isLocal = (ip) => LOOPBACK.has(ip);

// Repeat offenders earn a temporary full block — under a sustained flood the
// per-window 429 still costs a lookup + JSON send per request, while a banned
// IP costs a Map.get and drops the connection before any real work runs.
const strikes = new Map(); // ip -> { count, resetAt } — windowed, decays
const banned = new Map();  // ip -> unban timestamp
const STRIKE_LIMIT = 6;
const STRIKE_WINDOW = 10 * 60_000; // strikes expire — no lifetime accumulation
const BAN_MS = 10 * 60_000;

const isBanned = (ip) => {
    const until = banned.get(ip);
    if (!until) return false;
    if (until > Date.now()) return true;
    banned.delete(ip);
    strikes.delete(ip);
    return false;
};

const punish = (ip) => {
    const now = Date.now();
    let s = strikes.get(ip);
    if (!s || s.resetAt < now) s = { count: 0, resetAt: now + STRIKE_WINDOW };
    s.count++;
    strikes.set(ip, s);
    if (s.count >= STRIKE_LIMIT) {
        banned.set(ip, now + BAN_MS);
        strikes.delete(ip);
    }
};

function sweep(force = false) {
    const now = Date.now();
    if (!force && now - lastSweep < 60_000) return;
    lastSweep = now;
    for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
    for (const [k, until] of banned) if (until < now) banned.delete(k);
    for (const [k, s] of strikes) if (s.resetAt < now) strikes.delete(k);
}

// Fastify preHandler — send+return inside a hook ends the request.
// global:true keys on the IP alone — one shared bucket across all routes.
// authedMax applies when req.session is populated (sessionMiddleware ran) —
// signed-in dashboard traffic gets a much wider lane than anonymous requests.
function rateLimit({ windowMs = 60_000, max = 60, authedMax = 0, global = false } = {}) {
    return async (req, reply) => {
        if (isLocal(req.ip)) return;
        if (isBanned(req.ip)) return reply.code(429).end();
        sweep();
        const cap = authedMax && req.session ? authedMax : max;
        const key = global ? req.ip : `${req.ip}|${req.routeOptions?.url || req.url.split('?')[0]}`;
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
        if (++b.count > cap) {
            punish(req.ip);
            reply.header('Retry-After', String(Math.ceil((b.reset - now) / 1000)));
            return reply.code(429).send({ ok: false, error: 'Too many requests' });
        }
        reply.header('X-RateLimit-Limit', String(cap))
            .header('X-RateLimit-Remaining', String(cap - b.count))
            .header('X-RateLimit-Reset', String(Math.ceil(b.reset / 1000)));
    };
}

// Per-IP in-flight request cap. Minute-window buckets miss burst floods
// (500 requests inside one second); this refuses excess concurrent work
// immediately. Runs before the rate buckets so bursts die cheapest.
const inflight = new Map(); // ip -> open request count

function concurrencyCap(max = 30) {
    return async (req, reply) => {
        const ip = req.ip;
        if (isLocal(ip)) return;
        const n = (inflight.get(ip) || 0) + 1;
        inflight.set(ip, n);

        let cleaned = false;
        const cleanup = () => {
            if (cleaned) return;
            cleaned = true;
            const cur = (inflight.get(ip) || 1) - 1;
            cur <= 0 ? inflight.delete(ip) : inflight.set(ip, cur);
        };

        // Listen on multiple events (request close, response finish/close) so
        // aborted requests, cached responses, or pipe errors can never leak slots.
        req.raw.once('close', cleanup);
        reply.raw.once('finish', cleanup);
        reply.raw.once('close', cleanup);

        if (n > max) {
            // Only punish severe floods (2x max) to avoid strike-banning users
            // during transient browser burst loads (e.g. rapid asset fetches).
            if (n > max * 2) punish(ip);
            reply.header('Retry-After', '2');
            return reply.code(429).send({ ok: false, error: 'Too many concurrent requests' });
        }
    };
}

module.exports = { rateLimit, concurrencyCap };
