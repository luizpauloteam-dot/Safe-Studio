const {
  Events,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const {
  STATUS,
  addParticipantToGiveaway,
  buildGiveawayAdminDetailsMessage,
  buildGiveawayBannerModal,
  buildGiveawayDetailsEditorMessage,
  buildGiveawayMessage,
  buildGiveawayParticipantsMessage,
  buildGiveawaySetupMessage,
  buildGiveawaySetupModal,
  buildGiveawayStatusMessage,
  buildSimpleInfoMessage,
  cancelGiveaway,
  canManageGiveaway,
  createDefaultGiveawayDraft,
  endGiveaway,
  formatGiveawayCode,
  getBannerPresetById,
  getGiveawayRecord,
  getParticipant,
  hasRequiredRole,
  listActiveGiveaways,
  normalizeBannerUrl,
  parseDurationInput,
  parseIntegerInput,
  removeParticipantFromGiveaway,
  reserveGiveawayId,
  rerollGiveaway,
  saveGiveawayRecord,
  syncGiveawayMessage,
  syncGuildActiveGiveaways,
} = require('../../utils/giveaways');

function getDraftKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function ensureDraftStore(client) {
  client.giveawayDrafts ??= new Map();
  return client.giveawayDrafts;
}

function getGiveawayDraft(client, guildId, userId, fallbackChannelId = null) {
  const store = ensureDraftStore(client);
  const draftKey = getDraftKey(guildId, userId);

  if (!store.has(draftKey)) {
    store.set(draftKey, createDefaultGiveawayDraft(fallbackChannelId));
  }

  return store.get(draftKey);
}

function setGiveawayDraft(client, guildId, userId, draft) {
  const store = ensureDraftStore(client);
  const draftKey = getDraftKey(guildId, userId);
  store.set(draftKey, draft);
  return draft;
}

function buildAdminError(message) {
  return buildSimpleInfoMessage('Sorteios', [message]);
}

function buildAdminSuccess(message) {
  return buildSimpleInfoMessage('Sorteios', [message], 0x16a34a);
}

function getOptionalSelectedRoleId(fields, customId, fallback = null) {
  try {
    const selectedRoles = fields.getSelectedRoles(customId, false);
    return selectedRoles?.first()?.id || null;
  } catch (error) {
    return fallback;
  }
}

function canUseSetup(interaction) {
  return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function updateSetupMessage(interaction, client, draft, notice) {
  await interaction.update(
    buildGiveawaySetupMessage(
      interaction.guild,
      draft,
      listActiveGiveaways(interaction.guildId),
      { notice },
    ),
  );
}

async function handleSetupChannelSelect(interaction, client) {
  if (!canUseSetup(interaction)) {
    await interaction.reply(buildAdminError('Voce nao tem permissao para configurar sorteios.')).catch(() => {});
    return;
  }

  const draft = getGiveawayDraft(client, interaction.guildId, interaction.user.id, interaction.channelId);
  const nextDraft = {
    ...draft,
    channelId: interaction.values[0] || null,
  };

  setGiveawayDraft(client, interaction.guildId, interaction.user.id, nextDraft);
  await updateSetupMessage(interaction, client, nextDraft, 'Canal de publicacao atualizado.');
}

async function handleSetupRoleSelect(interaction, client) {
  if (!canUseSetup(interaction)) {
    await interaction.reply(buildAdminError('Voce nao tem permissao para configurar sorteios.')).catch(() => {});
    return;
  }

  const draft = getGiveawayDraft(client, interaction.guildId, interaction.user.id, interaction.channelId);
  const nextDraft = { ...draft };
  const isDetailsEditor = interaction.customId.startsWith('sorteio:setup:details:');

  if (interaction.customId === 'sorteio:setup:required-role') {
    nextDraft.requiredRoleId = interaction.values[0] || null;
  }

  if (interaction.customId === 'sorteio:setup:ping-role') {
    nextDraft.pingRoleId = interaction.values[0] || null;
  }

  if (interaction.customId === 'sorteio:setup:details:required-role') {
    nextDraft.requiredRoleId = interaction.values[0] || null;
  }

  if (interaction.customId === 'sorteio:setup:details:ping-role') {
    nextDraft.pingRoleId = interaction.values[0] || null;
  }

  setGiveawayDraft(client, interaction.guildId, interaction.user.id, nextDraft);
  if (isDetailsEditor) {
    await interaction.update(
      buildGiveawayDetailsEditorMessage(interaction.guild, nextDraft, {
        notice: 'Cargos atualizados.',
      }),
    ).catch(() => {});
    return;
  }

  await updateSetupMessage(interaction, client, nextDraft, 'Cargos atualizados.');
}

async function handleSetupBannerSelect(interaction, client) {
  if (!canUseSetup(interaction)) {
    await interaction.reply(buildAdminError('Voce nao tem permissao para configurar sorteios.')).catch(() => {});
    return;
  }

  const bannerPreset = getBannerPresetById(interaction.values[0]);
  if (!bannerPreset) {
    await interaction.reply(buildAdminError('Banner selecionado invalido.')).catch(() => {});
    return;
  }

  const draft = getGiveawayDraft(client, interaction.guildId, interaction.user.id, interaction.channelId);
  const nextDraft = {
    ...draft,
    bannerUrl: bannerPreset.url,
  };

  setGiveawayDraft(client, interaction.guildId, interaction.user.id, nextDraft);
  await updateSetupMessage(interaction, client, nextDraft, `Banner atualizado para ${bannerPreset.label}.`);
}

async function handleSetupActiveSelect(interaction) {
  if (!canUseSetup(interaction)) {
    await interaction.reply(buildAdminError('Voce nao tem permissao para gerenciar sorteios por este painel.')).catch(() => {});
    return;
  }

  const [giveawayId] = interaction.values;
  const giveaway = getGiveawayRecord(giveawayId);

  if (!giveaway || giveaway.guildId !== interaction.guildId) {
    await interaction.reply(buildAdminError('Nao encontrei esse sorteio ativo.')).catch(() => {});
    return;
  }

  await interaction.reply(
    buildGiveawayAdminDetailsMessage(interaction.guild, giveaway),
  ).catch(() => {});
}

async function handleSetupButton(interaction, client) {
  if (!canUseSetup(interaction)) {
    await interaction.reply(buildAdminError('Voce nao tem permissao para configurar sorteios.')).catch(() => {});
    return;
  }

  const draft = getGiveawayDraft(client, interaction.guildId, interaction.user.id, interaction.channelId);

  if (interaction.customId === 'sorteio:setup:edit') {
    await interaction.showModal(buildGiveawaySetupModal(draft));
    return;
  }

  if (interaction.customId === 'sorteio:setup:edit-form') {
    await interaction.showModal(buildGiveawaySetupModal(draft));
    return;
  }

  if (interaction.customId === 'sorteio:setup:back') {
    await updateSetupMessage(interaction, client, draft, 'Voltando para o painel principal.');
    return;
  }

  if (interaction.customId === 'sorteio:setup:banner-link') {
    await interaction.showModal(buildGiveawayBannerModal(draft));
    return;
  }

  if (interaction.customId === 'sorteio:setup:clear-roles') {
    const nextDraft = {
      ...draft,
      requiredRoleId: null,
      bonusRoleId: null,
      pingRoleId: null,
    };

    setGiveawayDraft(client, interaction.guildId, interaction.user.id, nextDraft);
    await updateSetupMessage(interaction, client, nextDraft, 'Cargos opcionais removidos do rascunho.');
    return;
  }

  if (interaction.customId === 'sorteio:setup:reset') {
    const nextDraft = createDefaultGiveawayDraft(draft.channelId || interaction.channelId);
    setGiveawayDraft(client, interaction.guildId, interaction.user.id, nextDraft);
    await updateSetupMessage(interaction, client, nextDraft, 'Rascunho resetado para os valores padrao.');
    return;
  }

  if (interaction.customId === 'sorteio:setup:sync') {
    await interaction.deferUpdate();
    const syncResult = await syncGuildActiveGiveaways(client, interaction.guildId).catch(() => ({
      total: 0,
      updated: 0,
    }));

    await interaction.editReply(
      buildGiveawaySetupMessage(
        interaction.guild,
        draft,
        listActiveGiveaways(interaction.guildId),
        { notice: `Sincronizacao concluida: ${syncResult.updated}/${syncResult.total} sorteio(s) atualizado(s).` },
      ),
    ).catch(() => {});
    return;
  }

  if (interaction.customId !== 'sorteio:setup:publish') return;

  if (!draft.prize?.trim()) {
    await updateSetupMessage(interaction, client, draft, 'Defina o premio no modal antes de publicar.');
    return;
  }

  if (!draft.channelId) {
    await updateSetupMessage(interaction, client, draft, 'Selecione o canal de publicacao antes de publicar.');
    return;
  }

  await interaction.deferUpdate();

  const targetChannel = interaction.guild.channels.cache.get(draft.channelId)
    || await interaction.guild.channels.fetch(draft.channelId).catch(() => null);
  const botMember = interaction.guild.members.me;
  const channelPermissions = targetChannel?.permissionsFor(botMember);

  if (!targetChannel?.isTextBased()) {
    await interaction.editReply(
      buildGiveawaySetupMessage(
        interaction.guild,
        draft,
        listActiveGiveaways(interaction.guildId),
        { notice: 'O canal selecionado nao e um canal de texto valido.' },
      ),
    ).catch(() => {});
    return;
  }

  if (!channelPermissions?.has(PermissionFlagsBits.ViewChannel) || !channelPermissions?.has(PermissionFlagsBits.SendMessages)) {
    await interaction.editReply(
      buildGiveawaySetupMessage(
        interaction.guild,
        draft,
        listActiveGiveaways(interaction.guildId),
        { notice: `Nao consigo acessar e enviar mensagens em <#${targetChannel.id}>.` },
      ),
    ).catch(() => {});
    return;
  }

  const giveawayId = reserveGiveawayId(interaction.guildId);
  const createdAt = new Date();
  const giveawayRecord = {
    id: giveawayId,
    guildId: interaction.guildId,
    channelId: targetChannel.id,
    messageId: null,
    hostId: interaction.user.id,
    prize: String(draft.prize || '').trim(),
    bannerUrl: String(draft.bannerUrl || '').trim(),
    durationText: draft.durationText,
    durationMs: draft.durationMs,
    winnerCount: draft.winnerCount,
    bonusEntries: 0,
    requiredRoleId: draft.requiredRoleId || null,
    bonusRoleId: null,
    pingRoleId: draft.pingRoleId || null,
    participants: {},
    winnerIds: [],
    status: STATUS.ACTIVE,
    createdAt: createdAt.toISOString(),
    endsAt: new Date(createdAt.getTime() + Number(draft.durationMs || 0)).toISOString(),
    rerollCount: 0,
  };

  const giveawayMessage = await targetChannel.send(
    buildGiveawayMessage(interaction.guild, giveawayRecord, { publish: true }),
  ).catch(() => null);

  if (!giveawayMessage) {
    await interaction.editReply(
      buildGiveawaySetupMessage(
        interaction.guild,
        draft,
        listActiveGiveaways(interaction.guildId),
        { notice: 'Nao consegui publicar o sorteio agora. Verifique minhas permissoes e tente novamente.' },
      ),
    ).catch(() => {});
    return;
  }

  saveGiveawayRecord({
    ...giveawayRecord,
    messageId: giveawayMessage.id,
  });

  const nextDraft = createDefaultGiveawayDraft(draft.channelId || interaction.channelId);
  setGiveawayDraft(client, interaction.guildId, interaction.user.id, nextDraft);

  await interaction.editReply(
    buildGiveawaySetupMessage(
      interaction.guild,
      nextDraft,
      listActiveGiveaways(interaction.guildId),
      { notice: `Sorteio ${formatGiveawayCode(giveawayId)} publicado com sucesso em <#${targetChannel.id}>.` },
    ),
  ).catch(() => {});
}

async function handleSetupModal(interaction, client) {
  if (!canUseSetup(interaction)) {
    await interaction.reply(buildAdminError('Voce nao tem permissao para configurar sorteios.')).catch(() => {});
    return;
  }

  const currentDraft = getGiveawayDraft(client, interaction.guildId, interaction.user.id, interaction.channelId);
  const prize = String(interaction.fields.getTextInputValue('sorteio_prize') || '').trim();
  const durationResult = parseDurationInput(interaction.fields.getTextInputValue('sorteio_duration'));
  const winnersResult = parseIntegerInput(interaction.fields.getTextInputValue('sorteio_winners'), {
    min: 1,
    max: 20,
    label: 'ganhadores',
  });

  if (!prize) {
    await interaction.reply(buildAdminError('O premio nao pode ficar vazio.')).catch(() => {});
    return;
  }

  if (!durationResult.ok) {
    await interaction.reply(buildAdminError(durationResult.error)).catch(() => {});
    return;
  }

  if (!winnersResult.ok) {
    await interaction.reply(buildAdminError(winnersResult.error)).catch(() => {});
    return;
  }

  const nextDraft = {
    ...currentDraft,
    prize,
    durationText: durationResult.normalizedText,
    durationMs: durationResult.durationMs,
    winnerCount: winnersResult.value,
    requiredRoleId: getOptionalSelectedRoleId(interaction.fields, 'sorteio_required_role', currentDraft.requiredRoleId || null),
    pingRoleId: getOptionalSelectedRoleId(interaction.fields, 'sorteio_ping_role', currentDraft.pingRoleId || null),
  };

  setGiveawayDraft(client, interaction.guildId, interaction.user.id, nextDraft);

  await interaction.reply({
    ...buildGiveawayDetailsEditorMessage(
      interaction.guild,
      nextDraft,
      { notice: 'Rascunho atualizado com sucesso.' },
    ),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  }).catch(() => {});
}

async function handleBannerModal(interaction, client) {
  if (!canUseSetup(interaction)) {
    await interaction.reply(buildAdminError('Voce nao tem permissao para configurar sorteios.')).catch(() => {});
    return;
  }

  const currentDraft = getGiveawayDraft(client, interaction.guildId, interaction.user.id, interaction.channelId);
  const bannerUrlValue = normalizeBannerUrl(interaction.fields.getTextInputValue('sorteio_banner_url'));

  if (bannerUrlValue === null) {
    await interaction.reply(buildAdminError('O banner precisa ser uma URL valida com http ou https.')).catch(() => {});
    return;
  }

  const nextDraft = {
    ...currentDraft,
    bannerUrl: bannerUrlValue || '',
  };

  setGiveawayDraft(client, interaction.guildId, interaction.user.id, nextDraft);

  await interaction.reply({
    ...buildGiveawayDetailsEditorMessage(
      interaction.guild,
      nextDraft,
      { notice: nextDraft.bannerUrl ? 'Banner personalizado atualizado.' : 'Banner removido do rascunho.' },
    ),
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  }).catch(() => {});
}

async function handleJoin(interaction) {
  const giveaway = getGiveawayRecord(interaction.customId.split(':')[2]);
  if (!giveaway || giveaway.guildId !== interaction.guildId) {
    await interaction.reply(buildAdminError('Esse sorteio nao foi encontrado.')).catch(() => {});
    return;
  }

  if (giveaway.status !== STATUS.ACTIVE) {
    await interaction.reply(buildAdminError('Esse sorteio ja foi encerrado ou cancelado.')).catch(() => {});
    return;
  }

  await interaction.deferUpdate().catch(() => {});

  const existingEntry = getParticipant(giveaway, interaction.user.id);
  if (existingEntry) {
    removeParticipantFromGiveaway(giveaway.id, interaction.user.id, giveaway);
    await syncGiveawayMessage(interaction.client, giveaway.id).catch(() => {});

    await interaction.followUp(
      buildAdminSuccess(`Sua participacao em ${formatGiveawayCode(giveaway.id)} foi removida.`),
    ).catch(() => {});
    return;
  }

  if (!hasRequiredRole(interaction.member, giveaway.requiredRoleId)) {
    await interaction.followUp(buildAdminError('Voce nao possui o cargo necessario para participar deste sorteio.')).catch(() => {});
    return;
  }

  addParticipantToGiveaway(giveaway.id, interaction.member, giveaway);
  await syncGiveawayMessage(interaction.client, giveaway.id).catch(() => {});

  await interaction.followUp(
    buildAdminSuccess('Voce entrou no sorteio com sucesso.'),
  ).catch(() => {});
}

async function handleLeave(interaction) {
  const giveaway = getGiveawayRecord(interaction.customId.split(':')[2]);
  if (!giveaway || giveaway.guildId !== interaction.guildId) {
    await interaction.reply(buildAdminError('Esse sorteio nao foi encontrado.')).catch(() => {});
    return;
  }

  if (giveaway.status !== STATUS.ACTIVE) {
    await interaction.reply(buildAdminError('Esse sorteio ja nao aceita novas alteracoes.')).catch(() => {});
    return;
  }

  if (!getParticipant(giveaway, interaction.user.id)) {
    await interaction.reply(buildAdminError('Voce nao esta participando desse sorteio.')).catch(() => {});
    return;
  }

  await interaction.deferUpdate().catch(() => {});

  removeParticipantFromGiveaway(giveaway.id, interaction.user.id, giveaway);
  await syncGiveawayMessage(interaction.client, giveaway.id).catch(() => {});

  await interaction.followUp(
    buildAdminSuccess(`Sua participacao em ${formatGiveawayCode(giveaway.id)} foi removida.`),
  ).catch(() => {});
}

async function handleStatus(interaction) {
  const giveaway = getGiveawayRecord(interaction.customId.split(':')[2]);
  if (!giveaway || giveaway.guildId !== interaction.guildId) {
    await interaction.reply(buildAdminError('Esse sorteio nao foi encontrado.')).catch(() => {});
    return;
  }

  await interaction.reply(
    buildGiveawayStatusMessage(giveaway, interaction.user.id),
  ).catch(() => {});
}

async function handleParticipantList(interaction) {
  const giveaway = getGiveawayRecord(interaction.customId.split(':')[2]);
  if (!giveaway || giveaway.guildId !== interaction.guildId) {
    await interaction.reply(buildAdminError('Esse sorteio nao foi encontrado.')).catch(() => {});
    return;
  }

  await interaction.reply(
    buildGiveawayParticipantsMessage(giveaway),
  ).catch(() => {});
}

async function handleManageButton(interaction) {
  const [, , action, giveawayId] = interaction.customId.split(':');
  const giveaway = getGiveawayRecord(giveawayId);

  if (!giveaway || giveaway.guildId !== interaction.guildId) {
    await interaction.reply(buildAdminError('Nao encontrei esse sorteio para gerenciamento.')).catch(() => {});
    return;
  }

  if (!canManageGiveaway(interaction, giveaway)) {
    await interaction.reply(buildAdminError('Voce nao pode gerenciar este sorteio.')).catch(() => {});
    return;
  }

  await interaction.deferUpdate();

  if (action === 'refresh') {
    await syncGiveawayMessage(interaction.client, giveaway.id).catch(() => {});
  }

  if (action === 'end') {
    await endGiveaway(interaction.client, giveaway.id, {
      actorId: interaction.user.id,
    }).catch(() => {});
  }

  if (action === 'reroll') {
    await rerollGiveaway(interaction.client, giveaway.id, {
      actorId: interaction.user.id,
    }).catch(() => {});
  }

  if (action === 'cancel') {
    await cancelGiveaway(interaction.client, giveaway.id, {
      actorId: interaction.user.id,
    }).catch(() => {});
  }

  const refreshedGiveaway = getGiveawayRecord(giveaway.id);
  if (!refreshedGiveaway) {
    await interaction.editReply(buildAdminError('O sorteio nao esta mais disponivel.')).catch(() => {});
    return;
  }

  await interaction.editReply(
    buildGiveawayAdminDetailsMessage(interaction.guild, refreshedGiveaway),
  ).catch(() => {});
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.inGuild()) return;

    if (interaction.isChannelSelectMenu() && interaction.customId === 'sorteio:setup:channel') {
      await handleSetupChannelSelect(interaction, client);
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId.startsWith('sorteio:setup:')) {
      await handleSetupRoleSelect(interaction, client);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'sorteio:setup:banner') {
      await handleSetupBannerSelect(interaction, client);
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'sorteio:setup:active-select') {
      await handleSetupActiveSelect(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('sorteio:setup:')) {
        await handleSetupButton(interaction, client);
        return;
      }

      if (interaction.customId.startsWith('sorteio:join:')) {
        await handleJoin(interaction);
        return;
      }

      if (interaction.customId.startsWith('sorteio:leave:')) {
        await handleLeave(interaction);
        return;
      }

      if (interaction.customId.startsWith('sorteio:status:')) {
        await handleStatus(interaction);
        return;
      }

      if (interaction.customId.startsWith('sorteio:list:')) {
        await handleParticipantList(interaction);
        return;
      }

      if (interaction.customId.startsWith('sorteio:manage:')) {
        await handleManageButton(interaction);
      }

      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'sorteio:setup:modal') {
      await handleSetupModal(interaction, client);
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'sorteio:setup:banner-modal') {
      await handleBannerModal(interaction, client);
    }
  },
};
