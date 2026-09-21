// Awaits a single message matching `filter` in `channel`. Resolves to the
// message, or null when the timeout elapses — callers never see a rejection.
async function awaitReply(channel, filter, ms = 30_000) {
    const collected = await channel
        .awaitMessages({ filter, max: 1, time: ms, errors: ['time'] })
        .catch(() => null);
    return collected?.first() ?? null;
}

module.exports = { awaitReply };
