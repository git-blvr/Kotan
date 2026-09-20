const { esc } = require('./layout');

// Tiny dependency-free charts rendered as inline SVG/HTML — no client JS,
// no chart library, safe inside the dashboard's CSP-free pages.

// 14-day sparkline: polyline + soft area fill. An all-zero series renders a
// faint dashed baseline so it reads as an empty chart, not a progress bar.
function sparkline(values, { width = 132, height = 36, color = '#7983f5' } = {}) {
    const max = Math.max(...values);
    if (max === 0)
        return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
            <line x1="0" y1="${height - 6}" x2="${width}" y2="${height - 6}"
                stroke="#1e1e26" stroke-width="1.5" stroke-dasharray="3 5"/></svg>`;
    const step = values.length > 1 ? width / (values.length - 1) : 0;
    const y = (v) => height - 4 - (v / max) * (height - 10);
    const pts = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`);
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">
        <polygon points="0,${height} ${pts.join(' ')} ${width},${height}" fill="${color}" opacity="0.12"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

// "+N this week" badge. invert=true flips good/bad colors (more warns = bad).
function delta(week, prevWeek, { invert = false } = {}) {
    if (!week && !prevWeek) return '<span class="delta flat">no activity yet</span>';
    const diff = week - prevWeek;
    if (diff === 0) return `<span class="delta flat">${week} this week</span>`;
    const good = invert ? diff < 0 : diff > 0;
    return `<span class="delta ${good ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${diff} this week</span>`;
}

// Percentage growth badge — green on gain, red on loss, flat while collecting.
function growth(pct) {
    if (pct == null) return '<span class="delta flat">collecting data…</span>';
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    return `<span class="delta ${cls}">${pct > 0 ? '+' : ''}${pct}% growth</span>`;
}

// Grouped bar chart: warns vs tempbans per day for the last 14 days.
function modActivityChart(days, { width = 620, height = 140 } = {}) {
    if (!days.some((d) => d.warns || d.tempbans)) {
        return '<p class="muted" style="font-size:14px">No moderation activity in the last 14 days.</p>';
    }
    const max = Math.max(1, ...days.flatMap((d) => [d.warns, d.tempbans]));
    const padTop = 10;
    const padBottom = 22;
    const plotH = height - padTop - padBottom;
    const groupW = width / days.length;
    const barW = Math.max(3, Math.min(9, (groupW - 8) / 2));

    let bars = '';
    let labels = '';
    days.forEach((d, i) => {
        const cx = i * groupW + groupW / 2;
        const hW = (d.warns / max) * plotH;
        const hB = (d.tempbans / max) * plotH;
        if (d.warns)
            bars += `<rect x="${(cx - barW - 1).toFixed(1)}" y="${(padTop + plotH - hW).toFixed(1)}" width="${barW}" height="${hW.toFixed(1)}" rx="2" fill="#7983f5"/>`;
        if (d.tempbans)
            bars += `<rect x="${(cx + 1).toFixed(1)}" y="${(padTop + plotH - hB).toFixed(1)}" width="${barW}" height="${hB.toFixed(1)}" rx="2" fill="#f0a35e"/>`;
        if (i % 3 === 1)
            labels += `<text x="${cx.toFixed(1)}" y="${height - 6}" font-size="10" fill="#9aa4b0" text-anchor="middle">${d.date.slice(5)}</text>`;
    });

    return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img"
            aria-label="Warns and tempbans per day">
        <line x1="0" y1="${padTop + plotH}" x2="${width}" y2="${padTop + plotH}" stroke="#2a3240"/>
        ${bars}${labels}</svg>
        <div class="legend">
            <span><i style="background:#7983f5"></i>Warns</span>
            <span><i style="background:#f0a35e"></i>Tempbans</span>
        </div>`;
}

// Ranked horizontal bars for the most-used commands (pure CSS widths).
function topCommandBars(top) {
    if (!top.length) return '<p class="muted" style="font-size:14px">No command usage recorded yet.</p>';
    const peak = top[0].count;
    return top
        .map(
            (t) => `<div class="trow">
            <code>${esc(t.name)}</code>
            <div class="tbar"><span style="width:${Math.max(3, (t.count / peak) * 100).toFixed(1)}%"></span></div>
            <span class="muted" style="text-align:right">${t.count}</span>
        </div>`
        )
        .join('');
}

module.exports = { sparkline, delta, growth, modActivityChart, topCommandBars };
