const { MessageFlags } = require('discord.js');
const { processClaimForMember } = require('../../utils/claimFlow');
const {
  buildClaimErrorMessage,
  buildClaimResultMessage,
} = require('../../utils/claimPanel');

module.exports = {
  name: 'claim',
  description: 'Resgata compras Tebex pendentes e entrega os cargos configurados.',
  dm_permission: false,
  options: [],

  async run(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Use este comando dentro de um servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const botAvatarUrl = client.user?.displayAvatarURL({ size: 256 }) || '';

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const result = await processClaimForMember({
        guild: interaction.guild,
        userId: interaction.user.id,
        member: interaction.member,
      });

      await interaction.editReply(
        await buildClaimResultMessage(result, {
          ephemeral: true,
          includeBanner: false,
          botAvatarUrl,
        }),
      );
    } catch (error) {
      console.error('[Claim] Falha ao processar claim:', error);
      await interaction.editReply(
        await buildClaimErrorMessage(
          'Nao consegui acessar o armazenamento de compras agora. Tente novamente em alguns segundos.',
          {
            ephemeral: true,
            includeBanner: false,
            botAvatarUrl,
          },
        ),
      );
    }
  },
};
