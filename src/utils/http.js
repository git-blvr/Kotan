// fetch with retries + exponential backoff.
//
// Retries only on network errors, HTTP 5xx and 429 — client errors (4xx)
// are returned immediately so callers can inspect them. Respects Discord's
// Retry-After header when present.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, options = {}, retries = 2, baseDelay = 400) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (res.ok || (res.status < 500 && res.status !== 429)) return res;
            lastError = new Error(`HTTP ${res.status}`);
            if (res.status === 429) {
                const retryAfter = Number(res.headers.get('retry-after'));
                if (retryAfter > 0) await sleep(retryAfter * 1000);
            }
        } catch (err) {
            lastError = err;
        }
        if (attempt < retries) await sleep(baseDelay * 2 ** attempt);
    }
    throw lastError;
}

module.exports = { fetchRetry };
