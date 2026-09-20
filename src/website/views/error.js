const { layout, esc } = require('./layout');

function renderError({ user, status = 500, message = 'Something went wrong.', link = null }) {
    const content = `
        <div style="text-align:center;padding:80px 0">
            <h1 style="font-size:64px;color:var(--accent)">${esc(status)}</h1>
            <p class="muted" style="margin:12px 0 26px">${esc(message)}</p>
            ${link ? `<a class="btn" href="${esc(link.href)}">${esc(link.label)}</a>` : '<a class="btn" href="/">Back home</a>'}
        </div>`;
    return layout({ title: `Error ${status}`, user, active: '', content });
}

module.exports = { renderError };
