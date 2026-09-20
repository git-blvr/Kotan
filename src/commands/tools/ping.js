const { info, success } = require('../../helpers/embeds');

module.exports = {
    name: 'ping',
    description: 'Shows the bot\'s response time and websocket latency.',
    aliases: ['latency', 'pong'],
    triggers: ['net', 'ms'],
    cooldown: 5,
    async execute(message, args, client) {
        const sent = await message.reply({ embeds: [info('Pinging...', 'Ping')] });
        const roundtrip = sent.createdTimestamp - message.createdTimestamp;
        const ws = Math.round(client.ws.ping);
        return sent.edit({
            embeds: [
                success(
                    `Roundtrip: **${roundtrip}ms**\nWebsocket: **${ws}ms**`,
                    'Pong!'
                ),
            ],
        });
    },
};
