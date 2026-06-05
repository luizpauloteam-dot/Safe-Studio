const {
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { listPayments } = require('../../utils/tebexPluginClient');
const {
  buildTebexFooter,
  chunkArray,
  formatCommandError,
  formatIsoUtc,
  requireTebexAdmin,
  truncate,
} = require('../../utils/tebexAdmin');

function normalizePayments(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

function formatPaymentBlock(payment) {
  const packageNames = Array.isArray(payment?.packages)
    ? payment.packages.map((pkg) => pkg?.name).filter(Boolean).join(', ')
    : '';
  const currency = payment?.currency?.iso_4217 || payment?.currency || '';

  return [
    `ID: ${payment?.id || 'N/A'}`,
    `Player: ${payment?.player?.name || 'N/A'}`,
    `Amount: ${[payment?.amount ?? 'N/A', currency].filter(Boolean).join(' ')}`,
    `Packages: ${packageNames || '-'}`,
    `Status: ${payment?.status || 'N/A'}`,
    `UTC: ${formatIsoUtc(payment?.date)}`,
  ].join('\n');
}

module.exports = {
  name: 'recentpayments',
  description: 'Lista os pagamentos mais recentes do Tebex.',
  dm_permission: false,
  options: [],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const payload = await listPayments({ paged: 1 });
      const payments = normalizePayments(payload).slice(0, 25);

      if (payments.length === 0) {
        await interaction.editReply('Nenhum pagamento recente foi encontrado.');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('Recent payments')
        .setDescription('Primeiros 25 pagamentos retornados pela pagina 1 do Tebex.')
        .setFooter(buildTebexFooter());

      chunkArray(payments, 5).forEach((group, index) => {
        const start = (index * 5) + 1;
        const end = start + group.length - 1;

        embed.addFields({
          name: `Payments ${start} to ${end}`,
          value: truncate(group.map((payment) => formatPaymentBlock(payment)).join('\n\n'), 1024),
          inline: false,
        });
      });

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('[recentpayments] Falha ao listar pagamentos Tebex:', error);
      await interaction.editReply(
        formatCommandError(error, 'Falha ao listar os pagamentos recentes no Tebex.'),
      );
    }
  },
};
