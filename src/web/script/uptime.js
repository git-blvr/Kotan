/* Status page — polls /api/uptime every 5s; keeps rolling samples for the
   latency and memory sparkline charts. */

(function () {
    'use strict';
    const $ = (s) => document.querySelector(s);
    const SAMPLES = 60;
    const series = { ping: [], mem: [] };

    const fmtUptime = (s) => {
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
        return `${d}d ${h}h ${m}m ${sec}s`;
    };

    function draw(svg, values, color, unit) {
        if (!svg) return;
        const W = 600, H = 120, pad = 6;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        if (values.length < 2) { svg.innerHTML = ''; return; }
        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const span = max - min || 1;
        const pts = values.map((v, i) => [
            pad + (i / (values.length - 1)) * (W - pad * 2),
            H - pad - ((v - min) / span) * (H - pad * 2),
        ]);
        const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
        svg.innerHTML = `
            <path d="${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z" fill="${color}" opacity="0.12"/>
            <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
    }

    const STATUS = {
        operational: ['ok', 'All systems operational'],
        degraded: ['warn', 'Degraded performance'],
        down: ['down', 'Service disruption'],
    };
    const HEALTH_LABEL = { ok: 'Operational', warn: 'Degraded', down: 'Down' };
    const COMPONENT_LABEL = { gateway: 'Discord gateway', api: 'Dashboard API', database: 'Database', memory: 'Memory headroom' };

    let uptimeBase = 0, uptimeAt = 0;
    setInterval(() => {
        if (uptimeBase) $('#uptime').textContent = fmtUptime(uptimeBase + Math.floor((Date.now() - uptimeAt) / 1000));
    }, 1000);

    async function poll() {
        const d = await fetch('/api/uptime').then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!d) return;

        const [cls, label] = STATUS[d.status] || STATUS.down;
        $('#banner-dot').className = `dot ${cls}`;
        $('#banner-text').textContent = label;
        $('#banner-sub').textContent = `checked ${new Date().toLocaleTimeString()}`;

        uptimeBase = d.uptimeSeconds; uptimeAt = Date.now();
        $('#uptime').textContent = fmtUptime(d.uptimeSeconds);
        $('#up24').textContent = d.uptimePercent24h ?? '—';
        $('#st-ping').textContent = d.ping >= 0 ? `${d.ping} ms` : '—';
        $('#st-guilds').textContent = d.guilds.toLocaleString();
        $('#st-users').textContent = d.users.toLocaleString();
        $('#st-mem').textContent = `${d.memoryMB} MB`;
        $('#st-node').textContent = d.node;

        $('#health').innerHTML = Object.entries(d.components || {}).map(([k, v]) => `
            <div class="hrow"><span class="hdot ${v}"></span>
            <span class="hname">${COMPONENT_LABEL[k] || k}</span>
            <span class="hval">${HEALTH_LABEL[v] || v}</span></div>`).join('');

        if (d.ping >= 0) { series.ping.push(d.ping); if (series.ping.length > SAMPLES) series.ping.shift(); }
        series.mem.push(d.memoryMB); if (series.mem.length > SAMPLES) series.mem.shift();
        $('#ch-ping-val').textContent = d.ping >= 0 ? `${d.ping} ms` : '—';
        $('#ch-mem-val').textContent = `${d.memoryMB} MB`;
        draw($('#ch-ping'), series.ping, getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6d6ff2');
        draw($('#ch-mem'), series.mem, getComputedStyle(document.documentElement).getPropertyValue('--ok').trim() || '#3dd68c');
    }

    poll();
    setInterval(poll, 5000);
})();
