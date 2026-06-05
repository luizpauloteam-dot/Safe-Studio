const {
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getStorePackages } = require('../../utils/tebexPluginClient');
const {
  buildTebexFooter,
  chunkArray,
  formatCommandError,
  requireTebexAdmin,
  truncate,
} = require('../../utils/tebexAdmin');

function normalizePackageList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.packages)) return payload.packages;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function buildPackageEmbeds(packages) {
  return chunkArray(packages, 25).map((group, index) => {
    const embed = new EmbedBuilder()
      .setColor(0xe16941)
      .setTitle(index === 0 ? 'Produtos' : `Produtos (${index + 1})`)
      .setDescription('Lista de produtos encontrados na loja Tebex.')
      .setFooter(buildTebexFooter());

    embed.addFields(
      group.map((pkg) => ({
        name: truncate(pkg?.name || `Produto ${pkg?.id || '?'}`, 256),
        value: truncate([
          `Preco: ${pkg?.price ?? '-'}`,
          `ID: ${pkg?.id ?? '-'}`,
          `Categoria: ${pkg?.category?.name || '-'}`,
        ].join('\n'), 1024),
        inline: false,
      })),
    );

    return embed;
  });
}

module.exports = {
  name: 'products',
  description: 'Lista os produtos cadastrados na loja Tebex.',
  dm_permission: false,
  options: [],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const payload = await getStorePackages();
      const packages = normalizePackageList(payload);

      if (packages.length === 0) {
        await interaction.editReply('Nenhum produto foi encontrado.');
        return;
      }

      const embeds = buildPackageEmbeds(packages);

      await interaction.editReply({
        embeds: [embeds[0]],
      });

      for (const embed of embeds.slice(1)) {
        await interaction.followUp({
          embeds: [embed],
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      console.error('[products] Falha ao listar produtos Tebex:', error);
      await interaction.editReply(
        formatCommandError(error, 'Falha ao listar os produtos no Tebex.'),
      );
    }
  },
};
