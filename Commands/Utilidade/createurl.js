const {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { createCheckout } = require('../../utils/tebexPluginClient');
const {
  buildTebexFooter,
  formatCommandError,
  formatIsoUtc,
  requireTebexAdmin,
  truncate,
} = require('../../utils/tebexAdmin');

module.exports = {
  name: 'createurl',
  description: 'Cria uma URL de pagamento para um produto Tebex.',
  dm_permission: false,
  options: [
    {
      name: 'package_id',
      description: 'ID do produto',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: 'tebex_username',
      description: 'Username do cliente no Tebex',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const packageId = interaction.options.getString('package_id', true).trim();
    const tebexUsername = interaction.options.getString('tebex_username', true).trim();

    try {
      const checkoutData = await createCheckout({
        package_id: packageId,
        username: tebexUsername,
      });

      const embed = new EmbedBuilder()
        .setColor(0x2ecc71)
        .setTitle('Checkout URL criada')
        .addFields(
          {
            name: 'URL',
            value: truncate(checkoutData?.url || '-', 1024),
            inline: false,
          },
          {
            name: 'Expira em UTC',
            value: formatIsoUtc(checkoutData?.expires),
            inline: false,
          },
        )
        .setFooter(buildTebexFooter());

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('[createurl] Falha ao criar checkout Tebex:', error);
      await interaction.editReply(
        formatCommandError(error, 'Falha ao criar a URL de checkout no Tebex.'),
      );
    }
  },
};
