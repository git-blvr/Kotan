require('dotenv').config({ quiet: true });

// Central configuration for Kotan. Everything tweakable lives here so the rest
// of the code stays clean. Values come from .env first, then fall back to
// sensible defaults.
module.exports = {
    token: process.env.BOT_MAIN_TOKEN,
    prefix: process.env.PREFIX || '.',
    ownerIds: (process.env.OWNER_IDS || '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),

    // Last.fm API key — powers the .fm command. Get one at
    // https://www.last.fm/api/account/create
    lastfmApiKey: process.env.LASTFM_API_KEY || '',

    colors: {
        main: 0x5865f2,
        success: 0x57f287,
        error: 0xed4245,
        warning: 0xfee75c,
    },

    economy: {
        currency: 'coins',
        startBalance: 0,
        daily: {
            base: 500, // flat reward for .daily
            streakBonus: 100, // extra coins per streak day
            maxStreakBonus: 1000, // cap on the streak bonus
            cooldown: 86_400_000, // 24h
            streakWindow: 172_800_000, // 48h before the streak resets
        },
    },

    // Items shown in .shop / buyable with .shop buy <item>
    shop: [
        { id: 'cookie', name: 'Cookie', price: 100, description: 'A tasty snack for your inventory.' },
        { id: 'coffee', name: 'Coffee', price: 250, description: 'Keeps you awake during raids.' },
        { id: 'ticket', name: 'Lottery Ticket', price: 1_000, description: 'Feeling lucky?' },
        { id: 'gem', name: 'Gem', price: 10_000, description: 'A shiny rock worth showing off.' },
        { id: 'vip', name: 'VIP Pass', price: 50_000, description: 'Pure bragging rights.' },
    ],
};
