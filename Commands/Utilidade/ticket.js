const {
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const {
  buildTicketSetupMessage,
  getGuildTicketConfig,
} = require('../../utils/tickets');

module.exports = {
  name: 'ticket',
  description: 'Editor avancado de anuncio (preview, blocos, cor e envio)',
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  options: [],

  async run(client, interaction) {
    const existingConfig = getGuildTicketConfig(interaction.guildId) || {};
    const draftKey = `${interaction.guildId}:${interaction.user.id}`;

    client.ticketSetupDrafts ??= new Map();
    client.ticketSetupDrafts.set(draftKey, {
      panelChannelId: existingConfig.panelChannelId || null,
      categoryId: existingConfig.categoryId || null,
      staffRoleId: existingConfig.staffRoleId || null,
      closedCategoryId: existingConfig.closedCategoryId || null,
      logChannelId: existingConfig.logChannelId || null,
    });

    await interaction.reply({
      ...buildTicketSetupMessage(interaction.guild, client.ticketSetupDrafts.get(draftKey), {
        notice: 'Selecione os campos abaixo e publique o painel.',
      }),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  },
};
