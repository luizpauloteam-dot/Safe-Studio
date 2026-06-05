const {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getPayment } = require('../../utils/tebexPluginClient');
const {
  buildTebexFooter,
  formatCommandError,
  formatIsoUtc,
  requireTebexAdmin,
  truncate,
} = require('../../utils/tebexAdmin');

function resolveStatusColor(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'complete' || normalized === 'completed') return 0x2ecc71;
  if (normalized === 'refunded') return 0xe74c3c;
  return 0x3498db;
}

function formatAmount(data) {
  const amount = data?.amount ?? '-';
  const currency = data?.currency?.iso_4217 || data?.currency || '';
  return [amount, currency].filter(Boolean).join(' ');
}

module.exports = {
  name: 'verify',
  description: 'Consulta uma transacao pelo ID no Tebex.',
  dm_permission: false,
  options: [
    {
      name: 'transaction_id',
      description: 'ID da transacao',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const transactionId = interaction.options.getString('transaction_id', true).trim();

    try {
      const data = await getPayment(transactionId);
      const packageNames = Array.isArray(data?.packages)
        ? data.packages.map((item) => item?.name).filter(Boolean).join(', ')
        : '';
      const playerName = data?.player?.name || data?.player?.username || '-';
      const status = data?.status || 'Unknown';

      const embed = new EmbedBuilder()
        .setColor(resolveStatusColor(status))
        .setTitle(`Informacoes para ${transactionId}`)
        .setDescription('Detalhes da transacao consultada no Tebex.')
        .addFields(
          {
            name: 'Preco',
            value: truncate(formatAmount(data) || '-', 1024),
            inline: true,
          },
          {
            name: 'Status',
            value: truncate(String(status), 1024),
            inline: true,
          },
          {
            name: 'Data UTC',
            value: formatIsoUtc(data?.date),
            inline: false,
          },
          {
            name: 'Usuario Tebex',
            value: truncate(playerName, 1024),
            inline: false,
          },
          {
            name: 'Pacotes',
            value: truncate(packageNames || '-', 1024),
            inline: false,
          },
        )
        .setFooter(buildTebexFooter());

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('[verify] Falha ao consultar transacao Tebex:', error);
      await interaction.editReply(
        formatCommandError(error, 'Falha ao consultar a transacao no Tebex.'),
      );
    }
  },
};
