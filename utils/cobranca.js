const fs = require('fs');
const path = require('path');
const {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} = require('discord.js');

const DM_COLOR = 0xf1c40f;
const SUCCESS_COLOR = 0x2ecc71;
const ERROR_COLOR = 0xe74c3c;
const PROOF_COLOR = 0x3498db;
const DATA_DIR = path.join(__dirname, '..', 'data', 'cobranca');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const DEFAULT_FORWARD_USER_ID = '1411202571804348507';
const BILLING_FORWARD_WINDOW_DAYS = 15;

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(STATE_FILE)) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({ billings: {} }, null, 2));
  }
}

function readState() {
  ensureStore();

  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch (error) {
    return { billings: {} };
  }
}

function writeState(state) {
  ensureStore();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function truncateText(value, maxLength = 1200) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function resolveFlags(ephemeral) {
  return ephemeral
    ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    : MessageFlags.IsComponentsV2;
}

function buildContainerMessage({
  title,
  subtitle,
  color,
  blocks = [],
  ephemeral = true,
  thumbnailUrl = '',
  thumbnailDescription = 'Bot icon',
}) {
  const container = new ContainerBuilder()
    .setAccentColor(color);

  if (thumbnailUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            `# ${title}`,
            subtitle,
          ].filter(Boolean).join('\n')),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(thumbnailUrl)
            .setDescription(thumbnailDescription),
        ),
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${title}`,
        subtitle,
      ].filter(Boolean).join('\n')),
    );
  }

  for (const block of blocks) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(block),
      );
  }

  return {
    flags: resolveFlags(ephemeral),
    components: [container],
    allowedMentions: {
      parse: [],
    },
  };
}

function buildBillingDmPayload({ user, guildName, amountLabel, pixKey, senderTag, botAvatarUrl }) {
  return buildContainerMessage({
    title: 'Cobranca da mensalidade do bot',
    subtitle: `Ola, ${user.username}. Esta mensagem contem os dados para pagamento da mensalidade do bot.`,
    color: DM_COLOR,
    ephemeral: false,
    thumbnailUrl: botAvatarUrl,
    thumbnailDescription: 'Avatar do bot',
    blocks: [
      [
        '**Resumo da cobranca**',
        `Servidor: ${guildName}`,
        `Valor: ${amountLabel}`,
        'Referente a: Mensalidade do bot',
        `Enviado por: ${senderTag}`,
      ].join('\n'),
      [
        '**PIX para pagamento**',
        '```',
        pixKey,
        '```',
      ].join('\n'),
      [
        '**Importante**',
        'Assim que fizer o pagamento, envie o comprovante aqui na DM do bot.',
        'O comprovante sera encaminhado automaticamente para a equipe responsavel.',
      ].join('\n'),
    ],
  });
}

function buildCommandStatusPayload({ title, subtitle, lines, color }) {
  return buildContainerMessage({
    title,
    subtitle,
    color,
    ephemeral: true,
    blocks: [
      lines.join('\n'),
    ],
  });
}

function resolveForwardUserId() {
  const envValue = String(process.env.COBRANCA_FORWARD_USER_ID || '').trim();
  return envValue || DEFAULT_FORWARD_USER_ID;
}

function isBillingForwardWindowActive(entry) {
  if (!entry?.sentAt) return false;

  const sentAt = new Date(entry.sentAt);
  if (Number.isNaN(sentAt.getTime())) return false;

  const expiresAt = sentAt.getTime() + (BILLING_FORWARD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return Date.now() <= expiresAt;
}

function registerBillingRequest({
  recipientUserId,
  guildId,
  guildName,
  amount,
  senderUserId,
  senderTag,
}) {
  const state = readState();

  state.billings[recipientUserId] = {
    recipientUserId,
    guildId: guildId || null,
    guildName: guildName || null,
    amount,
    amountLabel: formatCurrency(amount),
    senderUserId,
    senderTag,
    status: 'pending',
    sentAt: new Date().toISOString(),
    completedAt: null,
  };

  writeState(state);
  return state.billings[recipientUserId];
}

function getPendingBillingRequest(recipientUserId) {
  const state = readState();
  const entry = state.billings?.[recipientUserId];

  if (!entry) return null;
  if (!isBillingForwardWindowActive(entry)) return null;
  return entry;
}

function markBillingRequestCompleted(recipientUserId) {
  const state = readState();
  const entry = state.billings?.[recipientUserId];

  if (!entry) return null;

  entry.status = 'completed';
  entry.completedAt = new Date().toISOString();
  entry.lastProofAt = new Date().toISOString();
  entry.proofCount = Number(entry.proofCount || 0) + 1;
  writeState(state);
  return entry;
}

function buildForwardableAttachments(message) {
  return Array.from(message.attachments.values()).map((attachment, index) => {
    const baseName = attachment.name || `comprovante-${index + 1}`;
    const name = `${index + 1}-${baseName}`;

    return {
      attachment,
      name,
      file: new AttachmentBuilder(attachment.proxyURL || attachment.url, {
        name,
        description: attachment.description || undefined,
      }),
    };
  });
}

function buildProofForwardPayload({ billing, message, botAvatarUrl }) {
  const attachments = buildForwardableAttachments(message);
  const attachmentCount = attachments.length;
  const content = truncateText(message.content, 900);
  const imageAttachments = attachments.filter(({ attachment }) => attachment.contentType?.startsWith('image/'));

  const container = new ContainerBuilder()
    .setAccentColor(PROOF_COLOR)
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent([
            '# Novo comprovante recebido',
            `O usuario ${message.author.tag} enviou um comprovante pela DM do bot.`,
          ].join('\n')),
        )
        .setThumbnailAccessory(
          new ThumbnailBuilder()
            .setURL(message.author.displayAvatarURL({ extension: 'png', size: 256 }) || botAvatarUrl)
            .setDescription(`Avatar de ${message.author.tag}`),
        ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Dados da cobranca**',
        `Cliente: ${message.author.tag}`,
        `Cliente ID: ${message.author.id}`,
        `Servidor: ${billing.guildName || 'Nao informado'}`,
        `Valor: ${billing.amountLabel || formatCurrency(billing.amount || 0)}`,
        `Cobranca enviada por: ${billing.senderTag || billing.senderUserId || 'Nao informado'}`,
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Mensagem do cliente**',
        content || 'Sem texto. O cliente enviou apenas arquivo(s).',
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '**Arquivos anexados**',
        attachmentCount > 0
          ? `${attachmentCount} arquivo(s) enviado(s) junto com a mensagem.`
          : 'Nenhum arquivo anexado. Apenas mensagem em texto.',
        ...attachments.map(({ name }) => `- ${name}`),
      ].join('\n')),
    );

  if (imageAttachments.length > 0) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          ...imageAttachments.map(({ name }) => (
            new MediaGalleryItemBuilder()
              .setURL(`attachment://${name}`)
              .setDescription(`Comprovante ${name}`)
          )),
        ),
      );
  }

  return {
    flags: resolveFlags(false),
    components: [container],
    files: attachments.map(({ file }) => file),
    allowedMentions: {
      parse: [],
    },
  };
}

function buildProofAckPayload() {
  return buildContainerMessage({
    title: 'Comprovante recebido',
    subtitle: 'Seu comprovante foi encaminhado para a equipe responsavel.',
    color: SUCCESS_COLOR,
    ephemeral: false,
    blocks: [
      [
        '**Proximo passo**',
        'Agora e so aguardar a confirmacao da equipe.',
      ].join('\n'),
    ],
  });
}

function buildProofForwardErrorPayload() {
  return buildContainerMessage({
    title: 'Falha ao encaminhar comprovante',
    subtitle: 'Nao consegui encaminhar seu comprovante para a equipe agora.',
    color: ERROR_COLOR,
    ephemeral: false,
    blocks: [
      [
        '**Tente novamente**',
        'Envie o comprovante novamente em alguns instantes.',
      ].join('\n'),
    ],
  });
}

function buildProofAttachmentPromptPayload() {
  return buildContainerMessage({
    title: 'Envie o comprovante',
    subtitle: 'Recebi sua mensagem, mas preciso do comprovante para encaminhar para a equipe.',
    color: DM_COLOR,
    ephemeral: false,
    blocks: [
      [
        '**Como enviar**',
        'Mande uma imagem, PDF ou link do comprovante aqui nesta DM.',
      ].join('\n'),
    ],
  });
}

module.exports = {
  buildBillingDmPayload,
  buildCommandStatusPayload,
  buildProofAttachmentPromptPayload,
  buildProofAckPayload,
  buildProofForwardErrorPayload,
  buildProofForwardPayload,
  formatCurrency,
  getPendingBillingRequest,
  markBillingRequestCompleted,
  registerBillingRequest,
  resolveForwardUserId,
};
