const {
  ApplicationCommandOptionType,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const {
  buildBillingDmPayload,
  buildCommandStatusPayload,
  formatCurrency,
  registerBillingRequest,
} = require('../../utils/cobranca');

const SUCCESS_COLOR = 0x2ecc71;
const ERROR_COLOR = 0xe74c3c;

module.exports = {
  name: 'cobranca',
  description: 'Envia uma cobranca da mensalidade do bot por DM.',
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  options: [
    {
      name: 'usuario',
      description: 'Usuario que vai receber a cobranca',
      type: ApplicationCommandOptionType.User,
      required: true,
    },
    {
      name: 'valor',
      description: 'Valor da mensalidade em reais',
      type: ApplicationCommandOptionType.Number,
      required: true,
      min_value: 0.01,
    },
    {
      name: 'pix',
      description: 'Chave PIX ou codigo copia e cola',
      type: ApplicationCommandOptionType.String,
      required: true,
      min_length: 3,
      max_length: 1500,
    },
  ],

  async run(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply(buildCommandStatusPayload({
        title: 'Cobranca indisponivel',
        subtitle: 'Este comando so pode ser usado dentro de um servidor.',
        lines: [
          'Abra o comando em um servidor para enviar a cobranca por DM.',
        ],
        color: ERROR_COLOR,
      }));
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply(buildCommandStatusPayload({
        title: 'Permissao necessaria',
        subtitle: 'Voce precisa ser administrador para enviar cobrancas.',
        lines: [
          'Apenas administradores podem usar este comando.',
        ],
        color: ERROR_COLOR,
      }));
      return;
    }

    const user = interaction.options.getUser('usuario', true);
    const valor = interaction.options.getNumber('valor', true);
    const pix = interaction.options.getString('pix', true).trim();

    if (user.bot) {
      await interaction.reply(buildCommandStatusPayload({
        title: 'Destino invalido',
        subtitle: 'Nao e possivel enviar cobranca para um bot.',
        lines: [
          'Selecione um usuario real para receber a DM.',
        ],
        color: ERROR_COLOR,
      }));
      return;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const amountLabel = formatCurrency(valor);
    const guildName = interaction.guild?.name || 'Servidor nao informado';
    const botAvatarUrl = client.user?.displayAvatarURL({ size: 256 }) || '';

    try {
      await user.send(
        buildBillingDmPayload({
          user,
          guildName,
          amountLabel,
          pixKey: pix,
          senderTag: interaction.user.tag,
          botAvatarUrl,
        }),
      );

      registerBillingRequest({
        recipientUserId: user.id,
        guildId: interaction.guildId,
        guildName,
        amount: valor,
        senderUserId: interaction.user.id,
        senderTag: interaction.user.tag,
      });

      await interaction.editReply(buildCommandStatusPayload({
        title: 'Cobranca enviada',
        subtitle: `A DM foi enviada com sucesso para ${user.tag}.`,
        lines: [
          `Valor: ${amountLabel}`,
          'Referente a: Mensalidade do bot',
          'O proximo comprovante enviado por esse usuario na DM do bot sera encaminhado automaticamente para a equipe.',
        ],
        color: SUCCESS_COLOR,
      }));
    } catch (error) {
      console.error('[cobranca] Falha ao enviar DM de cobranca:', error);
      await interaction.editReply(buildCommandStatusPayload({
        title: 'Falha ao enviar cobranca',
        subtitle: `Nao consegui enviar a DM para ${user.tag}.`,
        lines: [
          'Verifique se essa pessoa aceita mensagens diretas do servidor.',
          `Valor informado: ${amountLabel}`,
        ],
        color: ERROR_COLOR,
      }));
    }
  },
};
