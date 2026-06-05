const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} = require('discord.js');
const config = require('../config');
const { getCategories } = require('./tebexClient');
const { getTebexDashboardData, getTebexStoragePath } = require('./tebexPurchases');

function maskSecret(secret) {
  const value = String(secret || '').trim();
  if (!value) return '[AUSENTE]';
  if (value.length <= 8) return '[CONFIGURADA]';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function statusLabel(isOk, okText = 'OK', failText = 'AUSENTE') {
  return isOk ? `[${okText}]` : `[${failText}]`;
}

function shortValue(value, maxLength = 90) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function formatDate(value) {
  if (!value) return '-';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function parseCategoriesPayload(rawData) {
  if (Array.isArray(rawData)) return rawData;
  if (Array.isArray(rawData?.categories)) return rawData.categories;
  return [];
}

function countPackages(categories) {
  return categories.reduce((total, category) => {
    const list = Array.isArray(category?.packages) ? category.packages : [];
    return total + list.length;
  }, 0);
}

async function loadApiSummary() {
  const publicToken = String(config.tebex?.publicToken || '').trim();

  if (!publicToken) {
    return {
      ok: false,
      skipped: true,
      message: 'TEBEX_PUBLIC_TOKEN nao configurado.',
      categoryCount: 0,
      packageCount: 0,
    };
  }

  try {
    const raw = await getCategories({ includePackages: 1 });
    const categories = parseCategoriesPayload(raw);

    return {
      ok: true,
      skipped: false,
      message: `Categorias ${categories.length} | Pacotes ${countPackages(categories)}`,
      categoryCount: categories.length,
      packageCount: countPackages(categories),
    };
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      message: shortValue(error?.message || 'Falha ao validar API Tebex.'),
      categoryCount: 0,
      packageCount: 0,
    };
  }
}

async function loadStorageSummary() {
  try {
    const data = await getTebexDashboardData({ limit: 7 });

    return {
      ok: true,
      message: 'Leitura do armazenamento local concluida.',
      data,
    };
  } catch (error) {
    return {
      ok: false,
      message: shortValue(error?.message || 'Falha na leitura do armazenamento local.'),
      data: null,
    };
  }
}

async function loadPanelSnapshot() {
  const roleMap = config.tebex?.packageRoleMap || {};
  const [apiSummary, storageSummary] = await Promise.all([
    loadApiSummary(),
    loadStorageSummary(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    keys: {
      publicToken: String(config.tebex?.publicToken || '').trim(),
      privateKey: String(config.tebex?.privateKey || '').trim(),
      pluginSecret: String(config.tebex?.pluginSecret || '').trim(),
      webhookSecret: String(config.tebex?.webhookSecret || '').trim(),
      storagePath: getTebexStoragePath(),
      webhookPath: String(config.tebex?.webhookPath || '/webhooks/tebex').trim(),
      roleMappings: Object.keys(roleMap).length,
    },
    apiSummary,
    storageSummary,
  };
}

function buildLatestPurchasesSection(snapshot) {
  const rows = snapshot.storageSummary?.data?.latestPurchases || [];

  if (rows.length === 0) {
    return '**Compras recentes**\n- Nenhum registro ainda.';
  }

  const lines = rows.map((item) => {
    const paymentId = shortValue(item.payment_id || '-', 18);
    const packageId = shortValue(item.package_id || '-', 12);
    const discordId = item.discord_id || '-';
    const status = item.status || '-';
    const claimed = item.claimed ? 'sim' : 'nao';

    return `- pgto:${paymentId} | pkg:${packageId} | dc:${discordId} | status:${status} | claim:${claimed}`;
  });

  return ['**Compras recentes**', ...lines].join('\n');
}

function buildTopPackagesSection(snapshot) {
  const rows = snapshot.storageSummary?.data?.topPackages || [];

  if (rows.length === 0) {
    return '**Pacotes em destaque**\n- Sem vendas concluidas ainda.';
  }

  const lines = rows.map((item) => {
    const label = shortValue(item.package_name || item.package_id, 40);
    return `- ${label} (${item.package_id}) -> ${item.count}`;
  });

  return ['**Pacotes em destaque**', ...lines].join('\n');
}

function buildConnectivitySection(snapshot) {
  const storage = snapshot.storageSummary;
  const api = snapshot.apiSummary;

  const lines = [
    '**Conectividade**',
    `Armazenamento local: ${statusLabel(storage.ok)} ${storage.message}`,
    `Tebex API: ${statusLabel(api.ok, 'OK', api.skipped ? 'PULADO' : 'ERRO')} ${api.message}`,
  ];

  return lines.join('\n');
}

function buildKeysSection(snapshot) {
  const keys = snapshot.keys;

  const lines = [
    '**Ambiente e chaves**',
    `TEBEX_PUBLIC_TOKEN: ${statusLabel(Boolean(keys.publicToken))} ${maskSecret(keys.publicToken)}`,
    `TEBEX_PRIVATE_KEY: ${statusLabel(Boolean(keys.privateKey), 'OK', 'OPCIONAL')} ${maskSecret(keys.privateKey)}`,
    `TEBEX_PLUGIN_SECRET: ${statusLabel(Boolean(keys.pluginSecret), 'OK', 'OPCIONAL')} ${maskSecret(keys.pluginSecret)}`,
    `TEBEX_WEBHOOK_SECRET: ${statusLabel(Boolean(keys.webhookSecret))} ${maskSecret(keys.webhookSecret)}`,
    `Arquivo local: ${shortValue(keys.storagePath, 110)}`,
    `Path do webhook: ${keys.webhookPath || '/webhooks/tebex'}`,
    `Mapeamentos de cargo carregados: ${keys.roleMappings}`,
  ];

  return lines.join('\n');
}

function buildPurchaseStatsSection(snapshot) {
  const counts = snapshot.storageSummary?.data?.counts;

  if (!snapshot.storageSummary?.ok || !counts) {
    return '**Metricas de compras**\n- Metricas indisponiveis enquanto o arquivo local estiver inacessivel.';
  }

  const lines = [
    '**Metricas de compras**',
    `Total de registros de compra: ${counts.total}`,
    `Claims pendentes: ${counts.pendingClaims}`,
    `Claims concluidos: ${counts.claimed}`,
    `Reembolsados: ${counts.refunded}`,
    `Em disputa: ${counts.disputed}`,
  ];

  return lines.join('\n');
}

function resolveAccentColor(snapshot) {
  if (snapshot.storageSummary.ok && snapshot.apiSummary.ok) return 0x00a86b;
  if (!snapshot.storageSummary.ok) return 0xd9534f;
  return 0xf0ad4e;
}

async function buildTebexPanelMessage(ownerUserId, options = {}) {
  const mode = options.mode === 'keys' ? 'keys' : 'overview';
  const ephemeral = options.ephemeral !== false;
  const snapshot = await loadPanelSnapshot();

  const container = new ContainerBuilder()
    .setAccentColor(resolveAccentColor(snapshot))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(buildKeysSection(snapshot)),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(buildConnectivitySection(snapshot)),
    );

  if (mode === 'overview') {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(buildPurchaseStatsSection(snapshot)),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(buildLatestPurchasesSection(snapshot)),
      )
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(buildTopPackagesSection(snapshot)),
      );
  } else {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setDivider(true),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent([
          '**Checklist de chaves**',
          '1. Confirme que todas as chaves obrigatorias estao [OK].',
          '2. Confirme que o armazenamento local e a Tebex API estao saudaveis.',
          '3. Garanta que o path do webhook no painel Tebex e o mesmo mostrado acima.',
        ].join('\n')),
      );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tebex:panel:overview:${ownerUserId}`)
        .setLabel('Visao geral')
        .setStyle(mode === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`tebex:panel:keys:${ownerUserId}`)
        .setLabel('Chaves')
        .setStyle(mode === 'keys' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`tebex:panel:refresh:${ownerUserId}`)
        .setLabel('Atualizar')
        .setStyle(ButtonStyle.Success),
    ),
  );

  const flags = ephemeral
    ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
    : MessageFlags.IsComponentsV2;

  return {
    flags,
    components: [container],
    allowedMentions: {
      parse: [],
    },
  };
}

module.exports = {
  buildTebexPanelMessage,
};
