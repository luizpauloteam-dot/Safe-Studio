const {
  ChannelType,
  Events,
  ModalBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const {
  buildTicketControlMessage,
  buildTicketCreateModal,
  buildPortugueseTicketMenuMessage,
  buildTicketPanelMessage,
  buildTicketSetupMessage,
  createManagedTicket,
  findOpenTicketByUser,
  getGuildTicketConfig,
  getTicketLocale,
  getLocalizedModalFields,
  getTicketType,
  removeTicketRecord,
  setGuildTicketConfig,
  updateTicketRecord,
} = require('../../utils/tickets');
const {
  closeTicketChannel,
  getChannelTicketLocale,
  resolveTicketRecordFromChannel,
} = require('../../utils/ticketClose');

const FLOW_COPY = {
  'pt-BR': {
    claimDenied: 'Apenas a equipe de atendimento pode assumir este ticket.',
    claimSuccess: 'Ticket assumido com sucesso.',
    claimSuccessSameUser: 'Este ticket ja estava assumido por voce.',
    categoryMissing: 'A categoria configurada para tickets nao existe mais.',
    closeArchived: 'Ticket fechado e movido para {category}.',
    closeCategoryInvalid: 'A categoria de tickets fechados nao esta configurada corretamente. Reconfigure o painel.',
    closeFailedArchive: 'O transcript foi processado, mas nao consegui arquivar o ticket corretamente.',
    createFailed: 'Nao foi possivel criar o ticket agora. Verifique minhas permissoes e tente novamente.',
    createdSuccess: 'Seu ticket foi criado com sucesso em {channel}.',
    closeDenied: 'Voce nao tem permissao para fechar este ticket.',
    deleteDenied: 'Voce nao tem permissao para deletar este ticket arquivado.',
    deleteFailed: 'Nao consegui deletar este canal.',
    deleteSuccess: 'Canal deletado com sucesso.',
    existingTicket: 'Voce ja possui um ticket aberto em {channel}.',
    invalidType: 'Tipo de ticket invalido.',
    lockExists: 'Ja existe uma criacao de ticket em andamento para voce. Tente novamente em alguns segundos.',
    manageChannelsRequired: 'Eu preciso da permissao `Gerenciar canais` para criar tickets.',
    staffMissing: 'O cargo de staff configurado para tickets nao existe mais.',
    ticketUnavailable: 'Nao consegui identificar este ticket pelo arquivo de dados nem pelo canal atual.',
    systemNotConfigured: 'O sistema de tickets nao esta configurado neste servidor.',
    systemNotConfiguredYet: 'O sistema de tickets ainda nao foi configurado neste servidor.',
  },
  en: {
    claimDenied: 'Only the support team can claim this ticket.',
    claimSuccess: 'Ticket claimed successfully.',
    claimSuccessSameUser: 'This ticket was already claimed by you.',
    categoryMissing: 'The configured ticket category no longer exists.',
    closeArchived: 'Ticket closed and moved to {category}.',
    closeCategoryInvalid: 'The closed tickets category is not configured correctly. Please reconfigure the panel.',
    closeFailedArchive: 'The transcript was processed, but I could not archive this ticket correctly.',
    createFailed: 'I could not create the ticket right now. Please check my permissions and try again.',
    createdSuccess: 'Your ticket was created successfully in {channel}.',
    closeDenied: 'You do not have permission to close this ticket.',
    deleteDenied: 'You do not have permission to delete this archived ticket.',
    deleteFailed: 'I could not delete this channel.',
    deleteSuccess: 'Channel deleted successfully.',
    existingTicket: 'You already have an open ticket in {channel}.',
    invalidType: 'Invalid ticket type.',
    lockExists: 'There is already a ticket creation in progress for you. Please try again in a few seconds.',
    manageChannelsRequired: 'I need the `Manage Channels` permission to create tickets.',
    staffMissing: 'The configured staff role no longer exists.',
    ticketUnavailable: 'I could not identify this ticket from the saved data or the current channel.',
    systemNotConfigured: 'The ticket system is not configured in this server.',
    systemNotConfiguredYet: 'The ticket system has not been configured in this server yet.',
  },
};

function getFlowText(locale, key, replacements = {}) {
  const template = FLOW_COPY[locale]?.[key] ?? FLOW_COPY['pt-BR'][key] ?? '';

  return Object.entries(replacements).reduce((text, [placeholder, value]) => {
    return text.replace(`{${placeholder}}`, value);
  }, template);
}

function mapTicketCreateCodeToFlowKey(code) {
  if (code === 'ticket_category_missing') return 'categoryMissing';
  if (code === 'ticket_staff_role_missing') return 'staffMissing';
  if (code === 'manage_channels_required') return 'manageChannelsRequired';
  return 'createFailed';
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

function canClaimTicket(interaction, guildConfig) {
  const member = getMember(interaction);
  if (!member) return false;

  return (
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.roles.cache.has(guildConfig.staffRoleId)
  );
}

function parseTicketTopic(topic) {
  if (!topic) return null;

  const ownerMatch = topic.match(/ticketOwner:(\d+)/);
  const typeMatch = topic.match(/type:([a-z0-9_-]+)/i);
  const numberMatch = topic.match(/number:(\d+)/i);
  const localeMatch = topic.match(/locale:([a-z-]+)/i);
  const statusMatch = topic.match(/status:([a-z-]+)/i);

  return {
    ownerId: ownerMatch?.[1] || null,
    type: typeMatch?.[1] || null,
    number: numberMatch?.[1] || null,
    locale: localeMatch?.[1] || null,
    status: statusMatch?.[1] || null,
  };
}

function canDeleteArchivedTicket(interaction, guildConfig) {
  const member = getMember(interaction);
  if (!member) return false;

  const topicData = parseTicketTopic(interaction.channel.topic);

  return (
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.roles.cache.has(guildConfig.staffRoleId) ||
    interaction.user.id === topicData?.ownerId
  );
}

function getSetupDraftKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getTicketSetupDraft(client, guildId, userId) {
  client.ticketSetupDrafts ??= new Map();
  return client.ticketSetupDrafts.get(getSetupDraftKey(guildId, userId)) || null;
}

function setTicketSetupDraft(client, guildId, userId, nextDraft) {
  client.ticketSetupDrafts ??= new Map();
  client.ticketSetupDrafts.set(getSetupDraftKey(guildId, userId), nextDraft);
  return nextDraft;
}

async function resetTicketPanelMessage(interaction) {
  if (!interaction.message?.editable) return;

  await interaction.message.edit(
    buildTicketPanelMessage(interaction.guild),
  ).catch(() => {});
}

async function resolveExistingTicket(guild, userId) {
  const existingTicket = findOpenTicketByUser(guild.id, userId);
  if (!existingTicket) return null;

  const existingChannel = guild.channels.cache.get(existingTicket.channelId)
    || await guild.channels.fetch(existingTicket.channelId).catch(() => null);

  if (!existingChannel) {
    removeTicketRecord(existingTicket.channelId);
    return null;
  }

  return {
    ticket: existingTicket,
    channel: existingChannel,
  };
}

async function showTicketCreateModal(interaction, typeId, locale = 'pt-BR') {
  const ticketType = getTicketType(typeId);
  const responseLocale = locale === 'en' ? 'en' : 'pt-BR';

  if (!ticketType || ticketType.isLanguageMenu) {
    await interaction.reply({
      content: getFlowText(responseLocale, 'invalidType'),
      ephemeral: true,
    });
    return;
  }

  const guildConfig = getGuildTicketConfig(interaction.guildId);
  if (!guildConfig) {
    await interaction.reply({
      content: getFlowText(responseLocale, 'systemNotConfiguredYet'),
      ephemeral: true,
    });
    return;
  }

  const existingTicket = await resolveExistingTicket(interaction.guild, interaction.user.id);
  if (existingTicket) {
    await interaction.reply({
      content: getFlowText(responseLocale, 'existingTicket', { channel: `${existingTicket.channel}` }),
      ephemeral: true,
    });
    return;
  }

  const modalData = buildTicketCreateModal(ticketType, interaction.guild.name, responseLocale);
  const modal = new ModalBuilder()
    .setCustomId(`ticket:create-modal:${ticketType.id}:${responseLocale}`)
    .setTitle(modalData.title)
    .setComponents(...modalData.components);

  await interaction.showModal(modal);
}

async function handlePortugueseMenu(interaction) {
  const locale = 'pt-BR';
  const guildConfig = getGuildTicketConfig(interaction.guildId);

  if (!guildConfig) {
    await interaction.reply({
      content: getFlowText(locale, 'systemNotConfiguredYet'),
      ephemeral: true,
    });
    return;
  }

  const existingTicket = await resolveExistingTicket(interaction.guild, interaction.user.id);
  if (existingTicket) {
    await interaction.reply({
      content: getFlowText(locale, 'existingTicket', { channel: `${existingTicket.channel}` }),
      ephemeral: true,
    });
    return;
  }

  await interaction.reply(
    buildPortugueseTicketMenuMessage(interaction.guild),
  );
}

async function handleCreateButton(interaction) {
  const [, , typeId] = interaction.customId.split(':');
  const ticketType = getTicketType(typeId);

  try {
    if (ticketType?.isLanguageMenu) {
      await handlePortugueseMenu(interaction);
      return;
    }

    await showTicketCreateModal(interaction, typeId, 'en');
  } finally {
    await resetTicketPanelMessage(interaction);
  }
}

async function handleCreateSelect(interaction) {
  const [typeId] = interaction.values;
  const ticketType = getTicketType(typeId);

  try {
    if (ticketType?.isLanguageMenu) {
      await handlePortugueseMenu(interaction);
      return;
    }

    await showTicketCreateModal(interaction, typeId, 'en');
  } finally {
    await resetTicketPanelMessage(interaction);
  }
}

async function handleCreateModal(interaction, client) {
  const [, , typeId, localeFromCustomId] = interaction.customId.split(':');
  const ticketType = getTicketType(typeId);
  const locale = localeFromCustomId === 'en' ? 'en' : 'pt-BR';

  if (!ticketType || ticketType.isLanguageMenu) {
    await interaction.reply({
      content: getFlowText(locale, 'invalidType'),
      ephemeral: true,
    });
    return;
  }

  const guildConfig = getGuildTicketConfig(interaction.guildId);
  if (!guildConfig) {
    await interaction.reply({
      content: getFlowText(locale, 'systemNotConfigured'),
      ephemeral: true,
    });
    return;
  }

  const lockKey = `${interaction.guildId}:${interaction.user.id}`;
  client.ticketCreationLocks ??= new Set();

  if (client.ticketCreationLocks.has(lockKey)) {
    await interaction.reply({
      content: getFlowText(locale, 'lockExists'),
      ephemeral: true,
    });
    return;
  }

  client.ticketCreationLocks.add(lockKey);

  try {
    await interaction.deferReply({ ephemeral: true });

    const categoryChannel = interaction.guild.channels.cache.get(guildConfig.categoryId)
      || await interaction.guild.channels.fetch(guildConfig.categoryId).catch(() => null);
    const staffRole = interaction.guild.roles.cache.get(guildConfig.staffRoleId)
      || await interaction.guild.roles.fetch(guildConfig.staffRoleId).catch(() => null);

    if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
      await interaction.editReply(getFlowText(locale, 'categoryMissing'));
      return;
    }

    if (!staffRole) {
      await interaction.editReply(getFlowText(locale, 'staffMissing'));
      return;
    }

    const existingTicket = await resolveExistingTicket(interaction.guild, interaction.user.id);
    if (existingTicket) {
      await interaction.editReply(getFlowText(locale, 'existingTicket', { channel: `${existingTicket.channel}` }));
      return;
    }

    const botMember = interaction.guild.members.me;
    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.editReply(getFlowText(locale, 'manageChannelsRequired'));
      return;
    }

    const modalFields = getLocalizedModalFields(ticketType, locale);
    const reason = modalFields.map((field) => {
      const value = interaction.fields.getTextInputValue(field.id).trim();
      return `**${field.summaryLabel}:** ${value}`;
    }).join('\n');
    const creationResult = await createManagedTicket({
      guild: interaction.guild,
      guildConfig,
      locale,
      reason,
      type: ticketType.id,
      typeId: ticketType.id,
      userId: interaction.user.id,
    });
    if (!creationResult.ok) {
      await interaction.editReply(getFlowText(locale, mapTicketCreateCodeToFlowKey(creationResult.code)));
      return;
    }

    await interaction.editReply(getFlowText(locale, 'createdSuccess', { channel: `${creationResult.channel}` }));
  } catch (error) {
    console.error('[Erro ao criar ticket]:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(getFlowText(locale, 'createFailed'));
    } else {
      await interaction.reply({
        content: getFlowText(locale, 'createFailed'),
        ephemeral: true,
      }).catch(() => {});
    }
  } finally {
    client.ticketCreationLocks.delete(lockKey);
  }
}

async function handleSetupChannelSelect(interaction, client) {
  const draft = getTicketSetupDraft(client, interaction.guildId, interaction.user.id);

  if (!draft) {
    await interaction.reply({
      content: 'Abra o comando `/ticket` novamente para configurar o painel.',
      ephemeral: true,
    });
    return;
  }

  const nextDraft = {
    ...draft,
  };

  if (interaction.customId === 'ticket:setup:panel-channel') {
    nextDraft.panelChannelId = interaction.values[0] || null;
  }

  if (interaction.customId === 'ticket:setup:category') {
    nextDraft.categoryId = interaction.values[0] || null;
  }

  if (interaction.customId === 'ticket:setup:closed-category') {
    nextDraft.closedCategoryId = interaction.values[0] || null;
  }

  if (interaction.customId === 'ticket:setup:logs') {
    nextDraft.logChannelId = interaction.values[0] || null;
  }

  setTicketSetupDraft(client, interaction.guildId, interaction.user.id, nextDraft);
  await interaction.update(
    buildTicketSetupMessage(interaction.guild, nextDraft, { notice: 'Configuracao atualizada.' }),
  );
}

async function handleSetupRoleSelect(interaction, client) {
  const draft = getTicketSetupDraft(client, interaction.guildId, interaction.user.id);

  if (!draft) {
    await interaction.reply({
      content: 'Abra o comando `/ticket` novamente para configurar o painel.',
      ephemeral: true,
    });
    return;
  }

  const nextDraft = {
    ...draft,
    staffRoleId: interaction.values[0] || null,
  };

  setTicketSetupDraft(client, interaction.guildId, interaction.user.id, nextDraft);
  await interaction.update(
    buildTicketSetupMessage(interaction.guild, nextDraft, { notice: 'Cargo da equipe atualizado.' }),
  );
}

async function handleSetupButton(interaction, client) {
  const draft = getTicketSetupDraft(client, interaction.guildId, interaction.user.id);

  if (!draft) {
    await interaction.reply({
      content: 'Abra o comando `/ticket` novamente para configurar o painel.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.customId === 'ticket:setup:clear-logs') {
    const nextDraft = {
      ...draft,
      logChannelId: null,
    };

    setTicketSetupDraft(client, interaction.guildId, interaction.user.id, nextDraft);
    await interaction.update(
      buildTicketSetupMessage(interaction.guild, nextDraft, { notice: 'Canal de logs removido.' }),
    );
    return;
  }

  if (interaction.customId !== 'ticket:setup:publish') return;

  const missing = [];

  if (!draft.panelChannelId) missing.push('canal do painel');
  if (!draft.categoryId) missing.push('categoria dos tickets');
  if (!draft.staffRoleId) missing.push('cargo da equipe');
  if (!draft.closedCategoryId) missing.push('categoria de fechados');

  if (missing.length > 0) {
    await interaction.update(
      buildTicketSetupMessage(interaction.guild, draft, {
        notice: `Faltando configurar: ${missing.join(', ')}.`,
      }),
    );
    return;
  }

  await interaction.deferUpdate();

  try {
    const previousConfig = getGuildTicketConfig(interaction.guildId);
    const panelChannel = interaction.guild.channels.cache.get(draft.panelChannelId)
      || await interaction.guild.channels.fetch(draft.panelChannelId).catch(() => null);
    const categoryChannel = interaction.guild.channels.cache.get(draft.categoryId)
      || await interaction.guild.channels.fetch(draft.categoryId).catch(() => null);
    const closedCategoryChannel = interaction.guild.channels.cache.get(draft.closedCategoryId)
      || await interaction.guild.channels.fetch(draft.closedCategoryId).catch(() => null);
    const staffRole = interaction.guild.roles.cache.get(draft.staffRoleId)
      || await interaction.guild.roles.fetch(draft.staffRoleId).catch(() => null);
    const logChannel = draft.logChannelId
      ? interaction.guild.channels.cache.get(draft.logChannelId)
        || await interaction.guild.channels.fetch(draft.logChannelId).catch(() => null)
      : null;
    const botMember = interaction.guild.members.me;

    if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.editReply(
        buildTicketSetupMessage(interaction.guild, draft, {
          notice: 'Eu preciso da permissao Gerenciar canais para operar os tickets.',
        }),
      );
      return;
    }

    if (!panelChannel?.isTextBased()) {
      await interaction.editReply(
        buildTicketSetupMessage(interaction.guild, draft, {
          notice: 'O canal do painel nao e valido.',
        }),
      );
      return;
    }

    if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
      await interaction.editReply(
        buildTicketSetupMessage(interaction.guild, draft, {
          notice: 'A categoria dos tickets nao e valida.',
        }),
      );
      return;
    }

    if (!closedCategoryChannel || closedCategoryChannel.type !== ChannelType.GuildCategory) {
      await interaction.editReply(
        buildTicketSetupMessage(interaction.guild, draft, {
          notice: 'A categoria de fechados nao e valida.',
        }),
      );
      return;
    }

    if (!staffRole) {
      await interaction.editReply(
        buildTicketSetupMessage(interaction.guild, draft, {
          notice: 'O cargo da equipe nao e valido.',
        }),
      );
      return;
    }

    if (logChannel && !logChannel.isTextBased()) {
      await interaction.editReply(
        buildTicketSetupMessage(interaction.guild, draft, {
          notice: 'O canal de logs nao e valido.',
        }),
      );
      return;
    }

    const panelPermissions = panelChannel.permissionsFor(botMember);
    if (!panelPermissions?.has(PermissionFlagsBits.ViewChannel) || !panelPermissions?.has(PermissionFlagsBits.SendMessages)) {
      await interaction.editReply(
        buildTicketSetupMessage(interaction.guild, draft, {
          notice: `Nao consigo acessar e enviar mensagens em <#${panelChannel.id}>.`,
        }),
      );
      return;
    }

    const panelMessage = await panelChannel.send(
      buildTicketPanelMessage(interaction.guild),
    );

    const savedConfig = {
      panelChannelId: panelChannel.id,
      categoryId: categoryChannel.id,
      closedCategoryId: closedCategoryChannel.id,
      staffRoleId: staffRole.id,
      logChannelId: logChannel?.id || null,
      panelMessageId: panelMessage.id,
      updatedAt: new Date().toISOString(),
    };

    setGuildTicketConfig(interaction.guildId, savedConfig);
    setTicketSetupDraft(client, interaction.guildId, interaction.user.id, {
      panelChannelId: savedConfig.panelChannelId,
      categoryId: savedConfig.categoryId,
      staffRoleId: savedConfig.staffRoleId,
      closedCategoryId: savedConfig.closedCategoryId,
      logChannelId: savedConfig.logChannelId,
    });

    if (previousConfig?.panelMessageId) {
      const previousPanelChannel = previousConfig.panelChannelId
        ? interaction.guild.channels.cache.get(previousConfig.panelChannelId)
          || await interaction.guild.channels.fetch(previousConfig.panelChannelId).catch(() => null)
        : null;

      if (previousPanelChannel?.isTextBased() && previousConfig.panelMessageId !== panelMessage.id) {
        const previousPanelMessage = await previousPanelChannel.messages.fetch(previousConfig.panelMessageId).catch(() => null);
        if (previousPanelMessage) {
          await previousPanelMessage.delete().catch(() => {});
        }
      }
    }

    await interaction.editReply(
      buildTicketSetupMessage(interaction.guild, getTicketSetupDraft(client, interaction.guildId, interaction.user.id), {
        notice: `Painel publicado com sucesso em <#${panelChannel.id}> e a configuracao foi atualizada.`,
      }),
    );
  } catch (error) {
    console.error('[Erro ao publicar painel de tickets]:', error);
    await interaction.editReply(
      buildTicketSetupMessage(interaction.guild, draft, {
        notice: 'Nao consegui publicar o painel agora.',
      }),
    ).catch(() => {});
  }
}

async function handleClaimButton(interaction) {
  const ticket = await resolveTicketRecordFromChannel(interaction.channel, {
    message: interaction.message,
    persist: true,
  });
  if (!ticket) {
    await interaction.reply({
      content: getFlowText(getChannelTicketLocale(interaction.channel), 'ticketUnavailable'),
      ephemeral: true,
    });
    return;
  }
  const locale = getTicketLocale(ticket);

  const guildConfig = getGuildTicketConfig(interaction.guildId);
  if (!guildConfig) return;

  if (!canClaimTicket(interaction, guildConfig)) {
    await interaction.reply({
      content: getFlowText(locale, 'claimDenied'),
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const updatedTicket = updateTicketRecord(interaction.channelId, {
    claimedBy: interaction.user.id,
  });

  const controlMessageId = updatedTicket?.controlMessageId || interaction.message.id;
  const controlMessage = await interaction.channel.messages.fetch(controlMessageId).catch(() => null);

  if (controlMessage && updatedTicket) {
    await controlMessage.edit(
      buildTicketControlMessage(updatedTicket, guildConfig),
    ).catch(() => {});
  }

  await interaction.editReply(
    ticket.claimedBy === interaction.user.id
      ? getFlowText(locale, 'claimSuccessSameUser')
      : getFlowText(locale, 'claimSuccess'),
  );
}

async function handleCloseButton(interaction) {
  const ticket = await resolveTicketRecordFromChannel(interaction.channel, {
    message: interaction.message,
    persist: true,
  });
  if (!ticket) {
    await interaction.reply({
      content: getFlowText(getChannelTicketLocale(interaction.channel), 'ticketUnavailable'),
      ephemeral: true,
    });
    return;
  }
  const locale = getTicketLocale(ticket);

  const guildConfig = getGuildTicketConfig(interaction.guildId);
  if (!guildConfig) return;

  if (!canManageTicket(interaction, guildConfig, ticket)) {
    await interaction.reply({
      content: getFlowText(locale, 'closeDenied'),
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const closeResult = await closeTicketChannel({
    actorId: interaction.user.id,
    channel: interaction.channel,
    guildConfig,
    interactionMessage: interaction.message,
    ticket,
  });

  if (!closeResult.ok) {
    if (closeResult.code === 'close_category_invalid') {
      await interaction.editReply(getFlowText(locale, 'closeCategoryInvalid'));
      return;
    }

    await interaction.editReply(getFlowText(locale, 'closeFailedArchive'));
    return;
  }

  await interaction.editReply(
    getFlowText(locale, 'closeArchived', { category: `${closeResult.closedCategory}` }),
  );
}

async function handleDeleteButton(interaction) {
  const guildConfig = getGuildTicketConfig(interaction.guildId);
  if (!guildConfig) return;
  const topicData = parseTicketTopic(interaction.channel.topic);
  const locale = topicData?.locale === 'en' ? 'en' : getTicketLocale(getTicketType(topicData?.type));

  if (!canDeleteArchivedTicket(interaction, guildConfig)) {
    await interaction.reply({
      content: getFlowText(locale, 'deleteDenied'),
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await interaction.editReply(getFlowText(locale, 'deleteSuccess'));
    await interaction.channel.delete(`Ticket arquivado deletado por ${interaction.user.tag}`);
  } catch (error) {
    console.error('[Erro ao processar delete do ticket arquivado]:', error);
    await interaction.editReply(getFlowText(locale, 'deleteFailed')).catch(() => {});
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.inGuild()) return;

    if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('ticket:setup:')) {
      await handleSetupChannelSelect(interaction, client);
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'ticket:setup:staff') {
      await handleSetupRoleSelect(interaction, client);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:create') {
      await handleCreateSelect(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket:create:portuguese') {
      const [typeId] = interaction.values;
      await showTicketCreateModal(interaction, typeId, 'pt-BR');
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('ticket:setup:')) {
        await handleSetupButton(interaction, client);
        return;
      }

      if (interaction.customId.startsWith('ticket:create:')) {
        await handleCreateButton(interaction);
        return;
      }

      if (interaction.customId === 'ticket:claim') {
        await handleClaimButton(interaction);
        return;
      }

      if (interaction.customId === 'ticket:close') {
        await handleCloseButton(interaction);
        return;
      }

      if (interaction.customId === 'ticket:delete') {
        await handleDeleteButton(interaction);
      }

      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('ticket:create-modal:')) {
      await handleCreateModal(interaction, client);
    }
  },
};
