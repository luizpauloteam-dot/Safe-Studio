const { PermissionFlagsBits } = require('discord.js');
const {
  getGuildTicketConfig,
  getTicketLocale,
} = require('../../utils/tickets');
const {
  closeTicketChannel,
  getChannelTicketLocale,
  resolveTicketRecordFromChannel,
} = require('../../utils/ticketClose');

const COMMAND_COPY = {
  'pt-BR': {
    closeArchived: 'Ticket fechado e movido para {category}.',
    closeCategoryInvalid: 'A categoria de tickets fechados nao esta configurada corretamente. Reconfigure o painel.',
    closeDenied: 'Voce nao tem permissao para fechar este ticket.',
    closeFailedArchive: 'O transcript foi processado, mas nao consegui arquivar o ticket corretamente.',
    notTicketChannel: 'Use este comando dentro de um canal de ticket.',
    systemNotConfigured: 'O sistema de tickets nao esta configurado neste servidor.',
    ticketUnavailable: 'Nao consegui identificar este ticket pelo arquivo de dados nem pelo canal atual.',
  },
  en: {
    closeArchived: 'Ticket closed and moved to {category}.',
    closeCategoryInvalid: 'The closed tickets category is not configured correctly. Please reconfigure the panel.',
    closeDenied: 'You do not have permission to close this ticket.',
    closeFailedArchive: 'The transcript was processed, but I could not archive this ticket correctly.',
    notTicketChannel: 'Use this command inside a ticket channel.',
    systemNotConfigured: 'The ticket system is not configured in this server.',
    ticketUnavailable: 'I could not identify this ticket from the saved data or the current channel.',
  },
};

function getCommandText(locale, key, replacements = {}) {
  const template = COMMAND_COPY[locale]?.[key] ?? COMMAND_COPY['pt-BR'][key] ?? '';

  return Object.entries(replacements).reduce((text, [placeholder, value]) => {
    return text.replace(`{${placeholder}}`, value);
  }, template);
}

function getMember(interaction) {
  return interaction.member || interaction.guild.members.cache.get(interaction.user.id) || null;
}

function canManageTicket(interaction, guildConfig, ticket) {
  const member = getMember(interaction);
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.roles.cache.has(guildConfig.staffRoleId) ||
    interaction.user.id === ticket.userId
  );
}

module.exports = {
  name: 'trascript',
  description: 'Gera o transcript e fecha o ticket atual',
  dm_permission: false,
  options: [],

  async run(client, interaction) {
    if (!interaction.inGuild() || !interaction.channel?.isTextBased()) {
      await interaction.reply({
        content: getCommandText('pt-BR', 'notTicketChannel'),
        ephemeral: true,
      });
      return;
    }

    const channelLocale = getChannelTicketLocale(interaction.channel);
    const guildConfig = getGuildTicketConfig(interaction.guildId);

    if (!guildConfig) {
      await interaction.reply({
        content: getCommandText(channelLocale, 'systemNotConfigured'),
        ephemeral: true,
      });
      return;
    }

    const ticket = await resolveTicketRecordFromChannel(interaction.channel, { persist: true });
    if (!ticket) {
      await interaction.reply({
        content: getCommandText(channelLocale, 'ticketUnavailable'),
        ephemeral: true,
      });
      return;
    }

    const locale = getTicketLocale(ticket);
    if (!canManageTicket(interaction, guildConfig, ticket)) {
      await interaction.reply({
        content: getCommandText(locale, 'closeDenied'),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const closeResult = await closeTicketChannel({
      actorId: interaction.user.id,
      channel: interaction.channel,
      guildConfig,
      ticket,
    });

    if (!closeResult.ok) {
      if (closeResult.code === 'close_category_invalid') {
        await interaction.editReply(getCommandText(locale, 'closeCategoryInvalid'));
        return;
      }

      await interaction.editReply(getCommandText(locale, 'closeFailedArchive'));
      return;
    }

    await interaction.editReply(
      getCommandText(locale, 'closeArchived', { category: `${closeResult.closedCategory}` }),
    );
  },
};
