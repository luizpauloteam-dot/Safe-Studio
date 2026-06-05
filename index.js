const { ActivityType, Client, EmbedBuilder, Events, IntentsBitField, Partials, InteractionType } = require('discord.js');
const { startTebexServer } = require('./utils/tebexServer');
const {
  getClaimSnapshotForDiscord,
  processClaimForMember,
} = require('./utils/claimFlow');
const {
  buildClaimErrorMessage,
  buildClaimResultMessage,
  buildClaimStatusMessage,
} = require('./utils/claimPanel');
const {
  buildProofAckPayload,
  buildProofAttachmentPromptPayload,
  buildProofForwardErrorPayload,
  buildProofForwardPayload,
  getPendingBillingRequest,
  markBillingRequestCompleted,
  resolveForwardUserId,
} = require('./utils/cobranca');
const {
  handleSelfBotTrapMessage,
  startSelfBotRoleRemovalScheduler,
} = require('./utils/selfBotTrap');
const { buildTebexPanelMessage } = require('./utils/tebexPanel');
const { TEBEX_EVENTS, tebexEvents } = require('./utils/tebexEvents');
const config = require('./config');

const CHANNEL_ID = null; // Canal para receber os logs
const CLIENT_ROLE_COUNT_REFRESH_MS = 5 * 60 * 1000;

console.clear();

const client = new Client({
  intents: [
    IntentsBitField.Flags.DirectMessages,
    IntentsBitField.Flags.GuildInvites,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildPresences,
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.GuildEmojisAndStickers,
    IntentsBitField.Flags.GuildVoiceStates,
  ],
  partials: [
    Partials.User,
    Partials.Message,
    Partials.Reaction,
    Partials.Channel,
    Partials.GuildMember,
  ],
});

function getRamUsageText() {
  const ramInMb = process.memoryUsage().rss / 1024 / 1024;
  return `RAM: ${ramInMb.toFixed(1)} MB`;
}

function getUptimeText() {
  const totalSeconds = Math.floor(process.uptime());
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `Uptime: ${hours}h ${minutes}m`;
  return `Uptime: ${minutes}m`;
}

async function resolvePresenceClientRole() {
  const roleId = config.discord.presenceClientRoleId;
  if (!roleId) return null;

  const cachedRoleRef = client.presenceClientRoleRef;
  if (cachedRoleRef) {
    const guild = client.guilds.cache.get(cachedRoleRef.guildId);
    const cachedRole = guild?.roles.cache.get(roleId)
      || await guild?.roles.fetch(roleId).catch(() => null);

    if (cachedRole) {
      return cachedRole;
    }
  }

  for (const guild of client.guilds.cache.values()) {
    const role = guild.roles.cache.get(roleId)
      || await guild.roles.fetch(roleId).catch(() => null);

    if (role) {
      client.presenceClientRoleRef = {
        guildId: guild.id,
        roleId: role.id,
      };
      return role;
    }
  }

  return null;
}

async function getClientRoleMemberCount() {
  const matchedRole = await resolvePresenceClientRole();
  if (!matchedRole) return 0;

  const now = Date.now();
  const lastSyncAt = client.presenceClientRoleMembersSyncedAt ?? 0;

  try {
    if (!lastSyncAt || (now - lastSyncAt) >= CLIENT_ROLE_COUNT_REFRESH_MS) {
      await matchedRole.guild.members.fetch();
      client.presenceClientRoleMembersSyncedAt = now;
    }
  } catch (error) {
    console.warn('[Presence] Nao consegui atualizar o cache de membros para contar clientes:', error.message);
  }

  return matchedRole.members.size;
}

async function getPresenceOptions() {
  return [
    {
      name: getRamUsageText(),
      type: ActivityType.Watching,
    },
    {
      name: `${await getClientRoleMemberCount()} clientes`,
      type: ActivityType.Watching,
    },
    {
      name: getUptimeText(),
      type: ActivityType.Playing,
    },
  ];
}

async function updateBotPresence() {
  if (!client.user) return;

  if (client.presenceUpdateRunning) return;
  client.presenceUpdateRunning = true;

  try {
    const presenceOptions = await getPresenceOptions();
    client.presenceIndex = (client.presenceIndex ?? 0) % presenceOptions.length;
    const presence = presenceOptions[client.presenceIndex];

    client.user.setPresence({
      activities: [
        presence,
      ],
      status: 'online',
    });

    client.presenceIndex += 1;
  } catch (error) {
    console.error('[Presence] Falha ao atualizar status do bot:', error);
  } finally {
    client.presenceUpdateRunning = false;
  }
}

// Evento ready
client.once(Events.ClientReady, () => {
  try {
    console.log('Bot started successfully!');
    console.log(`Logged in as: ${client.user.tag}`);
    console.log(`ID: ${client.user.id}`);
    console.log(`Connected to ${client.guilds.cache.size} servers!`);
    updateBotPresence();
    setInterval(updateBotPresence, 10 * 1000);
    startSelfBotRoleRemovalScheduler(client);
  } catch (error) {
    console.error('[Erro no evento ready]:', error.message);
  }
});

// Carrega handlers de comandos e eventos
try {
  require('./Handler/commands')(client);
  require('./Handler/events')(client);
} catch (error) {
  console.error('[Erro ao carregar handlers]:', error);
}

// Lida com interacoes de comandos de barra e botoes administrativos
function parseTebexPanelCustomId(customId) {
  const parts = String(customId || '').split(':');
  if (parts.length !== 4) return null;

  if (parts[0] !== 'tebex' || parts[1] !== 'panel') return null;

  const action = parts[2];
  const ownerId = parts[3];

  if (!['overview', 'keys', 'refresh', 'refresh-overview', 'refresh-keys'].includes(action)) return null;

  return {
    action,
    ownerId,
  };
}

function parseClaimPanelCustomId(customId) {
  const parts = String(customId || '').split(':');
  if (parts.length !== 3) return null;

  if (parts[0] !== 'claim' || parts[1] !== 'panel') return null;

  const action = parts[2];
  if (!['status', 'redeem'].includes(action)) return null;

  return {
    action,
  };
}

async function handleClaimPanelInteraction(interaction) {
  if (!interaction.isButton()) return false;

  const parsed = parseClaimPanelCustomId(interaction.customId);
  if (!parsed) return false;

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: 'Use o painel de claim dentro de um servidor.',
      ephemeral: true,
    }).catch(() => {});
    return true;
  }

  const botAvatarUrl = interaction.client.user?.displayAvatarURL({ size: 256 }) || '';

  await interaction.deferReply({ ephemeral: true });

  try {
    if (parsed.action === 'status') {
      const snapshot = await getClaimSnapshotForDiscord(interaction.user.id);

      await interaction.editReply(
        await buildClaimStatusMessage(snapshot, {
          ephemeral: true,
          includeBanner: false,
          botAvatarUrl,
        }),
      );
      return true;
    }

    const result = await processClaimForMember({
      guild: interaction.guild,
      userId: interaction.user.id,
      member: interaction.member,
    });

    await interaction.editReply(
      await buildClaimResultMessage(result, {
        ephemeral: true,
        includeBanner: false,
        botAvatarUrl,
      }),
    );
  } catch (error) {
    console.error('[Claim Panel] Falha ao processar interacao:', error);
    await interaction.editReply(
      await buildClaimErrorMessage(
        'Nao consegui consultar seu claim agora. Tente novamente em alguns segundos.',
        {
          ephemeral: true,
          includeBanner: false,
          botAvatarUrl,
        },
      ),
    ).catch(() => {});
  }

  return true;
}

async function handleTebexPanelInteraction(interaction) {
  if (!interaction.isButton()) return false;

  const parsed = parseTebexPanelCustomId(interaction.customId);
  if (!parsed) return false;

  if (parsed.ownerId && parsed.ownerId !== interaction.user.id) {
    await interaction.reply({
      content: 'Este painel pertence a outro administrador. Rode /tebex-panel para abrir o seu.',
      ephemeral: true,
    }).catch(() => {});
    return true;
  }

  const mode = (parsed.action === 'keys' || parsed.action === 'refresh-keys') ? 'keys' : 'overview';

  try {
    const panelMessage = await buildTebexPanelMessage(interaction.user.id, {
      mode,
      ephemeral: false,
    });

    await interaction.update(panelMessage);
  } catch (error) {
    console.error('[Tebex Panel] Erro ao atualizar painel:', error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: 'Falha ao atualizar painel Tebex agora.',
        components: [],
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: 'Falha ao atualizar painel Tebex agora.',
        ephemeral: true,
      }).catch(() => {});
    }
  }

  return true;
}

client.on(Events.InteractionCreate, async (interaction) => {
  const handledClaimPanel = await handleClaimPanelInteraction(interaction);
  if (handledClaimPanel) return;

  const handledTebexPanel = await handleTebexPanelInteraction(interaction);
  if (handledTebexPanel) return;

  if (interaction.type === InteractionType.ApplicationCommand) {
    const command = client.slashCommands.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: 'Algo deu errado! Comando nao encontrado.', ephemeral: true }).catch(() => {});
      return;
    }

    try {
      await command.run(client, interaction);
    } catch (error) {
      console.error(`[Erro ao executar comando ${interaction.commandName}]:`, error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Erro ao executar o comando!', ephemeral: true }).catch(() => {});
      }
    }
  }
});
function formatNotificationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || '-');
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function truncateText(value, maxLength = 1024) {
  const text = String(value ?? '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

async function handleBillingProofMessage(message) {
  if (message.guildId) return false;

  const pendingBilling = getPendingBillingRequest(message.author.id);
  if (!pendingBilling) return false;

  const messageText = String(message.content || '').trim();
  const hasAttachment = message.attachments.size > 0;
  const hasLink = /https?:\/\/\S+/i.test(messageText);

  if (!hasAttachment && !hasLink) {
    await message.channel.send(
      buildProofAttachmentPromptPayload(),
    ).catch(() => {});
    return true;
  }

  const forwardUserId = resolveForwardUserId();
  const forwardUser = client.users.cache.get(forwardUserId)
    || await client.users.fetch(forwardUserId).catch(() => null);

  if (!forwardUser) {
    console.warn(`[cobranca] Usuario de destino para comprovantes nao encontrado: ${forwardUserId}`);
    await message.channel.send(
      buildProofForwardErrorPayload(),
    ).catch(() => {});
    return true;
  }

  try {
    await forwardUser.send(
      buildProofForwardPayload({
        billing: pendingBilling,
        message,
        botAvatarUrl: client.user?.displayAvatarURL({ size: 256 }) || '',
      }),
    );

    markBillingRequestCompleted(message.author.id);

    await message.channel.send(
      buildProofAckPayload(),
    ).catch(() => {});
  } catch (error) {
    console.error('[cobranca] Falha ao encaminhar comprovante:', error);
    await message.channel.send(
      buildProofForwardErrorPayload(),
    ).catch(() => {});
  }

  return true;
}

async function sendTebexPurchaseNotification(payload) {
  const channelId = String(config.discord?.tebexPurchaseChannelId || '').trim();
  if (!channelId) return;

  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased()) {
    console.warn(`[Tebex] Canal de compras invalido ou inacessivel: ${channelId}`);
    return;
  }

  const packageNames = Array.isArray(payload?.packages) && payload.packages.length > 0
    ? payload.packages.map((item) => item.name || item.id).filter(Boolean).join(', ')
    : '-';
  const amountLabel = [payload?.amount || '-', payload?.currency || ''].filter(Boolean).join(' ');

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('Nova compra Tebex')
    .setDescription('Uma nova compra foi confirmada e registrada no armazenamento local.')
    .addFields(
      {
        name: 'Player',
        value: truncateText(payload?.playerName || '-', 1024),
        inline: true,
      },
      {
        name: 'Pagamento',
        value: truncateText(payload?.paymentId || '-', 1024),
        inline: true,
      },
      {
        name: 'Valor',
        value: truncateText(amountLabel || '-', 1024),
        inline: true,
      },
      {
        name: 'Discord ID',
        value: truncateText(payload?.discordId || '-', 1024),
        inline: true,
      },
      {
        name: 'Pacotes',
        value: truncateText(packageNames, 1024),
        inline: false,
      },
      {
        name: 'Registro local',
        value: `Novos: ${Number(payload?.created || 0)} | Atualizados: ${Number(payload?.updated || 0)}`,
        inline: false,
      },
      {
        name: 'Data UTC',
        value: formatNotificationDate(payload?.date),
        inline: false,
      },
    )
    .setTimestamp(new Date());

  await channel.send({
    embeds: [embed],
    allowedMentions: {
      parse: [],
    },
  });
}

tebexEvents.on(TEBEX_EVENTS.PAYMENT_COMPLETED, (payload) => {
  void sendTebexPurchaseNotification(payload).catch((error) => {
    console.error('[Tebex] Falha ao enviar notificacao de compra:', error);
  });
});

// Inicializa o servidor HTTP (site + APIs + webhook Tebex)
let tebexServer = null;

try {
  tebexServer = startTebexServer();
} catch (error) {
  console.error('[Erro ao iniciar servidor Tebex]:', error);
}

// Login do bot
client.login(config.discord.token).catch((error) => {
  console.error('[Erro ao fazer login]:', error);
});

// Tratamento de erros globais
process.on('unhandledRejection', (reason, promise) => {
  console.error('[unhandledRejection]', reason, promise);
});

process.on('uncaughtException', (err, origin) => {
  console.error('[uncaughtException]', err, origin);
});

process.on('uncaughtExceptionMonitor', (err, origin) => {
  console.error('[uncaughtExceptionMonitor]', err, origin);
});

// Funcao para enviar logs ao Discord
function enviarLog(type, ...args) {
  const canal = client.channels.cache.get(CHANNEL_ID);
  if (!canal) return;

  const mensagem = args.map((arg) => {
    if (typeof arg === 'object') {
      try {
        return '```json\n' + JSON.stringify(arg, null, 2) + '\n```';
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');

  canal.send(`[${type.toUpperCase()}] ${mensagem}`).catch(() => {});
}

// Sobrescrevendo console
['log', 'warn', 'error', 'info'].forEach((type) => {
  const original = console[type];
  console[type] = (...args) => {
    original(...args); // continua mostrando no terminal
    enviarLog(type, ...args);
  };
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const handledSelfBotTrap = await handleSelfBotTrapMessage(message, client);
    if (handledSelfBotTrap) return;
  } catch (error) {
    console.error('[selfbot] Falha ao processar canal anti self-bot:', error);
  }

  const handledBillingProof = await handleBillingProofMessage(message);
  if (handledBillingProof) return;

  if (message.content.startsWith('!say')) {
    const text = message.content.slice(4).trim();

    // Deleta a mensagem original
    await message.delete().catch(() => {});

    if (!text && message.attachments.size === 0) {
      return message.channel.send({
        content: 'Por favor, envie um texto ou uma imagem junto com o comando.',
      });
    }

    const attachment = message.attachments.first();

    try {
      if (attachment && attachment.contentType?.startsWith('image/')) {
        await message.channel.send({
          content: text || 'foto', // caso so tenha imagem
          files: [attachment.url],
        });
      } else {
        await message.channel.send({ content: text });
      }
    } catch (err) {
      console.error('Erro ao reenviar a mensagem:', err);
      return message.channel.send('Ocorreu um erro ao tentar reenviar a mensagem.');
    }
  }
});

module.exports = { client, tebexServer };

client.transcripts = new Map();
client.jogadorNaFila = null; // Depois de criar o client





