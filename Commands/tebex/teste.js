const {
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { testTebexConnection } = require('../../services/tebexApi');
const {
  buildTebexFooter,
  formatCommandError,
  requireTebexAdmin,
  truncate,
} = require('../../utils/tebexAdmin');

function buildSuccessEmbed(result) {
  return new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('Tebex Plugin API')
    .setDescription('A conexao com a Tebex Plugin API foi validada com sucesso.')
    .addFields(
      {
        name: 'Loja',
        value: truncate(result.store || 'Nao informado', 1024),
        inline: true,
      },
      {
        name: 'Moeda',
        value: truncate(result.currency || 'Nao informada', 1024),
        inline: true,
      },
      {
        name: 'Status',
        value: 'API respondeu corretamente.',
        inline: false,
      },
    )
    .setFooter(buildTebexFooter())
    .setTimestamp(new Date());
}

function buildFailureEmbed(result) {
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('Tebex Plugin API')
    .setDescription('A verificacao da conexao falhou.')
    .addFields({
      name: 'Erro',
      value: truncate(result.error || 'Falha desconhecida ao testar a API.', 1024),
      inline: false,
    })
    .setFooter(buildTebexFooter())
    .setTimestamp(new Date());
}

module.exports = {
  name: 'tebex-teste',
  description: 'Testa a conexao com a Tebex Plugin API.',
  dm_permission: false,
  options: [],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const result = await testTebexConnection();

      await interaction.editReply({
        embeds: [
          result.ok
            ? buildSuccessEmbed(result)
            : buildFailureEmbed(result),
        ],
      });
    } catch (error) {
      console.error('[tebex-teste] Falha ao testar Tebex:', error);
      await interaction.editReply(
        formatCommandError(error, 'Falha ao testar a conexao com a Tebex Plugin API.'),
      );
    }
  },
};
