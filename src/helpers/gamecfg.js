const { sendError } = require('./embeds');
const { formatCoins } = require('./format');

// Game tuning — the Games dashboard page writes settings.games; these values
// apply to flat rewards (guess, scramble) and wager games (maxBet + the
// win multiplier applied to house payouts). PvP pots stay 2x — the pot is
// loser-funded, so a multiplier would just inflate one side.

function gameCfg(settings) {
    const g = settings?.games || {};
    return {
        maxBet: g.maxBet ?? 0, // 0 = no cap
        winMultiplier: g.winMultiplier ?? 1,
        guessReward: g.guessReward ?? 150,
        scrambleReward: g.scrambleReward ?? 200,
    };
}

// Rejects a wager above the configured cap. Returns true when blocked.
function betCapped(ctx, bet, cur) {
    const cap = gameCfg(ctx.settings).maxBet;
    if (cap && bet > cap) {
        sendError(ctx, `Bets are capped at ${formatCoins(cap, cur)} in this server.`);
        return true;
    }
    return false;
}

// Scaled payout for a house win — 1 returns the wager (net +bet).
const scaled = (settings, bet) => Math.floor(bet * gameCfg(settings).winMultiplier);

module.exports = { gameCfg, betCapped, scaled };
