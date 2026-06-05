const {
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { buildTebexPanelMessage } = require('../../utils/tebexPanel');

module.exports = {
  name: 'tebex-panel',
  description: 'Painel profissional do Tebex (dados, saude e chaves).',
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  options: [],

  async run(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Use este comando em um servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const panelMessage = await buildTebexPanelMessage(interaction.user.id, {
        mode: 'overview',
        ephemeral: false,
      });
      await interaction.editReply(panelMessage);
    } catch (error) {
      console.error('[Tebex Panel] Erro ao montar painel:', error);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: 'Nao consegui montar o painel Tebex agora. Verifique o armazenamento local e as chaves.',
          components: [],
        }).catch(() => {});
        return;
      }

      await interaction.reply({
        content: 'Nao consegui montar o painel Tebex agora. Verifique o armazenamento local e as chaves.',
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }
  },
};


