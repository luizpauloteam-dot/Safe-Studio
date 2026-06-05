const {
  ApplicationCommandOptionType,
  MessageFlags,
} = require('discord.js');
const { updateStorePackage } = require('../../utils/tebexPluginClient');
const {
  formatCommandError,
  requireTebexAdmin,
} = require('../../utils/tebexAdmin');

module.exports = {
  name: 'updateproduct',
  description: 'Atualiza status, nome e preco de um produto Tebex.',
  dm_permission: false,
  options: [
    {
      name: 'package_id',
      description: 'ID do produto',
      type: ApplicationCommandOptionType.Integer,
      required: true,
    },
    {
      name: 'enabled',
      description: 'Define se o produto ficara ativo',
      type: ApplicationCommandOptionType.Boolean,
      required: true,
    },
    {
      name: 'name',
      description: 'Novo nome do produto',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
    {
      name: 'price',
      description: 'Novo preco do produto',
      type: ApplicationCommandOptionType.Number,
      required: true,
    },
  ],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const packageId = interaction.options.getInteger('package_id', true);
    const enabled = interaction.options.getBoolean('enabled', true);
    const name = interaction.options.getString('name', true).trim();
    const price = interaction.options.getNumber('price', true);

    try {
      await updateStorePackage(packageId, {
        disabled: !enabled,
        name,
        price,
      });

      await interaction.editReply([
        `Pacote ${packageId} atualizado com sucesso.`,
        `Status: ${enabled ? 'enabled' : 'disabled'}`,
        `Nome: ${name}`,
        `Preco: ${price}`,
      ].join('\n'));
    } catch (error) {
      console.error('[updateproduct] Falha ao atualizar produto Tebex:', error);
      await interaction.editReply(
        formatCommandError(error, 'Falha ao atualizar o produto no Tebex.'),
      );
    }
  },
};
