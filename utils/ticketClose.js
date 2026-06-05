const { ChannelType } = require('discord.js');
const discordTranscripts = require('discord-html-transcripts');
const {
  buildTicketControlMessage,
  buildTranscriptLogMessage,
  formatTicketNumber,
  getTicketLocale,
  getLocalizedTicketTitle,
  getTicketRecord,
  getTicketType,
  removeTicketRecord,
  saveTicketRecord,
} = require('./tickets');

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

function buildTicketTopic(data) {
  return [
    `ticketOwner:${data.userId}`,
    `type:${data.type}`,
    `number:${data.number}`,
    `locale:${data.locale || 'pt-BR'}`,
    `status:${data.status || 'open'}`,
  ].join(' | ');
}

function getChannelTicketLocale(channel) {
  const topicData = parseTicketTopic(channel?.topic);
  if (topicData?.locale === 'en') return 'en';

  const ticketType = topicData?.type ? getTicketType(topicData.type) : null;
  return getTicketLocale(ticketType);
}

function extractTextDisplayContents(components = []) {
  const contents = [];

  for (const component of components) {
    if (!component) continue;

    if (typeof component.content === 'string') {
      contents.push(component.content);
    }

    if (component.accessory) {
      contents.push(...extractTextDisplayContents([component.accessory]));
    }

    if (Array.isArray(component.components)) {
      contents.push(...extractTextDisplayContents(component.components));
    }
  }

  return contents;
}

function collectComponentCustomIds(components = []) {
  const customIds = [];

  for (const component of components) {
    if (!component) continue;

    if (typeof component.customId === 'string') {
      customIds.push(component.customId);
    }

    if (component.accessory) {
      customIds.push(...collectComponentCustomIds([component.accessory]));
    }

    if (Array.isArray(component.components)) {
      customIds.push(...collectComponentCustomIds(component.components));
    }
  }

  return customIds;
}

function isTicketControlMessage(message) {
  if (!message?.components?.length) return false;

  const customIds = collectComponentCustomIds(message.components);
  return customIds.some((customId) => {
    return customId === 'ticket:claim' || customId === 'ticket:close' || customId === 'ticket:delete';
  });
}

function buildRecoveredTicketReason(locale) {
  return locale === 'en'
    ? 'Recovered ticket without a saved summary in the data file.'
    : 'Ticket recuperado sem resumo salvo no arquivo de dados.';
}

function extractTicketReasonFromControlMessage(message, locale) {
  const textBlocks = extractTextDisplayContents(message?.components ?? []);
  const detailsBlock = textBlocks.find((block) => {
    return block.startsWith('**Resumo do atendimento**') || block.startsWith('**Support summary**');
  }) || textBlocks.at(-1);

  if (!detailsBlock) {
    return buildRecoveredTicketReason(locale);
  }

  const lines = detailsBlock.split('\n');
  if (lines[0]?.startsWith('**')) {
    lines.shift();
  }

  const reason = lines.join('\n').trim();
  return reason || buildRecoveredTicketReason(locale);
}

function extractTicketClaimedByFromControlMessage(message) {
  const textBlocks = extractTextDisplayContents(message?.components ?? []);

  for (const block of textBlocks) {
    const responsibleLine = block
      .split('\n')
      .find((line) => line.startsWith('**Responsavel:**') || line.startsWith('**Assigned to:**'));

    if (!responsibleLine) continue;
    if (/aguardando equipe|waiting for staff/i.test(responsibleLine)) return null;

    const claimedByMatch = responsibleLine.match(/<@!?(\d+)>/);
    if (claimedByMatch) {
      return claimedByMatch[1];
    }
  }

  return null;
}

async function findTicketControlMessage(channel, options = {}) {
  if (isTicketControlMessage(options.message)) {
    return options.message;
  }

  if (options.controlMessageId) {
    const controlMessage = await channel.messages.fetch(options.controlMessageId).catch(() => null);
    if (isTicketControlMessage(controlMessage)) {
      return controlMessage;
    }
  }

  const recentMessages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recentMessages) return null;

  return recentMessages.find((message) => {
    return message.author?.id === channel.client.user?.id && isTicketControlMessage(message);
  }) || null;
}

async function rebuildTicketRecordFromChannel(channel, options = {}) {
  const topicData = parseTicketTopic(channel?.topic);
  if (!topicData?.ownerId || !topicData?.type) return null;

  const ticketType = getTicketType(topicData.type);
  const locale = topicData.locale === 'en' ? 'en' : getTicketLocale(ticketType);
  const controlMessage = await findTicketControlMessage(channel, options);
  const channelNumber = channel?.name?.match(/(\d+)(?!.*\d)/)?.[1] || null;
  const parsedNumber = Number.parseInt(topicData.number || channelNumber || '0', 10);
  const createdAt = channel?.createdAt instanceof Date
    ? channel.createdAt.toISOString()
    : new Date(channel?.createdTimestamp || Date.now()).toISOString();

  return {
    channelId: channel.id,
    controlMessageId: controlMessage?.id || options.controlMessageId || null,
    createdAt,
    guildId: channel.guildId,
    locale,
    number: Number.isNaN(parsedNumber) ? 0 : parsedNumber,
    reason: extractTicketReasonFromControlMessage(controlMessage, locale),
    type: topicData.type,
    userId: topicData.ownerId,
    claimedBy: extractTicketClaimedByFromControlMessage(controlMessage),
  };
}

async function resolveTicketRecordFromChannel(channel, options = {}) {
  const storedTicket = getTicketRecord(channel.id);
  if (storedTicket) return storedTicket;

  const recoveredTicket = await rebuildTicketRecordFromChannel(channel, options);
  if (!recoveredTicket) return null;

  if (!options.persist) {
    return recoveredTicket;
  }

  return saveTicketRecord(recoveredTicket);
}

async function closeTicketChannel(options) {
  const channel = options.channel;
  const guildConfig = options.guildConfig;
  const ticket = options.ticket || await resolveTicketRecordFromChannel(channel, {
    message: options.interactionMessage || null,
    persist: true,
  });

  if (!ticket) {
    return {
      ok: false,
      code: 'ticket_unavailable',
      locale: getChannelTicketLocale(channel),
    };
  }

  const locale = getTicketLocale(ticket);
  const ticketType = getTicketType(ticket.type);
  const closedCategory = guildConfig.closedCategoryId
    ? channel.guild.channels.cache.get(guildConfig.closedCategoryId)
      || await channel.guild.channels.fetch(guildConfig.closedCategoryId).catch(() => null)
    : null;

  if (!closedCategory || closedCategory.type !== ChannelType.GuildCategory) {
    return {
      ok: false,
      code: 'close_category_invalid',
      locale,
      ticket,
    };
  }

  const closedAt = new Date().toISOString();

  try {
    const logChannel = guildConfig.logChannelId
      ? channel.guild.channels.cache.get(guildConfig.logChannelId)
        || await channel.guild.channels.fetch(guildConfig.logChannelId).catch(() => null)
      : null;

    if (logChannel?.isTextBased()) {
      const transcript = await discordTranscripts.createTranscript(channel, {
        filename: `${channel.name}.html`,
        footerText: 'Exportado {number} mensagem{s}.',
        poweredBy: false,
      });

      await logChannel.send({
        ...buildTranscriptLogMessage({
          authorId: ticket.userId,
          categoryName: ticketType ? getLocalizedTicketTitle(ticketType, locale) : ticket.type,
          channelName: channel.name,
          claimedById: ticket.claimedBy,
          closedById: options.actorId,
          closedAt,
          fileName: transcript.name,
          guildIconUrl: channel.guild.iconURL({ size: 256 }),
          guildName: channel.guild.name,
          ticketNumber: ticket.number,
        }),
        files: [transcript],
      }).catch((error) => {
        console.error('[Erro ao enviar transcript]:', error);
      });
    }
  } catch (error) {
    console.error('[Erro ao gerar transcript]:', error);
  }

  try {
    const closedTicket = {
      ...ticket,
      closedAt,
      closedBy: options.actorId,
    };
    const archivedName = `closed-${ticketType ? ticketType.slug : ticket.type}-${formatTicketNumber(ticket.number)}`;

    if (ticket.controlMessageId) {
      const controlMessage = await channel.messages.fetch(ticket.controlMessageId).catch(() => null);
      if (controlMessage) {
        await controlMessage.edit(
          buildTicketControlMessage(closedTicket, guildConfig, { isClosed: true }),
        ).catch((error) => {
          console.error('[Erro ao editar painel do ticket fechado]:', error);
        });
      }
    }

    await channel.permissionOverwrites.edit(ticket.userId, {
      SendMessages: false,
      AddReactions: false,
      AttachFiles: false,
    }).catch((error) => {
      console.error('[Erro ao travar canal para o usuario]:', error);
    });

    await channel.setName(archivedName).catch((error) => {
      console.error('[Erro ao renomear ticket fechado]:', error);
    });

    await channel.setParent(guildConfig.closedCategoryId, {
      lockPermissions: false,
    }).catch((error) => {
      console.error('[Erro ao mover ticket fechado]:', error);
    });

    await channel.setTopic(buildTicketTopic({
      userId: ticket.userId,
      type: ticket.type,
      number: ticket.number,
      locale: ticket.locale,
      status: 'closed',
    })).catch((error) => {
      console.error('[Erro ao atualizar topico do ticket fechado]:', error);
    });

    removeTicketRecord(channel.id);

    return {
      ok: true,
      code: 'closed',
      locale,
      ticket: closedTicket,
      closedCategory,
    };
  } catch (error) {
    console.error('[Erro ao arquivar ticket]:', error);
    return {
      ok: false,
      code: 'close_failed_archive',
      locale,
      ticket,
    };
  }
}

module.exports = {
  closeTicketChannel,
  getChannelTicketLocale,
  parseTicketTopic,
  resolveTicketRecordFromChannel,
};
