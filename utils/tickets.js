const fs = require('fs');
const path = require('path');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ContainerBuilder,
  FileBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
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

const DATA_DIR = path.join(__dirname, '..', 'data', 'tickets');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const PANEL_ACCENT_COLOR = 0x000000;
const DEFAULT_TICKET_BANNER_URL = 'https://cdn.discordapp.com/attachments/1473339280633102623/1478575644647362660/banner.png?ex=69a98f20&is=69a83da0&hm=d2a03a3c21dde96a4e8bb8e872f5242f38608c2290593441d22727573c470049&';
const TICKET_BANNER_URL = process.env.TICKET_BANNER_URL || process.env.WELCOME_BANNER_URL || DEFAULT_TICKET_BANNER_URL;

const TICKET_TYPES = [
  {
    id: 'pre_purchase',
    slug: 'pre-purchase',
    locale: 'pt-BR',
    title: 'Duvidas antes da compra',
    titleEn: 'Pre-purchase Questions',
    emoji: '❓',
    selectLabel: 'Duvidas antes da compra',
    selectLabelEn: 'Pre-purchase Questions',
    selectDescription: 'Tire duvidas antes de comprar.',
    selectDescriptionEn: 'Questions before buying.',
    modalTitle: 'Duvidas antes da compra',
    modalTitleEn: 'Pre-purchase Questions',
    modalFields: [
      {
        id: 'ticket_reason',
        label: 'Explique sua duvida',
        description: 'Informe o produto e o que voce quer confirmar.',
        placeholder: 'Quero saber se esse pacote inclui atualizacoes, suporte e compatibilidade...',
        labelEn: 'Explain your question',
        descriptionEn: 'Tell us which product you are asking about and what you need to confirm.',
        placeholderEn: 'I want to know if this package includes updates, support, and compatibility...',
        style: TextInputStyle.Paragraph,
        maxLength: 1000,
        required: true,
        summaryLabel: 'Duvida',
        summaryLabelEn: 'Question',
      },
    ],
  },
  {
    id: 'script_support',
    slug: 'script-support',
    locale: 'pt-BR',
    title: 'Suporte para script',
    titleEn: 'Script Support',
    emoji: '🔧',
    selectLabel: 'Suporte para script',
    selectLabelEn: 'Script Support',
    selectDescription: 'Suporte tecnico, bugs e correcoes.',
    selectDescriptionEn: 'Technical support, bugs, and fixes.',
    modalTitle: 'ID da transacao Tebex',
    modalTitleEn: 'Tebex Transaction ID',
    modalFields: [
      {
        id: 'ticket_tebex_id',
        label: 'Informe o ID da transacao Tebex',
        description: 'Use o codigo exibido na confirmacao da compra.',
        placeholder: 'Ex.: tbx-xxxxx',
        labelEn: 'Enter your Tebex Transaction ID',
        descriptionEn: 'Use the code shown in your Tebex purchase confirmation.',
        placeholderEn: 'e.g. tbx-xxxxx',
        style: TextInputStyle.Short,
        maxLength: 100,
        required: true,
        summaryLabel: 'ID da transacao Tebex',
        summaryLabelEn: 'Tebex Transaction ID',
      },
      {
        id: 'ticket_problem',
        label: 'Descreva o problema',
        description: 'Explique o erro, bug ou suporte necessario.',
        placeholder: 'Diga o que esta acontecendo, o que voce ja tentou e onde o problema ocorre.',
        labelEn: 'Describe the problem',
        descriptionEn: 'Explain the bug, issue, or support you need.',
        placeholderEn: 'Tell us what is happening, what you already tried, and where the issue occurs.',
        style: TextInputStyle.Paragraph,
        maxLength: 1000,
        required: true,
        summaryLabel: 'Problema',
        summaryLabelEn: 'Problem',
      },
    ],
  },
  {
    id: 'subscription_queries',
    slug: 'subscription',
    locale: 'pt-BR',
    title: 'Duvidas de assinatura',
    titleEn: 'Subscription Questions',
    emoji: '❓',
    selectLabel: 'Duvidas de assinatura',
    selectLabelEn: 'Subscription Questions',
    selectDescription: 'Renovacao, acesso e cobranca.',
    selectDescriptionEn: 'Renewal, access, and billing help.',
    modalTitle: 'Duvidas de assinatura',
    modalTitleEn: 'Subscription Questions',
    modalFields: [
      {
        id: 'ticket_reason',
        label: 'Explique sua duvida',
        description: 'Informe sua duvida sobre renovacao, acesso ou cobranca.',
        placeholder: 'Preciso de ajuda com renovacao, nivel de acesso, cancelamento ou cobranca...',
        labelEn: 'Explain your question',
        descriptionEn: 'Tell us your question about renewal, access, or billing.',
        placeholderEn: 'I need help with renewal, access level, cancellation, or billing...',
        style: TextInputStyle.Paragraph,
        maxLength: 1000,
        required: true,
        summaryLabel: 'Duvida de assinatura',
        summaryLabelEn: 'Subscription Question',
      },
    ],
  },
  {
    id: 'business',
    slug: 'business',
    locale: 'pt-BR',
    title: 'Comercial e parcerias',
    titleEn: 'Business Inquiries',
    emoji: '💼',
    selectLabel: 'Comercial e parcerias',
    selectLabelEn: 'Business Inquiries',
    selectDescription: 'Propostas, collabs e contato comercial.',
    selectDescriptionEn: 'Partnerships, proposals, and business contact.',
    modalTitle: 'Comercial e parcerias',
    modalTitleEn: 'Business Inquiries',
    modalFields: [
      {
        id: 'ticket_reason',
        label: 'Descreva sua proposta',
        description: 'Compartilhe a proposta ou parceria que deseja apresentar.',
        placeholder: 'Fale sobre o projeto, publico, proposta e como podemos retornar.',
        labelEn: 'Describe your proposal',
        descriptionEn: 'Share the proposal or partnership you want to present.',
        placeholderEn: 'Tell us about the project, audience, proposal, and how we can get back to you.',
        style: TextInputStyle.Paragraph,
        maxLength: 1000,
        required: true,
        summaryLabel: 'Proposta',
        summaryLabelEn: 'Proposal',
      },
    ],
  },
  {
    id: 'giveaway_claim',
    slug: 'giveaway',
    locale: 'en',
    title: 'Resgate de sorteio',
    titleEn: 'Giveaway Claim',
    emoji: '🎁',
    selectLabel: 'Resgate de sorteio',
    selectLabelEn: 'Giveaway Claim',
    selectDescription: 'Ticket automatico para entrega de premio.',
    selectDescriptionEn: 'Automatic ticket for prize delivery.',
    hiddenFromPanel: true,
  },
  {
    id: 'portuguese_support',
    slug: 'portuguese-support',
    locale: 'pt-BR',
    title: 'Portugues',
    titleEn: 'Portuguese',
    emoji: '🌐',
    selectLabel: 'Portugues',
    selectLabelEn: 'Portuguese',
    selectDescription: 'Abrir categorias e formulario em portugues.',
    selectDescriptionEn: 'Open categories and forms in Portuguese.',
    isLanguageMenu: true,
    languageMenuLocale: 'pt-BR',
  },
];

const CONTROL_MESSAGE_COPY = {
  'pt-BR': {
    awaitingStaff: '**Responsavel:** aguardando equipe',
    category: '**Categoria:**',
    channelCreatedFor: 'Canal criado para <@{userId}>.',
    closedAt: '**Fechado em:**',
    closedBy: '**Fechado por:**',
    closedNote: 'Este ticket foi encerrado e movido para a area de arquivados.',
    deleteChannel: 'Deletar canal',
    details: '**Resumo do atendimento**',
    openStatus: '**Status:** aberto',
    claimTicket: 'Assumir atendimento',
    closeTicket: 'Encerrar ticket',
    createdAt: '**Criado em:**',
    readyForSupport: '<@{userId}> e <@&{staffRoleId}>, o canal foi criado e esta pronto para atendimento.',
    requester: '**Solicitante:** <@{userId}>',
    responsible: '**Responsavel:** <@{claimedBy}>',
    ticketTitle: 'Ticket',
    ticketSubtitle: 'Painel principal do atendimento.',
    closedStatus: '**Status:** fechado',
  },
  en: {
    awaitingStaff: '**Assigned to:** waiting for staff',
    category: '**Category:**',
    channelCreatedFor: 'Channel created for <@{userId}>.',
    closedAt: '**Closed at:**',
    closedBy: '**Closed by:**',
    closedNote: 'This ticket has been closed and moved to the archive section.',
    deleteChannel: 'Delete channel',
    details: '**Support summary**',
    openStatus: '**Status:** open',
    claimTicket: 'Claim ticket',
    closeTicket: 'Close ticket',
    createdAt: '**Created at:**',
    readyForSupport: '<@{userId}> and <@&{staffRoleId}>, the channel has been created and is ready for support.',
    requester: '**Requester:** <@{userId}>',
    responsible: '**Assigned to:** <@{claimedBy}>',
    ticketTitle: 'Ticket',
    ticketSubtitle: 'Main support control panel.',
    closedStatus: '**Status:** closed',
  },
};

function getTicketLocale(ticketOrType) {
  if (!ticketOrType) return 'pt-BR';
  if (ticketOrType.locale === 'en') return 'en';
  if (ticketOrType.type) {
    const typeConfig = getTicketType(ticketOrType.type);
    if (typeConfig?.locale === 'en') return 'en';
  }
  return 'pt-BR';
}

function formatControlCopy(locale, key, replacements = {}) {
  const template = CONTROL_MESSAGE_COPY[locale]?.[key] ?? CONTROL_MESSAGE_COPY['pt-BR'][key] ?? '';

  return Object.entries(replacements).reduce((text, [placeholder, value]) => {
    return text.replace(`{${placeholder}}`, value);
  }, template);
}

function ensureTicketStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ guilds: {} }, null, 2));
  }

  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ counters: {}, tickets: {} }, null, 2));
  }
}

function readJson(filePath, fallback) {
  ensureTicketStore();

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureTicketStore();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function parseAccentColor() {
  const color = String(appConfig.discord?.color || '00FF7F').replace('#', '');
  const parsed = Number.parseInt(color, 16);
  return Number.isNaN(parsed) ? 0x00ff7f : parsed;
}

function formatTicketNumber(ticketNumber) {
  return String(ticketNumber).padStart(4, '0');
}

function getTicketType(typeId) {
  return TICKET_TYPES.find((type) => type.id === typeId) || null;
}

function getLocalizedTicketTitle(ticketType, locale = 'pt-BR') {
  if (!ticketType) return null;
  return locale === 'en' ? (ticketType.titleEn || ticketType.title) : ticketType.title;
}

function getLocalizedSelectLabel(ticketType, locale = 'pt-BR') {
  if (!ticketType) return null;
  return locale === 'en' ? (ticketType.selectLabelEn || ticketType.selectLabel) : ticketType.selectLabel;
}

function getLocalizedSelectDescription(ticketType, locale = 'pt-BR') {
  if (!ticketType) return null;
  return locale === 'en'
    ? (ticketType.selectDescriptionEn || ticketType.selectDescription)
    : ticketType.selectDescription;
}

function getLocalizedModalTitle(ticketType, locale = 'pt-BR') {
  if (!ticketType) return null;
  return locale === 'en' ? (ticketType.modalTitleEn || ticketType.modalTitle) : ticketType.modalTitle;
}

function getLocalizedModalFields(ticketType, locale = 'pt-BR') {
  if (!ticketType?.modalFields) return [];

  return ticketType.modalFields.map((field) => {
    return {
      ...field,
      label: locale === 'en' ? (field.labelEn || field.label) : field.label,
      description: locale === 'en' ? (field.descriptionEn || field.description) : field.description,
      placeholder: locale === 'en' ? (field.placeholderEn || field.placeholder) : field.placeholder,
      summaryLabel: locale === 'en' ? (field.summaryLabelEn || field.summaryLabel) : field.summaryLabel,
    };
  });
}

function formatSetupField(label, value, emptyText) {
  return `**${label}:** ${value || emptyText}`;
}

function buildTicketTopic(data) {
  return [
    `ticketOwner:${data.userId}`,
    `type:${data.type}`,
    `number:${data.number}`,
    `locale:${data.locale || 'pt-BR'}`,
    `status:${data.status || 'open'}`,
  ].join(' | ');
}

function loadTicketConfigs() {
  return readJson(CONFIG_FILE, { guilds: {} });
}

function saveTicketConfigs(data) {
  writeJson(CONFIG_FILE, data);
}

function getGuildTicketConfig(guildId) {
  const config = loadTicketConfigs();
  return config.guilds[guildId] || null;
}

function setGuildTicketConfig(guildId, guildConfig) {
  const config = loadTicketConfigs();
  config.guilds[guildId] = guildConfig;
  saveTicketConfigs(config);
  return config.guilds[guildId];
}

function loadTicketState() {
  return readJson(STATE_FILE, { counters: {}, tickets: {} });
}

function saveTicketState(data) {
  writeJson(STATE_FILE, data);
}

function reserveTicketNumber(guildId) {
  const state = loadTicketState();
  const nextNumber = (state.counters[guildId] || 0) + 1;

  state.counters[guildId] = nextNumber;
  saveTicketState(state);

  return nextNumber;
}

function saveTicketRecord(ticketData) {
  const state = loadTicketState();
  state.tickets[ticketData.channelId] = ticketData;
  saveTicketState(state);
  return state.tickets[ticketData.channelId];
}

function updateTicketRecord(channelId, updates) {
  const state = loadTicketState();
  if (!state.tickets[channelId]) return null;

  state.tickets[channelId] = {
    ...state.tickets[channelId],
    ...updates,
  };

  saveTicketState(state);
  return state.tickets[channelId];
}

function getTicketRecord(channelId) {
  const state = loadTicketState();
  return state.tickets[channelId] || null;
}

function removeTicketRecord(channelId) {
  const state = loadTicketState();
  if (!state.tickets[channelId]) return null;

  const ticket = state.tickets[channelId];
  delete state.tickets[channelId];
  saveTicketState(state);

  return ticket;
}

function countOpenTickets() {
  const state = loadTicketState();
  return Object.keys(state.tickets).length;
}

function findOpenTicketByUser(guildId, userId) {
  const state = loadTicketState();

  return Object.values(state.tickets).find((ticket) => {
    return ticket.guildId === guildId && ticket.userId === userId;
  }) || null;
}

function getTicketPanelBotIconUrl(guild) {
  return guild.members.me?.displayAvatarURL({ extension: 'png', size: 256 })
    || guild.client?.user?.displayAvatarURL({ extension: 'png', size: 256 })
    || null;
}

function buildTicketPanelMessage(guild) {
  const botIconUrl = getTicketPanelBotIconUrl(guild);
  const heroSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '# Support Center',
        `Official support flow for **${guild.name}**.`,
        '',
        'Select the correct category below to open your ticket.',
        'Explain your case clearly and wait for the team in the created channel.',
      ].join('\n')),
    );

  if (botIconUrl) {
    heroSection.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(botIconUrl)
        .setDescription('Support bot icon'),
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR);

  container
    .addSectionComponents(
      heroSection,
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Quick rules**',
        '1. Open only one ticket at a time.',
        '2. Choose the correct category.',
        '3. Do not ping staff unless needed.',
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket:create')
          .setPlaceholder('Select ticket type')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            TICKET_TYPES.map((type) => {
                if (type.hiddenFromPanel) return null;
                return new StringSelectMenuOptionBuilder()
                  .setLabel(getLocalizedSelectLabel(type, 'en'))
                  .setDescription(getLocalizedSelectDescription(type, 'en'))
                  .setValue(type.id)
                  .setEmoji(type.emoji);
              }).filter(Boolean),
          ),
      ),
    );

  if (TICKET_BANNER_URL) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(TICKET_BANNER_URL)
            .setDescription('Safe Studio RedM Store banner'),
        ),
      );
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  };
}

function buildPortugueseTicketMenuMessage(guild) {
  const botIconUrl = getTicketPanelBotIconUrl(guild);
  const heroSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '# Central de Tickets',
        `Atendimento oficial de **${guild.name}**.`,
        '',
        'Selecione a categoria correta abaixo para abrir seu ticket.',
        'Explique o caso com clareza e aguarde a equipe no canal criado.',
      ].join('\n')),
    );

  if (botIconUrl) {
    heroSection.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(botIconUrl)
        .setDescription('Icone do bot de suporte'),
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(PANEL_ACCENT_COLOR);

  container
    .addSectionComponents(
      heroSection,
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Regras rapidas**',
        '1. Abra apenas um ticket por vez.',
        '2. Use a categoria correta.',
        '3. Evite marcar a equipe sem necessidade.',
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket:create:portuguese')
          .setPlaceholder('Selecione o tipo de ticket')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            TICKET_TYPES
              .filter((type) => !type.isLanguageMenu && !type.hiddenFromPanel)
              .map((type) => {
                return new StringSelectMenuOptionBuilder()
                  .setLabel(getLocalizedSelectLabel(type, 'pt-BR'))
                  .setDescription(getLocalizedSelectDescription(type, 'pt-BR'))
                  .setValue(type.id)
                  .setEmoji(type.emoji);
              }),
          ),
      ),
    );

  if (TICKET_BANNER_URL) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setURL(TICKET_BANNER_URL)
            .setDescription('Safe Studio RedM Store banner'),
        ),
      );
  }

  return {
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: { parse: [] },
  };
}

function buildTicketCreateModal(ticketType, guildName, locale = 'pt-BR') {
  const introText = locale === 'en'
    ? [
        `> This form will be sent to **${guildName}**.`,
        '> Do not share passwords, tokens, or other sensitive information.',
      ].join('\n')
    : [
        `> Este formulario sera enviado para **${guildName}**.`,
        '> Nao compartilhe senhas, tokens ou outras informacoes confidenciais.',
      ].join('\n');

  return {
    title: getLocalizedModalTitle(ticketType, locale),
    components: [
      new TextDisplayBuilder().setContent(introText),
      ...getLocalizedModalFields(ticketType, locale).map((field) => {
        return new LabelBuilder()
          .setLabel(field.label)
          .setDescription(field.description)
          .setTextInputComponent(
            new TextInputBuilder()
              .setCustomId(field.id)
              .setPlaceholder(field.placeholder)
              .setStyle(field.style)
              .setMaxLength(field.maxLength)
              .setRequired(field.required),
          );
      }),
    ],
  };
}

function buildTicketControlMessage(ticket, guildConfig, options = {}) {
  const ticketType = getTicketType(ticket.type);
  const locale = getTicketLocale(ticket);
  const shouldMention = options.shouldMention ?? false;
  const isClosed = options.isClosed ?? false;
  const ticketTitle = ticketType ? getLocalizedTicketTitle(ticketType, locale) : ticket.type;
  const claimedByLine = ticket.claimedBy
    ? formatControlCopy(locale, 'responsible', { claimedBy: ticket.claimedBy })
    : formatControlCopy(locale, 'awaitingStaff');
  const closedLines = isClosed
    ? [
        formatControlCopy(locale, 'closedStatus'),
        ticket.closedBy ? `${formatControlCopy(locale, 'closedBy')} <@${ticket.closedBy}>` : null,
        ticket.closedAt
          ? `${formatControlCopy(locale, 'closedAt')} <t:${Math.floor(new Date(ticket.closedAt).getTime() / 1000)}:f>`
          : null,
      ].filter(Boolean)
    : [formatControlCopy(locale, 'openStatus')];
  const summaryLines = [
    formatControlCopy(locale, 'requester', { userId: ticket.userId }),
    `${formatControlCopy(locale, 'category')} ${ticketTitle}`,
    claimedByLine,
    `${formatControlCopy(locale, 'createdAt')} <t:${Math.floor(new Date(ticket.createdAt).getTime() / 1000)}:f>`,
    ...closedLines,
  ];

  const container = new ContainerBuilder()
    .setAccentColor(parseAccentColor())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${formatControlCopy(locale, 'ticketTitle')} #${formatTicketNumber(ticket.number)}`,
        ticketTitle,
        '',
        formatControlCopy(locale, 'ticketSubtitle'),
        shouldMention
          ? formatControlCopy(locale, 'readyForSupport', { userId: ticket.userId, staffRoleId: guildConfig.staffRoleId })
          : formatControlCopy(locale, 'channelCreatedFor', { userId: ticket.userId }),
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(summaryLines.join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        formatControlCopy(locale, 'details'),
        ticket.reason,
        isClosed ? '' : null,
        isClosed ? formatControlCopy(locale, 'closedNote') : null,
      ].filter(Boolean).join('\n')),
    );

  if (!isClosed) {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:claim')
          .setLabel(formatControlCopy(locale, 'claimTicket'))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('👤'),
        new ButtonBuilder()
          .setCustomId('ticket:close')
          .setLabel(formatControlCopy(locale, 'closeTicket'))
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
      ),
    );
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:delete')
          .setLabel(formatControlCopy(locale, 'deleteChannel'))
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️'),
      ),
    );
  }

  const allowedMentions = shouldMention
    ? {
        users: [ticket.userId],
        roles: [guildConfig.staffRoleId],
      }
    : {
        parse: [],
      };

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions,
  };
}

function buildTranscriptLogMessage(data) {
  const closedTimestamp = data.closedAt
    ? Math.floor(new Date(data.closedAt).getTime() / 1000)
    : null;
  const summaryLines = [
    `**Ticket:** #${formatTicketNumber(data.ticketNumber)}`,
    `**Canal:** \`${data.channelName}\``,
    data.categoryName ? `**Categoria:** ${data.categoryName}` : null,
    `**Autor:** <@${data.authorId}>`,
    data.claimedById ? `**Responsavel:** <@${data.claimedById}>` : '**Responsavel:** nao assumido',
    `**Fechado por:** <@${data.closedById}>`,
    closedTimestamp ? `**Fechado em:** <t:${closedTimestamp}:f>` : null,
  ].filter(Boolean);
  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '# Encerramento de Ticket',
        'O atendimento foi arquivado com sucesso. O resumo e o transcript completo estao disponiveis abaixo.',
      ].join('\n')),
    );

  if (data.guildIconUrl) {
    headerSection.setThumbnailAccessory(
      new ThumbnailBuilder()
        .setURL(data.guildIconUrl)
        .setDescription(data.guildName),
    );
  }

  const container = new ContainerBuilder()
    .setAccentColor(0xff5a5f)
    .addSectionComponents(
      headerSection,
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Resumo do encerramento**',
        summaryLines.join('\n'),
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('**Arquivo do transcript**\nBaixe o HTML abaixo para consultar todo o historico do atendimento.'),
    )
    .addFileComponents(
      new FileBuilder().setURL(`attachment://${data.fileName}`),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Transcript exportado automaticamente em HTML.'),
    );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: {
      parse: [],
    },
  };
}

async function resolveTicketCreateResources(guild, guildConfig) {
  if (!guildConfig) {
    return {
      ok: false,
      code: 'ticket_system_not_configured',
    };
  }

  const categoryChannel = guild.channels.cache.get(guildConfig.categoryId)
    || await guild.channels.fetch(guildConfig.categoryId).catch(() => null);
  const staffRole = guild.roles.cache.get(guildConfig.staffRoleId)
    || await guild.roles.fetch(guildConfig.staffRoleId).catch(() => null);
  const botMember = guild.members.me;

  if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
    return {
      ok: false,
      code: 'ticket_category_missing',
    };
  }

  if (!staffRole) {
    return {
      ok: false,
      code: 'ticket_staff_role_missing',
    };
  }

  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
    return {
      ok: false,
      code: 'manage_channels_required',
    };
  }

  return {
    ok: true,
    categoryChannel,
    staffRole,
    guildConfig,
  };
}

function buildTicketPermissionOverwrites(guild, userId, staffRoleId) {
  return [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
      ],
    },
    {
      id: staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AddReactions,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];
}

async function createManagedTicket(options) {
  const guild = options.guild;
  const guildConfig = options.guildConfig || getGuildTicketConfig(guild.id);
  const typeId = options.typeId;
  const userId = options.userId;
  const locale = options.locale === 'en' ? 'en' : 'pt-BR';
  const reason = String(options.reason || '').trim();
  const shouldMention = options.shouldMention ?? true;
  const source = options.source || null;
  const sourceId = options.sourceId || null;
  const requireMember = options.requireMember ?? false;
  const ticketType = getTicketType(typeId);

  if (!ticketType) {
    return {
      ok: false,
      code: 'ticket_type_invalid',
    };
  }

  const resourceResult = await resolveTicketCreateResources(guild, guildConfig);
  if (!resourceResult.ok) {
    return resourceResult;
  }

  if (requireMember) {
    const member = guild.members.cache.get(userId)
      || await guild.members.fetch(userId).catch(() => null);

    if (!member) {
      return {
        ok: false,
        code: 'user_not_found',
      };
    }
  }

  const ticketNumber = reserveTicketNumber(guild.id);
  const ticketChannel = await guild.channels.create({
    name: `${ticketType.slug}-${formatTicketNumber(ticketNumber)}`,
    type: ChannelType.GuildText,
    parent: resourceResult.categoryChannel.id,
    topic: buildTicketTopic({
      userId,
      type: ticketType.id,
      number: ticketNumber,
      locale,
    }),
    permissionOverwrites: buildTicketPermissionOverwrites(guild, userId, resourceResult.staffRole.id),
  });

  const ticketRecord = {
    channelId: ticketChannel.id,
    controlMessageId: null,
    createdAt: new Date().toISOString(),
    guildId: guild.id,
    locale,
    number: ticketNumber,
    reason,
    type: ticketType.id,
    userId,
    claimedBy: null,
  };

  if (source) {
    ticketRecord.source = source;
  }

  if (sourceId) {
    ticketRecord.sourceId = sourceId;
  }

  const ticket = saveTicketRecord(ticketRecord);
  const controlMessage = await ticketChannel.send(
    buildTicketControlMessage(ticket, resourceResult.guildConfig, { shouldMention }),
  );

  const updatedTicket = updateTicketRecord(ticketChannel.id, {
    controlMessageId: controlMessage.id,
  }) || ticket;

  return {
    ok: true,
    ticket: updatedTicket,
    channel: ticketChannel,
  };
}

async function createGiveawayWinnerTicket({ guild, giveaway, userId, locale = 'en' }) {
  const giveawayPanelUrl = giveaway.messageId
    ? `https://discord.com/channels/${guild.id}/${giveaway.channelId}/${giveaway.messageId}`
    : null;
  const reason = [
    `**Source:** giveaway ${String(giveaway.id || '').split('-').slice(-1)[0] || giveaway.id}`,
    `**Prize:** ${giveaway.prize || 'Prize not provided'}`,
    `**Winner:** <@${userId}>`,
    giveawayPanelUrl ? `**Giveaway panel:** ${giveawayPanelUrl}` : null,
    '**Instruction:** use this ticket to coordinate and complete prize delivery.',
  ].filter(Boolean).join('\n');

  const result = await createManagedTicket({
    guild,
    locale,
    reason,
    requireMember: true,
    shouldMention: true,
    source: 'giveaway',
    sourceId: giveaway.id,
    typeId: 'giveaway_claim',
    userId,
  });
  if (!result.ok && result.code === 'user_not_found') {
    return {
      ok: false,
      code: 'winner_not_found',
    };
  }

  return result;
}

function buildTicketSetupMessage(guild, draft, options = {}) {
  const readyToPublish = Boolean(
    draft.panelChannelId && draft.categoryId && draft.staffRoleId && draft.closedCategoryId,
  );
  const summaryLines = [
    '# Central de Tickets',
    'Configure abaixo onde o sistema vai publicar, abrir, arquivar e registrar os atendimentos.',
    options.notice ? `> ${options.notice}` : null,
    '',
    '**Resumo atual**',
    formatSetupField('Canal do painel', draft.panelChannelId ? `<#${draft.panelChannelId}>` : null, 'nao selecionado'),
    formatSetupField('Categoria dos tickets', draft.categoryId ? `<#${draft.categoryId}>` : null, 'nao selecionada'),
    formatSetupField('Cargo da equipe', draft.staffRoleId ? `<@&${draft.staffRoleId}>` : null, 'nao selecionado'),
    formatSetupField('Categoria de fechados', draft.closedCategoryId ? `<#${draft.closedCategoryId}>` : null, 'nao selecionada'),
    formatSetupField('Canal de logs', draft.logChannelId ? `<#${draft.logChannelId}>` : null, 'nao configurado'),
    '',
    readyToPublish
      ? 'Status: configuracao pronta para publicar ou atualizar o painel.'
      : 'Status: faltam campos obrigatorios para publicar o painel.',
  ].filter(Boolean);

  const container = new ContainerBuilder()
    .setAccentColor(parseAccentColor())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(summaryLines.join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket:setup:panel-channel')
          .setPlaceholder('Escolher canal do painel')
          .setChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(1)
          .setDefaultChannels(...(draft.panelChannelId ? [draft.panelChannelId] : [])),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket:setup:category')
          .setPlaceholder('Escolher categoria dos tickets')
          .setChannelTypes(ChannelType.GuildCategory)
          .setMinValues(1)
          .setMaxValues(1)
          .setDefaultChannels(...(draft.categoryId ? [draft.categoryId] : [])),
      ),
      new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('ticket:setup:staff')
          .setPlaceholder('Escolher cargo da equipe')
          .setMinValues(1)
          .setMaxValues(1)
          .setDefaultRoles(...(draft.staffRoleId ? [draft.staffRoleId] : [])),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket:setup:closed-category')
          .setPlaceholder('Escolher categoria de fechados')
          .setChannelTypes(ChannelType.GuildCategory)
          .setMinValues(1)
          .setMaxValues(1)
          .setDefaultChannels(...(draft.closedCategoryId ? [draft.closedCategoryId] : [])),
      ),
      new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('ticket:setup:logs')
          .setPlaceholder('Escolher canal de logs (opcional)')
          .setChannelTypes(ChannelType.GuildText)
          .setMinValues(0)
          .setMaxValues(1)
          .setDefaultChannels(...(draft.logChannelId ? [draft.logChannelId] : [])),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket:setup:clear-logs')
          .setLabel('Remover logs')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket:setup:publish')
          .setLabel('Publicar ou atualizar painel')
          .setStyle(ButtonStyle.Success),
      ),
    );

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [container],
    allowedMentions: {
      parse: [],
    },
  };
}

module.exports = {
  TICKET_TYPES,
  buildTicketControlMessage,
  buildTicketCreateModal,
  buildPortugueseTicketMenuMessage,
  buildTicketPanelMessage,
  buildTicketSetupMessage,
  buildTranscriptLogMessage,
  countOpenTickets,
  createManagedTicket,
  createGiveawayWinnerTicket,
  findOpenTicketByUser,
  getTicketLocale,
  getLocalizedModalFields,
  getLocalizedTicketTitle,
  formatTicketNumber,
  getGuildTicketConfig,
  getTicketRecord,
  getTicketType,
  removeTicketRecord,
  reserveTicketNumber,
  saveTicketRecord,
  setGuildTicketConfig,
  updateTicketRecord,
};
