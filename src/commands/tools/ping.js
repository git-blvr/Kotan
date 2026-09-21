const { info, success, cv2 } = require('../../helpers/embeds');

module.exports = {
    name: 'ping',
    description: 'Shows the bot\'s response time and websocket latency.',
    aliases: ['latency', 'pong'],
    triggers: ['net', 'ms'],
    cooldown: 5,
    async execute(message, args, client) {
        const sent = await message.reply(cv2(info('Pinging...', 'Ping')));
        const roundtrip = sent.createdTimestamp - message.createdTimestamp;
        const ws = Math.round(client.ws.ping);
        return sent.edit(
            cv2(success(`Roundtrip: **${roundtrip}ms**\nWebsocket: **${ws}ms**`, 'Pong!'))
        );
    },
};
