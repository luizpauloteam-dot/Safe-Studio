const { Events, PermissionFlagsBits } = require('discord.js');
const {
  WELCOME_CHANNEL_ID,
  WELCOME_ROLE_ID,
  buildWelcomeMessage,
} = require('../../utils/welcome');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (!member?.guild || member.user?.bot) return;

    const botMember = member.guild.members.me
      || await member.guild.members.fetchMe().catch(() => null);

    const autoRole = member.guild.roles.cache.get(WELCOME_ROLE_ID)
      || await member.guild.roles.fetch(WELCOME_ROLE_ID).catch(() => null);

    if (!autoRole) {
      console.warn(`[Welcome] Role ${WELCOME_ROLE_ID} not found in ${member.guild.name}.`);
    } else if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      console.warn(`[Welcome] Missing "Manage Roles" permission to assign ${autoRole.name} (${autoRole.id}).`);
    } else if (botMember.roles.highest.comparePositionTo(autoRole) <= 0) {
      console.warn(`[Welcome] Cannot assign role ${autoRole.name} (${autoRole.id}) due to role hierarchy.`);
    } else if (!member.roles.cache.has(autoRole.id)) {
      await member.roles.add(autoRole, 'Automatic welcome role assignment').catch((error) => {
        console.error(`[Welcome] Failed to assign role ${autoRole.id} to ${member.user.tag}:`, error);
      });
    }

    const welcomeChannel = member.guild.channels.cache.get(WELCOME_CHANNEL_ID)
      || await member.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);

    if (!welcomeChannel?.isTextBased()) {
      console.warn(`[Welcome] Channel ${WELCOME_CHANNEL_ID} not found or invalid in ${member.guild.name}.`);
      return;
    }

    const permissions = welcomeChannel.permissionsFor(botMember);
    if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
      console.warn(`[Welcome] Missing permission to send messages in #${welcomeChannel.name} (${welcomeChannel.id}).`);
      return;
    }

    await welcomeChannel.send(
      buildWelcomeMessage(member),
    ).catch((error) => {
      console.error(`[Welcome] Failed to send welcome message for ${member.user.tag}:`, error);
    });
  },
};
