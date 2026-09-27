const { info, success, cv2 } = require('../../helpers/embeds');
const { fromMessage, fromInteraction } = require('../../helpers/ctx');

async function run(ctx) {
    const sent = await ctx.reply(cv2(info('Pinging...', 'Ping')));
    const roundtrip = sent.createdTimestamp - ctx.createdAt;
    const ws = Math.round(ctx.client.ws.ping);
    return sent.edit(cv2(success(`Roundtrip: **${roundtrip}ms**\nWebsocket: **${ws}ms**`, 'Pong!')));
}

module.exports = {
    name: 'ping',
    description: 'Shows the bot\'s response time and websocket latency.',
    aliases: ['latency', 'pong'],
    triggers: ['net', 'ms'],
    cooldown: 5,
    slash: [],
    execute: (message, args, client) =>
        run(fromMessage(message, { createdAt: message.createdTimestamp, client })),
    executeSlash: (interaction, client) =>
        run(fromInteraction(interaction, { createdAt: interaction.createdTimestamp, client })),
};
