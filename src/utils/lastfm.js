const config = require('../config');
const { fetchRetry } = require('./http');

// Thin wrapper over the Last.fm JSON API — the `.fm` command family reads
// everything through `call`. No dependency, just ws.audioscrobbler.com.

const API = 'https://ws.audioscrobbler.com/2.0/';

// Last.fm returns HTTP 200 even for API-level failures — the JSON `error`
// field is the real signal. Callers get { err } on any failure, the data
// object otherwise; `err: 'notfound'` means error 6 (user/artist/track
// doesn't exist), `err: 'off'` means no API key is configured.
async function call(method, params = {}) {
    if (!config.lastfmApiKey) return { err: 'off' };
    const q = new URLSearchParams({ method, api_key: config.lastfmApiKey, format: 'json' });
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
    const res = await fetchRetry(`${API}?${q}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
    if (!res) return { err: 'Last.fm is unreachable — try again in a moment.' };
    const data = await res.json().catch(() => null);
    if (!data) return { err: 'Bad response from Last.fm.' };
    if (data.error)
        return { err: data.error === 6 ? 'notfound' : `Last.fm error ${data.error}: ${data.message || 'unknown'}` };
    return data;
}

// Period aliases → Last.fm's period param, plus the label for cards.
const PERIODS = {
    week: '7day', '7d': '7day', '7day': '7day',
    month: '1month', '1m': '1month', '1month': '1month',
    '3m': '3month', '3month': '3month', quarter: '3month',
    '6m': '6month', '6month': '6month', half: '6month',
    year: '12month', '1y': '12month', '12m': '12month', '12month': '12month',
    all: 'overall', alltime: 'overall', overall: 'overall',
};
const PERIOD_LABEL = {
    '7day': 'last 7 days', '1month': 'last month', '3month': 'last 3 months',
    '6month': 'last 6 months', '12month': 'last year', overall: 'all time',
};

// image: [{"#text": url, size: "small|medium|large|extralarge|mega"}] —
// prefer the requested size, fall back to the biggest non-empty one.
function img(entity, pref = 'extralarge') {
    const list = entity?.image || [];
    return (
        list.find((i) => i.size === pref && i['#text'])?.['#text'] ||
        [...list].reverse().find((i) => i['#text'])?.['#text'] ||
        null
    );
}

const num = (v) => Number(v || 0).toLocaleString('en-US');

module.exports = { call, PERIODS, PERIOD_LABEL, img, num };
