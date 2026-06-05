const {
  ApplicationCommandOptionType,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getUserByUsername } = require('../../utils/tebexPluginClient');
const {
  buildTebexFooter,
  formatCommandError,
  formatUnixUtc,
  requireTebexAdmin,
  truncate,
} = require('../../utils/tebexAdmin');

function formatPurchaseTotals(totals) {
  const entries = Object.entries(totals || {});

  if (entries.length === 0) return '-';

  return entries
    .map(([currency, amount]) => `${currency}: ${amount}`)
    .join('\n');
}

function formatRecentPayments(payments) {
  if (!Array.isArray(payments) || payments.length === 0) {
    return 'Nenhum pagamento recente encontrado.';
  }

  return payments.slice(0, 5).map((payment) => {
    const transactionId = payment?.txn_id || payment?.id || 'N/A';
    const price = payment?.price ?? payment?.amount ?? 'N/A';
    const currency = payment?.currency || payment?.currency_code || '';
    const status = payment?.status || 'N/A';

    return [
      `ID: ${transactionId}`,
      `Preco: ${[price, currency].filter(Boolean).join(' ')}`,
      `Status: ${status}`,
      `UTC: ${formatUnixUtc(payment?.time)}`,
    ].join('\n');
  }).join('\n\n');
}

module.exports = {
  name: 'search',
  description: 'Busca informacoes de um usuario no Tebex.',
  dm_permission: false,
  options: [
    {
      name: 'tebex_username',
      description: 'Nome do usuario Tebex',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const tebexUsername = interaction.options.getString('tebex_username', true).trim();

    try {
      const data = await getUserByUsername(tebexUsername);
      const username = data?.player?.username || data?.player?.name || tebexUsername;

      const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle(`Informacoes do player ${username}`)
        .addFields(
          {
            name: 'Username',
            value: truncate(username, 1024),
            inline: true,
          },
          {
            name: 'Ban count',
            value: truncate(String(data?.banCount ?? 0), 1024),
            inline: true,
          },
          {
            name: 'Chargeback rate',
            value: truncate(String(data?.chargebackRate ?? 0), 1024),
            inline: true,
          },
          {
            name: 'Total purchases',
            value: truncate(formatPurchaseTotals(data?.purchaseTotals), 1024),
            inline: false,
          },
          {
            name: 'Recent payments',
            value: truncate(formatRecentPayments(data?.payments), 1024),
            inline: false,
          },
        )
        .setFooter(buildTebexFooter());

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('[search] Falha ao consultar usuario Tebex:', error);
      await interaction.editReply(
        formatCommandError(error, 'Falha ao consultar o usuario no Tebex.'),
      );
    }
  },
};
