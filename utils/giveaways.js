const fs = require('fs');
const path = require('path');
const { randomInt } = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  SectionBuilder,
  SeparatorBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder,
} = require('discord.js');
const appConfig = require('../config');
const { createGiveawayWinnerTicket } = require('./tickets');

const DATA_DIR = path.join(__dirname, '..', 'data', 'giveaways');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const DEFAULT_GIVEAWAY_BANNER_URL = process.env.TICKET_BANNER_URL || process.env.WELCOME_BANNER_URL || '';
const GIVEAWAY_BANNER_URL = process.env.GIVEAWAY_BANNER_URL || DEFAULT_GIVEAWAY_BANNER_URL;
const GIVEAWAY_BANNER_PRESETS = [
  {
    id: 'none',
    label: 'Sem banner',
    description: 'Publica o sorteio sem banner',
    url: '',
  },
  {
    id: 'discord_safe',
    label: 'discord.gg/safe',
    description: 'Faixa animada do convite',
    url: 'https://cdn.discordapp.com/attachments/1467872651610427596/1479898329583452160/faixa.gif?ex=69c4c878&is=69c376f8&hm=af4448211e0193b2b325a7ac925b02890d5c625165909177c96572605f3907c7&',
  },
  {
    id: 'arrow',
    label: 'Arrow',
    description: 'Arte REDM Arrow',
    url: 'https://cdn.discordapp.com/attachments/1473339280633102623/1479914978839363685/REDM_Thum_02.jpg.jpeg?ex=69c4d7fa&is=69c3867a&hm=a8ede06b29aa01be0c7b9bcb6f2687aebba83dbc2f2d5a0375ba16710005307f&',
  },
  {
    id: 'safe_banner',
    label: 'Safe banner',
    description: 'Banner padrao da Safe Studio',
    url: 'https://cdn.discordapp.com/attachments/1473339280633102623/1478575644647362660/banner.png?ex=69c53ea0&is=69c3ed20&hm=63d6a40bf936c39178eac5fb85b239a4ca890a8dd76c5ae3e4ab01d270bd8309&',
  },
];
const DEFAULT_DURATION_MS = 60 * 60 * 1000;
const DEFAULT_WINNER_COUNT = 1;
const DEFAULT_BONUS_ENTRIES = 2;
const MAX_ACTIVE_OPTIONS = 25;
const MAX_LISTED_PARTICIPANTS = 20;
const STATUS = {
  ACTIVE: 'active',
  ENDED: 'ended',
  CANCELLED: 'cancelled',
};
const COLORS = {
  active: 0x5865f2,
  ended: 0xffc857,
  cancelled: 0xe15a5a,
  panel: 0x1f2937,
  info: 0x3b82f6,
};

function ensureGiveawayStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ counters: {}, giveaways: {} }, null, 2));
  }
}

function readJson(filePath, fallback) {
  ensureGiveawayStore();

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureGiveawayStore();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function loadGiveawayState() {
  return readJson(STATE_FILE, { counters: {}, giveaways: {} });
}

function saveGiveawayState(data) {
  writeJson(STATE_FILE, data);
}

function reserveGiveawayId(guildId) {
  const state = loadGiveawayState();
  const nextNumber = (state.counters[guildId] || 0) + 1;

  state.counters[guildId] = nextNumber;
  saveGiveawayState(state);

  return `${guildId}-${String(nextNumber).padStart(4, '0')}`;
}

function saveGiveawayRecord(giveawayData) {
  const state = loadGiveawayState();
  state.giveaways[giveawayData.id] = giveawayData;
  saveGiveawayState(state);
  return state.giveaways[giveawayData.id];
}

function getGiveawayRecord(giveawayId) {
  const state = loadGiveawayState();
  return state.giveaways[giveawayId] || null;
}

function updateGiveawayRecord(giveawayId, updates) {
  const state = loadGiveawayState();
  const current = state.giveaways[giveawayId];
  if (!current) return null;

  state.giveaways[giveawayId] = {
    ...current,
    ...updates,
  };

  saveGiveawayState(state);
  return state.giveaways[giveawayId];
}

function listGiveawaysByGuild(guildId) {
  const state = loadGiveawayState();

  return Object.values(state.giveaways)
    .filter((giveaway) => giveaway.guildId === guildId)
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      return rightTime - leftTime;
    });
}

function listActiveGiveaways(guildId) {
  return listGiveawaysByGuild(guildId)
    .filter((giveaway) => giveaway.status === STATUS.ACTIVE)
    .sort((left, right) => new Date(left.endsAt).getTime() - new Date(right.endsAt).getTime());
}

function listDueGiveaways(referenceTime = Date.now()) {
  const state = loadGiveawayState();

  return Object.values(state.giveaways).filter((giveaway) => {
    if (giveaway.status !== STATUS.ACTIVE) return false;
    const endsAt = new Date(giveaway.endsAt || 0).getTime();
    return Number.isFinite(endsAt) && endsAt > 0 && endsAt <= referenceTime;
  });
}

function getAccentColor() {
  const color = String(appConfig.discord?.color || '00FF7F').replace('#', '');
  const parsed = Number.parseInt(color, 16);
  return Number.isNaN(parsed) ? COLORS.active : parsed;
}

function createDefaultGiveawayDraft(channelId = null) {
  return {
    channelId,
    prize: '',
    bannerUrl: GIVEAWAY_BANNER_URL || '',
    durationMs: DEFAULT_DURATION_MS,
    winnerCount: DEFAULT_WINNER_COUNT,
    bonusEntries: DEFAULT_BONUS_ENTRIES,
    requiredRoleId: null,
    bonusRoleId: null,
    pingRoleId: null,
  };
}

function truncate(value, maxLength = 120) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatGiveawayCode(giveawayId) {
  const value = String(giveawayId || '');
  const parts = value.split('-');
  return `${parts[parts.length - 1] || '0000'}`;
}

function parseDurationInput(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return {
      ok: false,
      error: 'Informe uma duracao. Ex.: 30m, 2h, 1d 6h.',
    };
  }

  let totalMs = 0;
  let matches = 0;
  const regex = /(\d+)\s*(d|dia|dias|h|hora|horas|m|min|mins|minuto|minutos)/g;

  for (const match of raw.matchAll(regex)) {
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (unit === 'd' || unit === 'dia' || unit === 'dias') {
      totalMs += amount * 24 * 60 * 60 * 1000;
    } else if (unit === 'h' || unit === 'hora' || unit === 'horas') {
      totalMs += amount * 60 * 60 * 1000;
    } else {
      totalMs += amount * 60 * 1000;
    }

    matches += 1;
  }

  if (matches === 0 && /^\d+$/.test(raw)) {
    totalMs = Number.parseInt(raw, 10) * 60 * 1000;
    matches = 1;
  }

  if (matches === 0 || totalMs <= 0) {
    return {
      ok: false,
      error: 'Duracao invalida. Use formatos como `30m`, `2h`, `1d 12h`.',
    };
  }

  const minMs = 60 * 1000;
  const maxMs = 30 * 24 * 60 * 60 * 1000;

  if (totalMs < minMs) {
    return {
      ok: false,
      error: 'A duracao minima do sorteio e de 1 minuto.',
    };
  }

  if (totalMs > maxMs) {
    return {
      ok: false,
      error: 'A duracao maxima do sorteio e de 30 dias.',
    };
  }

  return {
    ok: true,
    durationMs: totalMs,
    normalizedText: raw,
  };
}

function parseIntegerInput(value, options = {}) {
  const min = Number.isFinite(options.min) ? options.min : 1;
  const max = Number.isFinite(options.max) ? options.max : 100;
  const label = options.label || 'valor';
  const parsed = Number.parseInt(String(value || '').trim(), 10);

  if (!Number.isFinite(parsed)) {
    return {
      ok: false,
      error: `Informe um numero valido para ${label}.`,
    };
  }

  if (parsed < min || parsed > max) {
    return {
      ok: false,
      error: `${label} deve ficar entre ${min} e ${max}.`,
    };
  }

  return {
    ok: true,
    value: parsed,
  };
}

function ensureParticipantsMap(giveaway) {
  return giveaway?.participants && typeof giveaway.participants === 'object'
    ? giveaway.participants
    : {};
}

function getParticipantCount(giveaway) {
  return Object.keys(ensureParticipantsMap(giveaway)).length;
}

function getParticipant(giveaway, userId) {
  return ensureParticipantsMap(giveaway)[userId] || null;
}

function getParticipantTicketCount(entry) {
  if (!entry) return 0;
  const extraEntries = Number(entry.extraEntries || 0);
  return 1 + Math.max(0, extraEntries);
}

function getTotalTickets(giveaway) {
  return Object.values(ensureParticipantsMap(giveaway)).reduce((total, entry) => {
    return total + getParticipantTicketCount(entry);
  }, 0);
}

function hasRequiredRole(member, roleId) {
  if (!roleId) return true;
  return member?.roles?.cache?.has(roleId) || false;
}

function canManageGiveaway(interaction, giveaway = null) {
  if (!interaction.inGuild()) return false;

  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return true;
  }

  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return true;
  }

  if (giveaway && interaction.user.id === giveaway.hostId) {
    return true;
  }

  return false;
}

function getStatusLabel(giveaway) {
  if (giveaway.status === STATUS.ENDED) return 'Encerrado';
  if (giveaway.status === STATUS.CANCELLED) return 'Cancelado';
  return 'Em andamento';
}

function getStatusColor(giveaway) {
  if (giveaway.status === STATUS.ENDED) return COLORS.ended;
  if (giveaway.status === STATUS.CANCELLED) return COLORS.cancelled;
  return getAccentColor();
}

function formatMentionOrFallback(roleId, emptyText = 'Nao configurado') {
  return roleId ? `<@&${roleId}>` : emptyText;
}

function formatChannelOrFallback(channelId, emptyText = 'Nao selecionado') {
  return channelId ? `<#${channelId}>` : emptyText;
}

function getGiveawayBotIconUrl(guild) {
  return guild.members?.me?.displayAvatarURL?.({ extension: 'png', size: 256 })
    || guild.client?.user?.displayAvatarURL?.({ extension: 'png', size: 256 })
    || guild.iconURL?.({ extension: 'png', size: 256 })
    || null;
}

function getGiveawayButtonEmoji() {
  const emojiId = String(GIVEAWAY_BUTTON_EMOJI_ID || '').trim();
  if (!emojiId) return '🎉';

  return {
    id: emojiId,
    name: 'giveaway',
  };
}

function getBannerPresetById(presetId) {
  return GIVEAWAY_BANNER_PRESETS.find((preset) => preset.id === presetId) || null;
}

function getBannerPresetByUrl(url) {
  const value = String(url || '').trim();
  return GIVEAWAY_BANNER_PRESETS.find((preset) => preset.url === value) || null;
}

function getBannerPresetLabel(url) {
  const preset = getBannerPresetByUrl(url);
  if (preset) return preset.label;
  return String(url || '').trim() ? 'Banner customizado' : 'Sem banner';
}

function normalizeBannerUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';

  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

function buildBannerPresetOptions(selectedUrl) {
  const selectedPreset = getBannerPresetByUrl(selectedUrl) || getBannerPresetById('none');

  return GIVEAWAY_BANNER_PRESETS.map((preset) => {
    return new StringSelectMenuOptionBuilder()
      .setLabel(preset.label)
      .setDescription(preset.description)
      .setValue(preset.id)
      .setDefault(preset.id === selectedPreset?.id);
  });
}

function buildGiveawaySetupModal(draft) {
  return new ModalBuilder()
    .setCustomId('sorteio:setup:modal')
    .setTitle('Configurar sorteio')
    .setLabelComponents(
      new LabelBuilder()
        .setLabel('Premio principal')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('sorteio_prize')
            .setPlaceholder('Ex.: VIP Ouro + 1 veiculo exclusivo')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(200)
            .setValue(String(draft.prize || '').slice(0, 200)),
        ),
      new LabelBuilder()
        .setLabel('Duracao')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('sorteio_duration')
            .setPlaceholder('Ex.: 30m, 2h, 1d 6h')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(30)
            .setValue(String(draft.durationText || '').slice(0, 30)),
        ),
      new LabelBuilder()
        .setLabel('Quantidade de ganhadores')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('sorteio_winners')
            .setPlaceholder('Ex.: 1')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(3)
            .setValue(String(draft.winnerCount || DEFAULT_WINNER_COUNT).slice(0, 3)),
        ),
      new LabelBuilder()
        .setLabel('Cargo obrigatorio')
        .setDescription('Opcional: quem nao tiver esse cargo nao entra no sorteio.')
        .setRoleSelectMenuComponent(
          new RoleSelectMenuBuilder()
            .setCustomId('sorteio_required_role')
            .setPlaceholder('Selecione um cargo obrigatorio')
            .setMinValues(0)
            .setMaxValues(1)
            .setRequired(false)
            .setDefaultRoles(...(draft.requiredRoleId ? [draft.requiredRoleId] : [])),
        ),
      new LabelBuilder()
        .setLabel('Cargo para avisar no lancamento')
        .setDescription('Opcional: esse cargo sera mencionado ao publicar o sorteio.')
        .setRoleSelectMenuComponent(
          new RoleSelectMenuBuilder()
            .setCustomId('sorteio_ping_role')
            .setPlaceholder('Selecione um cargo para aviso')
            .setMinValues(0)
            .setMaxValues(1)
            .setRequired(false)
            .setDefaultRoles(...(draft.pingRoleId ? [draft.pingRoleId] : [])),
        ),
    );
}

function buildGiveawayDetailsEditorMessage(guild, draft, options = {}) {
  const guildIconUrl = guild.iconURL({ extension: 'png', size: 256 }) || null;
  const heroSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '# Editar detalhes',
        'Use o formulario para premio, duracao, quantidade de ganhadores e cargos.',
        options.notice ? `> ${options.notice}` : null,
      ].filter(Boolean).join('\n')),
    );

  if (guildIconUrl) {
    heroSection.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(guildIconUrl)
        .setDescription(guild.name),
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(COLORS.panel)
    .addSectionComponents(heroSection)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Detalhes atuais**',
        `Premio: ${draft.prize ? truncate(draft.prize, 120) : 'Nao definido'}`,
        `Duracao: ${draft.durationText || 'Nao definido'}`,
        `Ganhadores: ${draft.winnerCount || DEFAULT_WINNER_COUNT}`,
        `Canal: ${formatChannelOrFallback(draft.channelId)}`,
        `Banner: ${getBannerPresetLabel(draft.bannerUrl)}`,
        `Cargo obrigatorio: ${formatMentionOrFallback(draft.requiredRoleId, 'Livre para todos')}`,
        `Cargo de aviso: ${formatMentionOrFallback(draft.pingRoleId, 'Sem aviso extra')}`,
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('sorteio:setup:edit-form')
          .setLabel('Abrir formulario')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('sorteio:setup:banner-link')
          .setLabel('Link do banner')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('sorteio:setup:back')
          .setLabel('Voltar')
          .setStyle(ButtonStyle.Secondary),
      ),
    );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildGiveawayBannerModal(draft) {
  return new ModalBuilder()
    .setCustomId('sorteio:setup:banner-modal')
    .setTitle('Banner personalizado')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('sorteio_banner_url')
          .setLabel('Link do banner')
          .setPlaceholder('https://cdn.discordapp.com/.../banner.png')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
          .setValue(String(draft.bannerUrl || '').slice(0, 500)),
      ),
    );
}

function buildActiveGiveawayOptions(activeGiveaways) {
  return activeGiveaways.slice(0, MAX_ACTIVE_OPTIONS).map((giveaway) => {
    return new StringSelectMenuOptionBuilder()
      .setLabel(truncate(`${formatGiveawayCode(giveaway.id)} ${giveaway.prize}`, 100))
      .setDescription(truncate(
        `${getParticipantCount(giveaway)} participante(s) | termina ${new Date(giveaway.endsAt).toLocaleString('pt-BR')}`,
        100,
      ))
      .setValue(giveaway.id);
  });
}

function buildGiveawaySetupMessage(guild, draft, activeGiveaways, options = {}) {
  const guildIconUrl = guild.iconURL({ extension: 'png', size: 256 }) || null;
  const activeLines = activeGiveaways.slice(0, 5).map((giveaway) => {
    return `- ${formatGiveawayCode(giveaway.id)} | ${truncate(giveaway.prize, 55)} | ${getParticipantCount(giveaway)} participante(s) | <t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:R>`;
  });

  const heroSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '# Central de Sorteios',
        `Painel administrativo para publicar e gerenciar sorteios em **${guild.name}**.`,
        options.notice ? `> ${options.notice}` : null,
      ].filter(Boolean).join('\n')),
    );

  if (guildIconUrl) {
    heroSection.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(guildIconUrl)
        .setDescription(guild.name),
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(COLORS.panel)
    .addSectionComponents(heroSection)
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Rascunho atual**',
        `Premio: ${draft.prize ? truncate(draft.prize, 120) : 'Nao definido'}`,
        `Banner: ${getBannerPresetLabel(draft.bannerUrl)}`,
        `Duracao: ${draft.durationText || 'Nao definido'}`,
        `Ganhadores: ${draft.winnerCount || DEFAULT_WINNER_COUNT}`,
        `Canal: ${formatChannelOrFallback(draft.channelId)}`,
        `Cargo obrigatorio: ${formatMentionOrFallback(draft.requiredRoleId, 'Livre para todos')}`,
        `Cargo de aviso: ${formatMentionOrFallback(draft.pingRoleId, 'Sem aviso extra')}`,
        '',
        `Sorteios ativos neste servidor: ${activeGiveaways.length}`,
      ].join('\n')),
    );

  if (activeLines.length > 0) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
          '**Ativos agora**',
          ...activeLines,
        ].join('\n')),
      );
  }

  if (draft.bannerUrl) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('**Preview do banner selecionado**'),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(draft.bannerUrl)
            .setDescription(getBannerPresetLabel(draft.bannerUrl)),
        ),
      );
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('sorteio:setup:channel')
          .setPlaceholder('Escolher canal de publicacao')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(1)
          .setMaxValues(1)
          .setDefaultChannels(...(draft.channelId ? [draft.channelId] : [])),
      ),
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('sorteio:setup:banner')
          .setPlaceholder('Escolher banner fixo')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(buildBannerPresetOptions(draft.bannerUrl)),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('sorteio:setup:edit')
          .setLabel('Editar detalhes')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('sorteio:setup:publish')
          .setLabel('Publicar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('sorteio:setup:sync')
          .setLabel('Sincronizar ativos')
          .setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('sorteio:setup:banner-link')
          .setLabel('Link do banner')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('sorteio:setup:clear-roles')
          .setLabel('Limpar cargos')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('sorteio:setup:reset')
          .setLabel('Resetar rascunho')
          .setStyle(ButtonStyle.Danger),
      ),
    );

  if (activeGiveaways.length > 0) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('sorteio:setup:active-select')
          .setPlaceholder('Abrir gerenciamento de um sorteio ativo')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(buildActiveGiveawayOptions(activeGiveaways)),
      ),
    );
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildParticipationLines(giveaway) {
  return [
    `Participantes unicos: ${getParticipantCount(giveaway)}`,
    `Tickets totais: ${getTotalTickets(giveaway)}`,
    `Ganhadores previstos: ${giveaway.winnerCount}`,
  ].join('\n');
}

function buildPublicGiveawayContentLines({
  giveaway,
  isActive,
  winnerMentions,
  endsAtTimestamp,
  finishedAtTimestamp,
}) {
  if (isActive) {
    return [
      '# Active Giveaway',
      '',
      `Prize: **${truncate(giveaway.prize, 220)}**`,
      `Ends: <t:${endsAtTimestamp}:R>`,
      `Date: <t:${endsAtTimestamp}:F>`,
      `Winners: ${giveaway.winnerCount}`,
      `Participants: ${getParticipantCount(giveaway)}`,
      `Created by: <@${giveaway.hostId}>`,
      giveaway.requiredRoleId ? `Role: <@&${giveaway.requiredRoleId}>` : null,
      '',
      'Click the button below to join.',
    ].filter(Boolean);
  }

  if (giveaway.status === STATUS.CANCELLED) {
    return [
      '# Cancelled Giveaway',
      '',
      `Prize: **${truncate(giveaway.prize, 220)}**`,
      'Status: giveaway cancelled',
      `Final date: <t:${finishedAtTimestamp}:F>`,
      `Participants: ${getParticipantCount(giveaway)}`,
      `Created by: <@${giveaway.hostId}>`,
    ].filter(Boolean);
  }

  return [
    '# Ended Giveaway',
    '',
    `Winner(s): ${winnerMentions}`,
    `Prize: **${truncate(giveaway.prize, 220)}**`,
    `Ended: <t:${finishedAtTimestamp}:R>`,
    `Final date: <t:${finishedAtTimestamp}:F>`,
    `Participants: ${getParticipantCount(giveaway)}`,
    `Created by: <@${giveaway.hostId}>`,
    Array.isArray(giveaway.winnerTickets) && giveaway.winnerTickets.length > 0
      ? `Ticket(s): ${giveaway.winnerTickets.map((item) => `<#${item.channelId}>`).join(', ')}`
      : null,
    giveaway.rerollCount > 0 ? `Rerolls: ${giveaway.rerollCount}` : null,
  ].filter(Boolean);
}

function buildGiveawayMessage(guild, giveaway, options = {}) {
  const isActive = giveaway.status === STATUS.ACTIVE;
  const winnerMentions = Array.isArray(giveaway.winnerIds) && giveaway.winnerIds.length > 0
    ? giveaway.winnerIds.map((userId) => `<@${userId}>`).join(', ')
    : 'No winners defined.';
  const botIconUrl = getGiveawayBotIconUrl(guild);
  const bannerUrl = giveaway.bannerUrl || GIVEAWAY_BANNER_URL || '';
  const endsAtTimestamp = Math.floor(new Date(giveaway.endsAt).getTime() / 1000);
  const finishedAtTimestamp = Math.floor(new Date((giveaway.endedAt || giveaway.cancelledAt || giveaway.endsAt)).getTime() / 1000);
  let contentLines = isActive
    ? [
        `**🎉 ${truncate(giveaway.prize, 220)}**`,
        `⏰ **Termina:** <t:${endsAtTimestamp}:R>`,
        `📅 **Data:** <t:${endsAtTimestamp}:F>`,
        `🏆 **Vencedores:** ${giveaway.winnerCount}`,
        `👥 **Participantes:** ${getParticipantCount(giveaway)}`,
        `📌 **Criado por:** <@${giveaway.hostId}>`,
        giveaway.requiredRoleId ? `🔒 **Cargo:** <@&${giveaway.requiredRoleId}>` : null,
        '',
        'Clique no botao abaixo para participar.',
      ].filter(Boolean)
    : giveaway.status === STATUS.CANCELLED
      ? [
          `**🎉 ${truncate(giveaway.prize, 220)}**`,
          `🛑 **Status:** sorteio cancelado`,
          `📅 **Data final:** <t:${finishedAtTimestamp}:F>`,
          `👥 **Participantes:** ${getParticipantCount(giveaway)}`,
          `📌 **Criado por:** <@${giveaway.hostId}>`,
        ]
      : [
          `## 🏆 ${winnerMentions}`,
          `**🎉 ${truncate(giveaway.prize, 220)}**`,
          `🏁 **Encerrado:** <t:${finishedAtTimestamp}:R>`,
          `📅 **Data final:** <t:${finishedAtTimestamp}:F>`,
          `👥 **Participantes:** ${getParticipantCount(giveaway)}`,
          `📌 **Criado por:** <@${giveaway.hostId}>`,
          Array.isArray(giveaway.winnerTickets) && giveaway.winnerTickets.length > 0
            ? `🎫 **Ticket(s):** ${giveaway.winnerTickets.map((item) => `<#${item.channelId}>`).join(', ')}`
            : null,
          giveaway.rerollCount > 0 ? `🔁 **Rerrolagens:** ${giveaway.rerollCount}` : null,
        ].filter(Boolean);
  contentLines = buildPublicGiveawayContentLines({
    giveaway,
    isActive,
    winnerMentions,
    endsAtTimestamp,
    finishedAtTimestamp,
  });
  const heroSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(contentLines.join('\n')),
    );

  if (botIconUrl) {
    heroSection.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(botIconUrl)
        .setDescription('Bot icon'),
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(getStatusColor(giveaway))
    .addSectionComponents(heroSection);

  if (bannerUrl) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(bannerUrl)
            .setDescription('Banner do sorteio'),
        ),
      );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sorteio:join:${giveaway.id}`)
        .setLabel(isActive
          ? 'Join'
          : giveaway.status === STATUS.CANCELLED
            ? 'Cancelled'
            : 'Ended')
        .setStyle(ButtonStyle.Secondary ?? 2)
        .setDisabled(!isActive),
    ),
  );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildSimpleInfoMessage(title, lines, color = COLORS.info, options = {}) {
  const container = new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${title}`,
        ...lines,
      ].join('\n')),
    );

  return {
    flags: options.ephemeral === false
      ? MessageFlags.IsComponentsV2
      : MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildGiveawayStatusMessage(giveaway, userId) {
  const entry = getParticipant(giveaway, userId);
  const userWon = Array.isArray(giveaway.winnerIds) && giveaway.winnerIds.includes(userId);

  return buildSimpleInfoMessage(
    `Status do ${formatGiveawayCode(giveaway.id)}`,
    [
      `Premio: ${truncate(giveaway.prize, 180)}`,
      `Estado: ${getStatusLabel(giveaway)}`,
      `Voce esta participando: ${entry ? 'Sim' : 'Nao'}`,
      `Seus tickets: ${entry ? getParticipantTicketCount(entry) : 0}`,
      entry ? `Entrou em: <t:${Math.floor(new Date(entry.joinedAt).getTime() / 1000)}:f>` : 'Entrou em: -',
      `Participantes unicos: ${getParticipantCount(giveaway)}`,
      `Tickets totais: ${getTotalTickets(giveaway)}`,
      giveaway.status === STATUS.ENDED ? `Voce venceu: ${userWon ? 'Sim' : 'Nao'}` : null,
      giveaway.status === STATUS.ACTIVE
        ? `Encerramento previsto: <t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:R>`
        : null,
    ].filter(Boolean),
    COLORS.info,
  );
}

function buildGiveawayParticipantsMessage(giveaway) {
  const participants = Object.entries(ensureParticipantsMap(giveaway))
    .map(([userId, entry]) => ({
      userId,
      tickets: getParticipantTicketCount(entry),
      joinedAt: entry.joinedAt,
    }))
    .sort((left, right) => {
      if (right.tickets !== left.tickets) return right.tickets - left.tickets;
      return new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime();
    });

  const listed = participants.slice(0, MAX_LISTED_PARTICIPANTS).map((item, index) => {
    return `${index + 1}. <@${item.userId}> - ${item.tickets} ticket(s)`;
  });

  return buildSimpleInfoMessage(
    `Participantes ${formatGiveawayCode(giveaway.id)}`,
    [
      `Premio: ${truncate(giveaway.prize, 160)}`,
      `Total de participantes: ${participants.length}`,
      `Total de tickets: ${getTotalTickets(giveaway)}`,
      '',
      participants.length > 0 ? '**Primeiros participantes**' : 'Nenhum participante registrado ainda.',
      ...listed,
      participants.length > MAX_LISTED_PARTICIPANTS
        ? `... e mais ${participants.length - MAX_LISTED_PARTICIPANTS} participante(s).`
        : null,
    ].filter(Boolean),
    COLORS.info,
  );
}

function buildGiveawayAdminDetailsMessage(guild, giveaway) {
  const rerollDisabled = giveaway.status !== STATUS.ENDED;
  const endDisabled = giveaway.status !== STATUS.ACTIVE;
  const cancelDisabled = giveaway.status !== STATUS.ACTIVE;

  const container = new ContainerBuilder()
    .setAccentColor(getStatusColor(giveaway))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# Gerenciar ${formatGiveawayCode(giveaway.id)}`,
        `Premio: ${truncate(giveaway.prize, 180)}`,
        `Status: ${getStatusLabel(giveaway)}`,
        `Canal: <#${giveaway.channelId}>`,
        `Host: <@${giveaway.hostId}>`,
        `Participantes: ${getParticipantCount(giveaway)}`,
        `Tickets totais: ${getTotalTickets(giveaway)}`,
        `Ganhadores previstos: ${giveaway.winnerCount}`,
        `Banner: ${getBannerPresetLabel(giveaway.bannerUrl)}`,
        giveaway.status === STATUS.ACTIVE
          ? `Encerra em: <t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:R>`
          : `Encerrado em: <t:${Math.floor(new Date((giveaway.endedAt || giveaway.cancelledAt || giveaway.endsAt)).getTime() / 1000)}:f>`,
        `Cargo obrigatorio: ${giveaway.requiredRoleId ? `<@&${giveaway.requiredRoleId}>` : 'Livre para todos'}`,
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sorteio:manage:refresh:${giveaway.id}`)
          .setLabel('Atualizar mensagem')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`sorteio:manage:end:${giveaway.id}`)
          .setLabel('Encerrar agora')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(endDisabled),
        new ButtonBuilder()
          .setCustomId(`sorteio:manage:reroll:${giveaway.id}`)
          .setLabel('Rerrolar')
          .setStyle(ButtonStyle.Success)
          .setDisabled(rerollDisabled),
        new ButtonBuilder()
          .setCustomId(`sorteio:manage:cancel:${giveaway.id}`)
          .setLabel('Cancelar')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(cancelDisabled),
      ),
    );

  return {
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function createParticipantEntry(member, giveaway) {
  const hasBonusRole = giveaway.bonusRoleId && member?.roles?.cache?.has(giveaway.bonusRoleId);
  const extraEntries = hasBonusRole ? Math.max(0, Number(giveaway.bonusEntries || 0)) : 0;

  return {
    userId: member.id,
    joinedAt: new Date().toISOString(),
    extraEntries,
  };
}

function addParticipantToGiveaway(giveawayId, member, giveaway) {
  const participants = ensureParticipantsMap(giveaway);
  participants[member.id] = createParticipantEntry(member, giveaway);

  return updateGiveawayRecord(giveawayId, {
    participants,
  });
}

function removeParticipantFromGiveaway(giveawayId, userId, giveaway) {
  const participants = ensureParticipantsMap(giveaway);
  delete participants[userId];

  return updateGiveawayRecord(giveawayId, {
    participants,
  });
}

function pickGiveawayWinners(giveaway, options = {}) {
  const excludeUserIds = new Set(options.excludeUserIds || []);
  const participants = Object.entries(ensureParticipantsMap(giveaway))
    .filter(([userId]) => !excludeUserIds.has(userId))
    .map(([userId, entry]) => ({
      userId,
      tickets: getParticipantTicketCount(entry),
    }))
    .filter((entry) => entry.tickets > 0);
  const requestedCount = Math.max(1, Number(giveaway.winnerCount || 1));
  const winners = [];
  const pool = [...participants];

  while (winners.length < requestedCount && pool.length > 0) {
    const totalWeight = pool.reduce((sum, entry) => sum + entry.tickets, 0);
    if (totalWeight <= 0) break;

    let target = randomInt(totalWeight);
    let winnerIndex = 0;

    for (let index = 0; index < pool.length; index += 1) {
      target -= pool[index].tickets;
      if (target < 0) {
        winnerIndex = index;
        break;
      }
    }

    winners.push(pool[winnerIndex].userId);
    pool.splice(winnerIndex, 1);
  }

  return winners;
}

async function resolveGiveawayMessage(client, giveaway) {
  const guild = client.guilds.cache.get(giveaway.guildId)
    || await client.guilds.fetch(giveaway.guildId).catch(() => null);

  if (!guild) {
    return { guild: null, channel: null, message: null };
  }

  const channel = guild.channels.cache.get(giveaway.channelId)
    || await guild.channels.fetch(giveaway.channelId).catch(() => null);

  if (!channel?.isTextBased()) {
    return { guild, channel: null, message: null };
  }

  const message = giveaway.messageId
    ? await channel.messages.fetch(giveaway.messageId).catch(() => null)
    : null;

  return { guild, channel, message };
}

async function syncGiveawayMessage(client, giveawayId) {
  const giveaway = getGiveawayRecord(giveawayId);
  if (!giveaway) {
    return {
      ok: false,
      code: 'not_found',
    };
  }

  const { guild, message } = await resolveGiveawayMessage(client, giveaway);

  if (!guild || !message) {
    return {
      ok: false,
      code: 'message_missing',
      giveaway,
    };
  }

  await message.edit(
    buildGiveawayMessage(guild, giveaway),
  );

  return {
    ok: true,
    giveaway,
  };
}

async function syncGuildActiveGiveaways(client, guildId) {
  const activeGiveaways = listActiveGiveaways(guildId);
  let updated = 0;

  for (const giveaway of activeGiveaways) {
    const result = await syncGiveawayMessage(client, giveaway.id).catch(() => ({ ok: false }));
    if (result.ok) updated += 1;
  }

  return {
    total: activeGiveaways.length,
    updated,
  };
}

async function createWinnerTickets(client, giveaway) {
  if (!Array.isArray(giveaway?.winnerIds) || giveaway.winnerIds.length === 0) {
    return giveaway;
  }

  const guild = client.guilds.cache.get(giveaway.guildId)
    || await client.guilds.fetch(giveaway.guildId).catch(() => null);

  if (!guild) {
    return updateGiveawayRecord(giveaway.id, {
      winnerTickets: [],
      winnerTicketErrors: ['guild_not_found'],
    }) || giveaway;
  }

  const winnerTickets = [];
  const winnerTicketErrors = [];

  for (const winnerId of giveaway.winnerIds) {
    const result = await createGiveawayWinnerTicket({
      guild,
      giveaway,
      userId: winnerId,
      locale: 'en',
    }).catch((error) => {
      console.error('[Sorteio] Falha ao criar ticket do vencedor:', error);
      return {
        ok: false,
        code: 'ticket_creation_failed',
      };
    });

    if (result?.ok) {
      winnerTickets.push({
        userId: winnerId,
        channelId: result.channel.id,
        ticketNumber: result.ticket.number,
      });
      continue;
    }

    winnerTicketErrors.push(`${winnerId}:${result?.code || 'unknown_error'}`);
  }

  return updateGiveawayRecord(giveaway.id, {
    winnerTickets,
    winnerTicketErrors,
  }) || giveaway;
}

async function endGiveaway(client, giveawayId, options = {}) {
  const giveaway = getGiveawayRecord(giveawayId);
  if (!giveaway) {
    return {
      ok: false,
      code: 'not_found',
    };
  }

  if (giveaway.status !== STATUS.ACTIVE) {
    return {
      ok: false,
      code: 'not_active',
      giveaway,
    };
  }

  const winnerIds = pickGiveawayWinners(giveaway);
  const endedGiveaway = updateGiveawayRecord(giveawayId, {
    status: STATUS.ENDED,
    endedAt: new Date().toISOString(),
    endedBy: options.actorId || null,
    winnerIds,
    winnerTickets: [],
    winnerTicketErrors: [],
  });

  const giveawayWithTickets = await createWinnerTickets(client, endedGiveaway).catch(() => endedGiveaway);
  await syncGiveawayMessage(client, giveawayId).catch(() => {});

  return {
    ok: true,
    giveaway: giveawayWithTickets,
  };
}

async function rerollGiveaway(client, giveawayId, options = {}) {
  const giveaway = getGiveawayRecord(giveawayId);
  if (!giveaway) {
    return {
      ok: false,
      code: 'not_found',
    };
  }

  if (giveaway.status !== STATUS.ENDED) {
    return {
      ok: false,
      code: 'not_ended',
      giveaway,
    };
  }

  const winnerIds = pickGiveawayWinners(giveaway, {
    excludeUserIds: giveaway.winnerIds || [],
  });

  const rerollHistory = Array.isArray(giveaway.rerollHistory) ? [...giveaway.rerollHistory] : [];
  rerollHistory.push({
    previousWinnerIds: giveaway.winnerIds || [],
    rerolledAt: new Date().toISOString(),
    rerolledBy: options.actorId || null,
  });

  const rerolledGiveaway = updateGiveawayRecord(giveawayId, {
    winnerIds,
    rerollCount: Number(giveaway.rerollCount || 0) + 1,
    rerollHistory,
    rerolledAt: new Date().toISOString(),
    rerolledBy: options.actorId || null,
    winnerTickets: [],
    winnerTicketErrors: [],
  });

  const giveawayWithTickets = await createWinnerTickets(client, rerolledGiveaway).catch(() => rerolledGiveaway);
  await syncGiveawayMessage(client, giveawayId).catch(() => {});

  return {
    ok: true,
    giveaway: giveawayWithTickets,
  };
}

async function cancelGiveaway(client, giveawayId, options = {}) {
  const giveaway = getGiveawayRecord(giveawayId);
  if (!giveaway) {
    return {
      ok: false,
      code: 'not_found',
    };
  }

  if (giveaway.status !== STATUS.ACTIVE) {
    return {
      ok: false,
      code: 'not_active',
      giveaway,
    };
  }

  const cancelledGiveaway = updateGiveawayRecord(giveawayId, {
    status: STATUS.CANCELLED,
    cancelledAt: new Date().toISOString(),
    cancelledBy: options.actorId || null,
    winnerIds: [],
  });

  await syncGiveawayMessage(client, giveawayId).catch(() => {});

  return {
    ok: true,
    giveaway: cancelledGiveaway,
  };
}

function startGiveawayWatcher(client) {
  if (client.giveawayWatcher) return;

  client.giveawayWatcherRunning = false;
  const tick = async () => {
    if (client.giveawayWatcherRunning) return;
    client.giveawayWatcherRunning = true;

    try {
      const dueGiveaways = listDueGiveaways();
      for (const giveaway of dueGiveaways) {
        await endGiveaway(client, giveaway.id, {
          actorId: client.user?.id || null,
        }).catch((error) => {
          console.error('[Sorteio] Falha ao encerrar automaticamente:', error);
        });
      }
    } finally {
      client.giveawayWatcherRunning = false;
    }
  };

  void tick();
  client.giveawayWatcher = setInterval(() => {
    void tick();
  }, 15 * 1000);
}

module.exports = {
  STATUS,
  addParticipantToGiveaway,
  buildGiveawayAdminDetailsMessage,
  buildGiveawayBannerModal,
  buildGiveawayDetailsEditorMessage,
  buildGiveawayMessage,
  buildGiveawayParticipantsMessage,
  getBannerPresetById,
  buildGiveawaySetupMessage,
  buildGiveawaySetupModal,
  buildGiveawayStatusMessage,
  buildSimpleInfoMessage,
  cancelGiveaway,
  canManageGiveaway,
  createDefaultGiveawayDraft,
  endGiveaway,
  formatGiveawayCode,
  getGiveawayRecord,
  getParticipant,
  getParticipantCount,
  getParticipantTicketCount,
  getTotalTickets,
  hasRequiredRole,
  listActiveGiveaways,
  normalizeBannerUrl,
  parseDurationInput,
  parseIntegerInput,
  removeParticipantFromGiveaway,
  reserveGiveawayId,
  rerollGiveaway,
  saveGiveawayRecord,
  startGiveawayWatcher,
  syncGiveawayMessage,
  syncGuildActiveGiveaways,
  updateGiveawayRecord,
};
