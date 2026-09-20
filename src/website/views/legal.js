const { layout } = require('./layout');

// Legal pages — generic templates, adjust the wording for your operation.

function renderPrivacy({ user }) {
    const content = `
        <h1>Privacy Policy</h1>
        <div class="card muted" style="margin-top:16px">
            <p><strong>Data we store.</strong> Kotan stores Discord user and server IDs to provide its
            features: moderation records (warns, tempbans), economy data (balances, inventories,
            daily streaks) and per-server settings (custom prefix).</p><br>
            <p><strong>Message content.</strong> The bot reads message content only to detect commands.
            Message content is never stored or logged.</p><br>
            <p><strong>Dashboard.</strong> Signing in with Discord stores a session cookie and your
            public profile (id, username, avatar) plus your guild list to show manageable servers.</p><br>
            <p><strong>Sharing.</strong> No data is sold or shared with third parties.</p><br>
            <p><strong>Removal.</strong> Server data can be removed by clearing warns/settings via the
            dashboard or by contacting the bot owner.</p><br>
            <p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>
        </div>`;
    return layout({ title: 'Privacy Policy', user, active: '', content });
}

function renderTos({ user }) {
    const content = `
        <h1>Terms of Service</h1>
        <div class="card muted" style="margin-top:16px">
            <p><strong>Usage.</strong> Kotan is provided "as is". Do not use it to violate Discord's
            Terms of Service or Community Guidelines.</p><br>
            <p><strong>Abuse.</strong> Exploiting commands (spam, harassment, evading moderation)
            may result in blacklisting or being reported to Discord.</p><br>
            <p><strong>Availability.</strong> Uptime and data persistence are best-effort; economy
            balances and settings hold no real-world value.</p><br>
            <p><strong>Changes.</strong> Features and these terms may change at any time. Continued
            use of the bot means acceptance of the current terms.</p><br>
            <p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>
        </div>`;
    return layout({ title: 'Terms of Service', user, active: '', content });
}

module.exports = { renderPrivacy, renderTos };
