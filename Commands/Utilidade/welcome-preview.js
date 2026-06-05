const {
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { buildWelcomeMessage } = require('../../utils/welcome');

module.exports = {
  name: 'welcome-preview',
  description: 'Shows a preview of the welcome message',
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  options: [],

  async run(client, interaction) {
    if (!interaction.inGuild() || !interaction.member) {
      await interaction.reply({
        content: 'This command can only be used inside a server.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      ...buildWelcomeMessage(interaction.member),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  },
};
