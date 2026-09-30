const { PermissionFlagsBits: P } = require('discord.js');

// The permission set Kotan actually needs — shared by the .invite command
// and the website's /invite redirect so they never drift apart.
module.exports = [
    P.ViewChannel, P.SendMessages, P.SendMessagesInThreads,
    P.EmbedLinks, P.AttachFiles, P.ReadMessageHistory, P.AddReactions,
    P.MentionEveryone, P.UseExternalEmojis,
    P.CreatePublicThreads, P.CreatePrivateThreads, P.ManageThreads,
    P.ManageMessages, P.ManageChannels, P.ManageRoles,
    P.KickMembers, P.BanMembers, P.ModerateMembers,
    P.ChangeNickname,
];
