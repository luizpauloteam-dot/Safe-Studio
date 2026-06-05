const fs = require('fs');
const path = require('path');
const {
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const DATA_DIR = path.join(__dirname, '..', 'data', 'selfbot');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const DEFAULT_MONITORED_CHANNEL_ID = '1511818211233108019';
const DEFAULT_LOG_CHANNEL_ID = '1512569280833523753';
const DEFAULT_RESTRICTED_ROLE_ID = '1512569373506670703';
const DEFAULT_TIMEOUT_MINUTES = 7 * 24 * 60;
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60;
const VALID_ACTIONS = new Set(['timeout', 'kick', 'ban']);
const ROLE_REMOVAL_CHECK_MS = 60 * 1000;
const WARNING_CONTENT = [
  '# \u26a0\ufe0f **Any message sent in this channel will automatically result in punishment.**',
  '> This system was created to identify compromised accounts flooding malicious links, images, and automated content, helping prevent spam from spreading across the server.',
].join('\n');

const PERMISSION_LABELS = new Map([
  [PermissionFlagsBits.ViewChannel, 'Ver canal'],
  [PermissionFlagsBits.SendMessages, 'Enviar mensagens'],
  [PermissionFlagsBits.ManageMessages, 'Gerenciar mensagens'],
  [PermissionFlagsBits.ModerateMembers, 'Moderar membros'],
  [PermissionFlagsBits.KickMembers, 'Expulsar membros'],
  [PermissionFlagsBits.BanMembers, 'Banir membros'],
  [PermissionFlagsBits.ManageRoles, 'Gerenciar cargos'],
]);

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ guilds: {}, roleRemovals: {} }, null, 2));
  }
}

function normalizeState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return { guilds: {}, roleRemovals: {} };
  }

  if (!state.guilds || typeof state.guilds !== 'object' || Array.isArray(state.guilds)) {
    state.guilds = {};
  }

  if (!state.roleRemovals || typeof state.roleRemovals !== 'object' || Array.isArray(state.roleRemovals)) {
    state.roleRemovals = {};
  }

  return state;
}

function readState() {
  ensureStore();

  try {
    return normalizeState(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')));
  } catch (error) {
    return { guilds: {}, roleRemovals: {} };
  }
}

function writeState(state) {
  ensureStore();
  fs.writeFileSync(STATE_FILE, JSON.stringify(normalizeState(state), null, 2));
}

function normalizeSelfBotAction(action) {
  const normalized = String(action || 'timeout').toLowerCase();
  return VALID_ACTIONS.has(normalized) ? normalized : 'timeout';
}

function normalizeTimeoutMinutes(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MINUTES;
  return Math.min(MAX_TIMEOUT_MINUTES, Math.max(1, parsed));
}

function normalizeDiscordId(value) {
  const normalized = String(value || '').trim();
  return /^\d{17,20}$/.test(normalized) ? normalized : '';
}

function normalizeSelfBotConfig(config, guildId = null) {
  if (!config || typeof config !== 'object') return null;

  return {
    enabled: Boolean(config.enabled),
    channelId: normalizeDiscordId(config.channelId),
    logChannelId: normalizeDiscordId(config.logChannelId),
    restrictedRoleId: normalizeDiscordId(config.restrictedRoleId),
    action: normalizeSelfBotAction(config.action),
    timeoutMinutes: normalizeTimeoutMinutes(config.timeoutMinutes),
    warningMessageId: normalizeDiscordId(config.warningMessageId),
    updatedAt: config.updatedAt || null,
    updatedBy: config.updatedBy || null,
    isDefaultConfig: Boolean(config.isDefaultConfig),
    guildId,
  };
}

function getDefaultSelfBotConfig(guildId) {
  return {
    enabled: true,
    channelId: DEFAULT_MONITORED_CHANNEL_ID,
    logChannelId: DEFAULT_LOG_CHANNEL_ID,
    restrictedRoleId: DEFAULT_RESTRICTED_ROLE_ID,
    action: 'timeout',
    timeoutMinutes: DEFAULT_TIMEOUT_MINUTES,
    warningMessageId: '',
    updatedAt: null,
    updatedBy: null,
    isDefaultConfig: true,
    guildId,
  };
}

function getGuildSelfBotConfig(guildId) {
  const state = readState();
  const config = state.guilds?.[guildId];

  if (config && typeof config === 'object') {
    return normalizeSelfBotConfig(config, guildId);
  }

  return getDefaultSelfBotConfig(guildId);
}

function setGuildSelfBotConfig(guildId, config) {
  const state = readState();
  const current = state.guilds[guildId] || {};

  state.guilds[guildId] = {
    ...current,
    enabled: true,
    channelId: normalizeDiscordId(config.channelId || current.channelId || DEFAULT_MONITORED_CHANNEL_ID),
    logChannelId: config.logChannelId === undefined
      ? normalizeDiscordId(current.logChannelId || DEFAULT_LOG_CHANNEL_ID)
      : normalizeDiscordId(config.logChannelId),
    restrictedRoleId: config.restrictedRoleId === undefined
      ? normalizeDiscordId(current.restrictedRoleId || DEFAULT_RESTRICTED_ROLE_ID)
      : normalizeDiscordId(config.restrictedRoleId),
    action: normalizeSelfBotAction(config.action || current.action || 'timeout'),
    timeoutMinutes: normalizeTimeoutMinutes(config.timeoutMinutes || current.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES),
    warningMessageId: normalizeDiscordId(config.warningMessageId || current.warningMessageId),
    updatedAt: new Date().toISOString(),
    updatedBy: config.updatedBy || current.updatedBy || null,
  };

  writeState(state);
  return getGuildSelfBotConfig(guildId);
}

function disableGuildSelfBotConfig(guildId, updatedBy = null) {
  const state = readState();
  const current = state.guilds[guildId] || {};

  state.guilds[guildId] = {
    ...current,
    enabled: false,
    channelId: normalizeDiscordId(current.channelId || DEFAULT_MONITORED_CHANNEL_ID),
    logChannelId: normalizeDiscordId(current.logChannelId || DEFAULT_LOG_CHANNEL_ID),
    restrictedRoleId: normalizeDiscordId(current.restrictedRoleId || DEFAULT_RESTRICTED_ROLE_ID),
    action: normalizeSelfBotAction(current.action || 'timeout'),
    timeoutMinutes: normalizeTimeoutMinutes(current.timeoutMinutes || DEFAULT_TIMEOUT_MINUTES),
    updatedAt: new Date().toISOString(),
    updatedBy,
  };

  writeState(state);
  return getGuildSelfBotConfig(guildId);
}

function buildSelfBotWarningPayload() {
  return {
    content: WARNING_CONTENT,
    allowedMentions: {
      parse: [],
    },
  };
}

async function publishSelfBotWarning(channel) {
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
    throw new Error('Canal invalido para publicar o aviso anti self-bot.');
  }

  return channel.send(buildSelfBotWarningPayload());
}

function truncateText(value, maxLength = 1024) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function safeCodeBlock(value, maxLength = 900) {
  const text = truncateText(value || 'Sem texto.', maxLength).replace(/```/g, "'''");
  return `\`\`\`\n${text}\n\`\`\``;
}

function formatDuration(minutes) {
  const normalized = normalizeTimeoutMinutes(minutes);
  const days = Math.floor(normalized / (24 * 60));
  const hours = Math.floor((normalized % (24 * 60)) / 60);
  const mins = normalized % 60;
  const parts = [];

  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (mins || !parts.length) parts.push(`${mins}m`);

  return parts.join(' ');
}

function formatPunishment(config) {
  const action = normalizeSelfBotAction(config?.action);

  if (action === 'kick') return 'Expulsao';
  if (action === 'ban') return 'Banimento';
  return `Timeout por ${formatDuration(config?.timeoutMinutes)}`;
}

function getActionPermission(action) {
  const normalized = normalizeSelfBotAction(action);

  if (normalized === 'kick') return PermissionFlagsBits.KickMembers;
  if (normalized === 'ban') return PermissionFlagsBits.BanMembers;
  return PermissionFlagsBits.ModerateMembers;
}

function formatPermissionLabel(permissionBit) {
  return PERMISSION_LABELS.get(permissionBit) || String(permissionBit);
}

async function resolveBotMember(guild) {
  if (guild.members.me) return guild.members.me;
  return guild.members.fetch(guild.client.user.id).catch(() => null);
}

function canBotManageRole(botMember, role) {
  if (!botMember || !role) return false;
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return false;
  return botMember.roles.highest.comparePositionTo(role) > 0;
}

async function getMissingSelfBotSetupPermissions(guild, channel, action, restrictedRoleId = '') {
  const botMember = await resolveBotMember(guild);
  if (!botMember) return ['Identificar o membro do bot'];

  const missing = [];
  const channelPermissions = channel.permissionsFor(botMember);
  const requiredChannelPermissions = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageMessages,
  ];

  for (const permission of requiredChannelPermissions) {
    if (!channelPermissions?.has(permission)) {
      missing.push(formatPermissionLabel(permission));
    }
  }

  const actionPermission = getActionPermission(action);
  if (!botMember.permissions.has(actionPermission)) {
    missing.push(formatPermissionLabel(actionPermission));
  }

  const roleId = normalizeDiscordId(restrictedRoleId);
  if (roleId) {
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      missing.push(formatPermissionLabel(PermissionFlagsBits.ManageRoles));
    }

    const role = guild.roles.cache.get(roleId)
      || await guild.roles.fetch(roleId).catch(() => null);

    if (!role) {
      missing.push('Encontrar o cargo de castigo');
    } else if (!canBotManageRole(botMember, role)) {
      missing.push('Cargo do bot acima do cargo de castigo');
    }
  }

  return missing;
}

function createMessageSnapshot(message) {
  return {
    id: message.id,
    guildId: message.guildId,
    channelId: message.channelId,
    authorId: message.author.id,
    authorTag: message.author.tag,
    content: message.content || '',
    createdAt: message.createdAt?.toISOString?.() || new Date().toISOString(),
    attachments: Array.from(message.attachments.values()).map((attachment) => ({
      name: attachment.name || 'arquivo',
      url: attachment.url,
      contentType: attachment.contentType || '',
    })),
  };
}

async function deleteTrapMessage(message) {
  try {
    if (!message.deletable) {
      return {
        ok: false,
        label: 'A mensagem nao podia ser apagada pelo bot.',
      };
    }

    await message.delete();
    return {
      ok: true,
      label: 'Mensagem apagada.',
    };
  } catch (error) {
    return {
      ok: false,
      label: `Falha ao apagar mensagem: ${error.message}`,
    };
  }
}

async function resolveMessageMember(message) {
  if (message.member) return message.member;
  return message.guild.members.fetch(message.author.id).catch(() => null);
}

function buildAuditReason(message) {
  return truncateText(
    `Mensagem enviada no canal anti self-bot por ${message.author.tag} (${message.author.id}).`,
    512,
  );
}

function makeRoleRemovalKey(guildId, userId, roleId) {
  return `${guildId}:${userId}:${roleId}`;
}

function scheduleRoleRemoval({ guildId, userId, roleId, removeAt, sourceMessageId }) {
  const normalizedRoleId = normalizeDiscordId(roleId);
  if (!guildId || !userId || !normalizedRoleId || !removeAt) return null;

  const state = readState();
  const key = makeRoleRemovalKey(guildId, userId, normalizedRoleId);

  state.roleRemovals[key] = {
    guildId,
    userId,
    roleId: normalizedRoleId,
    removeAt: new Date(removeAt).toISOString(),
    sourceMessageId: sourceMessageId || null,
    status: 'pending',
    createdAt: new Date().toISOString(),
    completedAt: null,
    lastError: null,
  };

  writeState(state);
  return state.roleRemovals[key];
}

function updateRoleRemovalEntry(key, updates) {
  const state = readState();
  const entry = state.roleRemovals?.[key];
  if (!entry) return null;

  state.roleRemovals[key] = {
    ...entry,
    ...updates,
  };

  writeState(state);
  return state.roleRemovals[key];
}

function formatDiscordTimestamp(dateValue) {
  const timestamp = Math.floor(new Date(dateValue).getTime() / 1000);
  if (!Number.isFinite(timestamp)) return 'data invalida';
  return `<t:${timestamp}:F>`;
}

async function applyTemporaryRestrictedRole(member, config, message) {
  const roleId = normalizeDiscordId(config.restrictedRoleId);
  if (!roleId) {
    return {
      ok: true,
      roleId: '',
      label: '',
    };
  }

  const role = member.guild.roles.cache.get(roleId)
    || await member.guild.roles.fetch(roleId).catch(() => null);

  if (!role) {
    return {
      ok: false,
      roleId,
      label: `Cargo de castigo <@&${roleId}> nao encontrado.`,
    };
  }

  const botMember = await resolveBotMember(member.guild);
  if (!canBotManageRole(botMember, role)) {
    return {
      ok: false,
      roleId,
      label: `Nao tenho permissao/hierarquia para aplicar o cargo <@&${roleId}>.`,
    };
  }

  const removeAt = new Date(Date.now() + (normalizeTimeoutMinutes(config.timeoutMinutes) * 60 * 1000));
  const reason = buildAuditReason(message);

  try {
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId, reason);
    }

    scheduleRoleRemoval({
      guildId: member.guild.id,
      userId: member.id,
      roleId,
      removeAt,
      sourceMessageId: message.id,
    });

    return {
      ok: true,
      roleId,
      removeAt: removeAt.toISOString(),
      label: `Cargo <@&${roleId}> aplicado ate ${formatDiscordTimestamp(removeAt)}.`,
    };
  } catch (error) {
    return {
      ok: false,
      roleId,
      label: `Falha ao aplicar cargo <@&${roleId}>: ${error.message}`,
    };
  }
}

async function punishTrapAuthor(message, config) {
  const member = await resolveMessageMember(message);

  if (!member) {
    return {
      ok: false,
      action: normalizeSelfBotAction(config.action),
      label: 'Membro nao encontrado para aplicar punicao.',
    };
  }

  if (member.id === message.guild.ownerId) {
    return {
      ok: false,
      action: normalizeSelfBotAction(config.action),
      label: 'O dono do servidor nao pode ser punido pelo bot.',
    };
  }

  const action = normalizeSelfBotAction(config.action);
  const reason = buildAuditReason(message);

  try {
    if (action === 'kick') {
      if (!member.kickable) {
        return {
          ok: false,
          action,
          label: 'O bot nao tem hierarquia/permissao para expulsar esse membro.',
        };
      }

      await member.kick(reason);
      return {
        ok: true,
        action,
        label: 'Membro expulso.',
      };
    }

    if (action === 'ban') {
      if (!member.bannable) {
        return {
          ok: false,
          action,
          label: 'O bot nao tem hierarquia/permissao para banir esse membro.',
        };
      }

      await member.ban({
        reason,
        deleteMessageSeconds: 60 * 60,
      });

      return {
        ok: true,
        action,
        label: 'Membro banido.',
      };
    }

    if (!member.moderatable) {
      return {
        ok: false,
        action,
        label: 'O bot nao tem hierarquia/permissao para aplicar timeout nesse membro.',
      };
    }

    const timeoutMinutes = normalizeTimeoutMinutes(config.timeoutMinutes);
    await member.timeout(timeoutMinutes * 60 * 1000, reason);
    const roleResult = await applyTemporaryRestrictedRole(member, config, message);

    return {
      ok: roleResult.ok,
      action,
      roleResult,
      label: [
        `Timeout aplicado por ${formatDuration(timeoutMinutes)}.`,
        roleResult.label,
      ].filter(Boolean).join('\n'),
    };
  } catch (error) {
    return {
      ok: false,
      action,
      label: `Falha ao aplicar punicao: ${error.message}`,
    };
  }
}

async function sendSelfBotTrapLog(client, config, snapshot, deleteResult, punishmentResult) {
  if (!config.logChannelId) return;

  const logChannel = client.channels.cache.get(config.logChannelId)
    || await client.channels.fetch(config.logChannelId).catch(() => null);

  if (!logChannel?.isTextBased?.()) return;

  const attachmentList = snapshot.attachments.length
    ? snapshot.attachments
      .map((attachment) => `${attachment.name}: ${attachment.url}`)
      .join('\n')
    : 'Nenhum anexo.';

  const embed = new EmbedBuilder()
    .setColor(punishmentResult.ok ? 0xe74c3c : 0xf1c40f)
    .setTitle('Anti self-bot acionado')
    .setDescription(`Uma mensagem foi enviada no canal protegido <#${snapshot.channelId}>.`)
    .addFields(
      {
        name: 'Usuario',
        value: `${snapshot.authorTag}\nID: ${snapshot.authorId}`,
        inline: true,
      },
      {
        name: 'Punicao configurada',
        value: formatPunishment(config),
        inline: true,
      },
      {
        name: 'Resultado',
        value: [
          deleteResult.label,
          punishmentResult.label,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Conteudo apagado',
        value: safeCodeBlock(snapshot.content),
        inline: false,
      },
      {
        name: 'Anexos',
        value: truncateText(attachmentList, 1024),
        inline: false,
      },
    )
    .setTimestamp(new Date(snapshot.createdAt));

  await logChannel.send({
    embeds: [embed],
    allowedMentions: {
      parse: [],
    },
  }).catch((error) => {
    console.warn('[selfbot] Falha ao enviar log anti self-bot:', error.message);
  });
}

async function sendSelfBotRoleRemovalLog(client, config, entry, resultLabel, ok) {
  if (!config?.logChannelId) return;

  const logChannel = client.channels.cache.get(config.logChannelId)
    || await client.channels.fetch(config.logChannelId).catch(() => null);

  if (!logChannel?.isTextBased?.()) return;

  const embed = new EmbedBuilder()
    .setColor(ok ? 0x2ecc71 : 0xf1c40f)
    .setTitle('Cargo de castigo removido')
    .setDescription(resultLabel)
    .addFields(
      {
        name: 'Usuario',
        value: `<@${entry.userId}>\nID: ${entry.userId}`,
        inline: true,
      },
      {
        name: 'Cargo',
        value: `<@&${entry.roleId}>\nID: ${entry.roleId}`,
        inline: true,
      },
      {
        name: 'Vencimento',
        value: formatDiscordTimestamp(entry.removeAt),
        inline: false,
      },
    )
    .setTimestamp(new Date());

  await logChannel.send({
    embeds: [embed],
    allowedMentions: {
      parse: [],
    },
  }).catch((error) => {
    console.warn('[selfbot] Falha ao enviar log de remocao de cargo:', error.message);
  });
}

async function processRoleRemovalEntry(client, key, entry) {
  const guild = client.guilds.cache.get(entry.guildId)
    || await client.guilds.fetch(entry.guildId).catch(() => null);

  if (!guild) {
    updateRoleRemovalEntry(key, {
      lastError: 'Servidor nao encontrado no cache/API.',
    });
    return;
  }

  const config = getGuildSelfBotConfig(entry.guildId);
  const member = guild.members.cache.get(entry.userId)
    || await guild.members.fetch(entry.userId).catch(() => null);

  if (!member) {
    const updated = updateRoleRemovalEntry(key, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      lastError: 'Membro nao encontrado. Provavelmente saiu do servidor.',
    });

    await sendSelfBotRoleRemovalLog(
      client,
      config,
      updated || entry,
      'O cargo nao precisou ser removido porque o membro nao foi encontrado no servidor.',
      true,
    );
    return;
  }

  if (!member.roles.cache.has(entry.roleId)) {
    const updated = updateRoleRemovalEntry(key, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      lastError: null,
    });

    await sendSelfBotRoleRemovalLog(
      client,
      config,
      updated || entry,
      'O membro ja nao tinha mais o cargo de castigo.',
      true,
    );
    return;
  }

  const role = guild.roles.cache.get(entry.roleId)
    || await guild.roles.fetch(entry.roleId).catch(() => null);
  const botMember = await resolveBotMember(guild);

  if (!role || !canBotManageRole(botMember, role)) {
    updateRoleRemovalEntry(key, {
      lastError: 'Nao consegui remover: cargo inexistente ou acima do cargo do bot.',
    });

    await sendSelfBotRoleRemovalLog(
      client,
      config,
      entry,
      'Nao consegui remover o cargo de castigo. Verifique a hierarquia e a permissao Gerenciar cargos.',
      false,
    );
    return;
  }

  try {
    await member.roles.remove(entry.roleId, 'Fim do castigo anti self-bot.');
    const updated = updateRoleRemovalEntry(key, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      lastError: null,
    });

    await sendSelfBotRoleRemovalLog(
      client,
      config,
      updated || entry,
      'O prazo do castigo acabou e o cargo foi removido automaticamente.',
      true,
    );
  } catch (error) {
    updateRoleRemovalEntry(key, {
      lastError: error.message,
    });

    await sendSelfBotRoleRemovalLog(
      client,
      config,
      entry,
      `Falha ao remover o cargo de castigo: ${error.message}`,
      false,
    );
  }
}

async function processDueSelfBotRoleRemovals(client) {
  const state = readState();
  const now = Date.now();
  const dueEntries = Object.entries(state.roleRemovals || {})
    .filter(([, entry]) => {
      if (!entry || entry.status !== 'pending') return false;
      const removeAt = new Date(entry.removeAt).getTime();
      return Number.isFinite(removeAt) && removeAt <= now;
    });

  for (const [key, entry] of dueEntries) {
    await processRoleRemovalEntry(client, key, entry);
  }
}

function startSelfBotRoleRemovalScheduler(client) {
  if (client.selfBotRoleRemovalInterval) return;

  void processDueSelfBotRoleRemovals(client).catch((error) => {
    console.error('[selfbot] Falha ao processar remocoes pendentes de cargo:', error);
  });

  client.selfBotRoleRemovalInterval = setInterval(() => {
    void processDueSelfBotRoleRemovals(client).catch((error) => {
      console.error('[selfbot] Falha ao processar remocoes pendentes de cargo:', error);
    });
  }, ROLE_REMOVAL_CHECK_MS);
}

async function handleSelfBotTrapMessage(message, client) {
  if (!message.guildId || !message.guild || message.author.bot) return false;
  if (message.webhookId) return false;

  const config = getGuildSelfBotConfig(message.guildId);
  if (!config?.enabled || !config.channelId) return false;
  if (message.channelId !== config.channelId) return false;

  const snapshot = createMessageSnapshot(message);
  const deleteResult = await deleteTrapMessage(message);
  const punishmentResult = await punishTrapAuthor(message, config);

  await sendSelfBotTrapLog(client, config, snapshot, deleteResult, punishmentResult);

  return true;
}

module.exports = {
  buildSelfBotWarningPayload,
  disableGuildSelfBotConfig,
  formatPunishment,
  getGuildSelfBotConfig,
  getMissingSelfBotSetupPermissions,
  handleSelfBotTrapMessage,
  normalizeSelfBotAction,
  normalizeTimeoutMinutes,
  publishSelfBotWarning,
  setGuildSelfBotConfig,
  startSelfBotRoleRemovalScheduler,
};
