const crypto = require('crypto');
const { PermissionFlagsBits } = require('discord.js');
const { fetchRetry } = require('../utils/http');

// Discord OAuth2 helpers for the dashboard login.
// Required env: CLIENT_SECRET (from the Dev Portal). The client id is the
// bot's own user id, so no extra config is needed for it.

const API = 'https://discord.com/api/v10';

const newState = () => crypto.randomBytes(16).toString('hex');

function oauthEnabled(client) {
    return Boolean(process.env.CLIENT_SECRET && client.user);
}

function redirectUri(publicUrl) {
    return process.env.OAUTH_REDIRECT || `${publicUrl}/auth/callback`;
}

function authorizeUrl(client, publicUrl, state) {
    const params = new URLSearchParams({
        client_id: client.user.id,
        redirect_uri: redirectUri(publicUrl),
        response_type: 'code',
        scope: 'identify guilds',
        state,
        prompt: 'consent',
    });
    return `https://discord.com/oauth2/authorize?${params}`;
}

// Trades the ?code from Discord for an access token.
async function exchangeCode(client, publicUrl, code) {
    const res = await fetchRetry(`${API}/oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: client.user.id,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri(publicUrl),
        }),
    });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    return res.json();
}

async function fetchMe(accessToken) {
    const res = await fetchRetry(`${API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Fetching user failed: ${res.status}`);
    return res.json();
}

async function fetchMyGuilds(accessToken) {
    const res = await fetchRetry(`${API}/users/@me/guilds`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Fetching guilds failed: ${res.status}`);
    return res.json();
}

// Owner, Administrator or Manage Server — the "manager" definition.
const canManage = (g) =>
    Boolean(
        g.owner ||
            (BigInt(g.permissions ?? 0) &
                (PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild))
    );

const avatarUrl = (user) =>
    user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
        : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user.id) >> 22n) % 6n)}.png`;

const guildIcon = (guild) =>
    guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null;

module.exports = {
    newState,
    oauthEnabled,
    redirectUri,
    authorizeUrl,
    exchangeCode,
    fetchMe,
    fetchMyGuilds,
    canManage,
    avatarUrl,
    guildIcon,
};
