const { sendError } = require('./embeds');
const { formatCoins } = require('./format');

// Game tuning — the Games dashboard page writes settings.games: global
// defaults plus optional per-game overrides in settings.games.per[game]
// (each field falls back to the global when null/undefined).
// Per-game keys: { reward, maxBet, winMultiplier } — reward applies to the
// flat-prize games (guess, scramble), the others to wager games.
// PvP pots stay 2x — the pot is loser-funded, so a multiplier would just
// inflate one side.

function gameCfg(settings, game) {
    const g = settings?.games || {};
    const p = (game && g.per?.[game]) || {};
    return {
        reward:
            p.reward ??
            (game === 'guess' ? g.guessReward ?? 150 : game === 'scramble' ? g.scrambleReward ?? 200 : 0),
        maxBet: p.maxBet ?? g.maxBet ?? 0, // 0 = no cap
        winMultiplier: p.winMultiplier ?? g.winMultiplier ?? 1,
    };
}

// Rejects a wager above the configured cap. Returns true when blocked.
function betCapped(ctx, bet, cur, game) {
    const cap = gameCfg(ctx.settings, game).maxBet;
    if (cap && bet > cap) {
        sendError(ctx, `Bets are capped at ${formatCoins(cap, cur)} in this server.`);
        return true;
    }
    return false;
}

// Scaled payout for a house win — 1 returns the wager (net +bet).
const scaled = (settings, bet, game) => Math.floor(bet * gameCfg(settings, game).winMultiplier);

module.exports = { gameCfg, betCapped, scaled };
