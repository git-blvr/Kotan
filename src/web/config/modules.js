// Single source of truth for module metadata — mirrors src/commands/* dirs.
module.exports = [
    { id: 'core', label: 'Core', description: 'Help, prefix and informational commands.' },
    { id: 'tools', label: 'Tools', description: 'Utility commands — polls, reminders, server info.' },
    { id: 'moderation', label: 'Moderation', description: 'Warns, bans, kicks, timeouts and purge tools.' },
    { id: 'economy', label: 'Economy', description: 'Balances, daily rewards, shop and payments.' },
    { id: 'games', label: 'Games', description: 'Coinflip, slots, RPS and other mini-games.' },
    { id: 'leveling', label: 'Leveling', description: 'XP, ranks and leaderboards.' },
    { id: 'automod', label: 'Automod', description: 'Automatic filtering and anti-spam rules.' },
    { id: 'logging', label: 'Logging', description: 'Event logs for messages, members and moderation.' },
    { id: 'roles', label: 'Roles', description: 'Autorole and reaction-role management.' },
    { id: 'welcome', label: 'Welcome', description: 'Welcome/goodbye messages and DM greetings.' },
    { id: 'tags', label: 'Tags', description: 'Custom commands and saved responses.' },
    { id: 'config', label: 'Config', description: 'Command enable/disable rules and scoping.' },
];
