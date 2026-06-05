const { MessageFlags } = require('discord.js');
const { buildClaimLandingMessage, buildClaimErrorMessage } = require('../../utils/claimPanel');
const { getTebexDashboardData } = require('../../utils/tebexPurchases');
const { requireTebexAdmin } = require('../../utils/tebexAdmin');

module.exports = {
  name: 'claim-panel',
  description: 'Publica o painel de claim da Safe Studio neste canal.',
  dm_permission: false,
  options: [],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    const botAvatarUrl = client.user?.displayAvatarURL({ size: 256 }) || '';

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const dashboard = await getTebexDashboardData({ limit: 5 }).catch(() => null);
      const stats = dashboard?.counts || null;

      await interaction.channel.send(
        await buildClaimLandingMessage(stats, {
          ephemeral: false,
          includeBanner: true,
          botAvatarUrl,
        }),
      );

      await interaction.editReply('Painel de claim publicado com sucesso neste canal.');
    } catch (error) {
      console.error('[Claim Panel] Falha ao publicar painel:', error);
      await interaction.editReply(
        await buildClaimErrorMessage('Nao consegui publicar o painel de claim neste canal agora.', {
          ephemeral: true,
          includeBanner: false,
          botAvatarUrl,
        }),
      );
    }
  },
};
