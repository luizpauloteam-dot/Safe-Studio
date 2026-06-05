const {
  ApplicationCommandOptionType,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const {
  disableGuildSelfBotConfig,
  formatPunishment,
  getGuildSelfBotConfig,
  getMissingSelfBotSetupPermissions,
  normalizeSelfBotAction,
  normalizeTimeoutMinutes,
  publishSelfBotWarning,
  setGuildSelfBotConfig,
} = require('../../utils/selfBotTrap');

const SUCCESS_COLOR = 0x2ecc71;
const ERROR_COLOR = 0xe74c3c;
const INFO_COLOR = 0x3498db;
const TEXT_CHANNEL_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
];

function buildStatusEmbed({ title, description, color, fields = [] }) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp(new Date());

  if (fields.length) {
    embed.addFields(fields);
  }

  return embed;
}

function buildReply({ title, description, color, fields = [] }) {
  return {
    embeds: [
      buildStatusEmbed({
        title,
        description,
        color,
        fields,
      }),
    ],
    allowedMentions: {
      parse: [],
    },
  };
}

function isSendableTextChannel(channel) {
  return channel?.isTextBased?.() && typeof channel.send === 'function';
}

function formatConfigStatus(config) {
  if (!config) return 'Desativado';
  return config.enabled ? 'Ativado' : 'Desativado';
}

function formatOptionalChannel(channelId) {
  return channelId ? `<#${channelId}>` : 'Nao configurado';
}

function formatOptionalRole(roleId) {
  return roleId ? `<@&${roleId}>` : 'Nao configurado';
}

async function fetchConfiguredChannel(client, channelId) {
  if (!channelId) return null;
  return client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch(() => null);
}

async function handleConfigure(client, interaction) {
  const channel = interaction.options.getChannel('canal', true);
  const logChannel = interaction.options.getChannel('canal_logs', false);
  const action = normalizeSelfBotAction(interaction.options.getString('punicao') || 'timeout');
  const timeoutMinutes = normalizeTimeoutMinutes(interaction.options.getInteger('duracao_minutos'));
  const restrictedRole = interaction.options.getRole('cargo_castigo', false);
  const currentConfig = getGuildSelfBotConfig(interaction.guildId);
  const restrictedRoleId = restrictedRole?.id || currentConfig?.restrictedRoleId || '';

  if (!isSendableTextChannel(channel)) {
    await interaction.editReply(buildReply({
      title: 'Canal invalido',
      description: 'Selecione um canal de texto ou anuncio para ativar o sistema anti self-bot.',
      color: ERROR_COLOR,
    }));
    return;
  }

  if (logChannel && !isSendableTextChannel(logChannel)) {
    await interaction.editReply(buildReply({
      title: 'Canal de logs invalido',
      description: 'O canal de logs tambem precisa ser um canal de texto ou anuncio.',
      color: ERROR_COLOR,
    }));
    return;
  }

  const missingPermissions = await getMissingSelfBotSetupPermissions(
    interaction.guild,
    channel,
    action,
    restrictedRoleId,
  );
  if (missingPermissions.length) {
    await interaction.editReply(buildReply({
      title: 'Permissoes faltando',
      description: 'Antes de ativar, ajuste as permissoes do bot para esse canal e para a punicao escolhida.',
      color: ERROR_COLOR,
      fields: [
        {
          name: 'Faltando',
          value: missingPermissions.map((permission) => `- ${permission}`).join('\n'),
          inline: false,
        },
      ],
    }));
    return;
  }

  let warningMessage;

  try {
    warningMessage = await publishSelfBotWarning(channel);
  } catch (error) {
    await interaction.editReply(buildReply({
      title: 'Falha ao publicar aviso',
      description: `Nao consegui enviar o aviso no canal ${channel}.`,
      color: ERROR_COLOR,
      fields: [
        {
          name: 'Erro',
          value: error.message,
          inline: false,
        },
      ],
    }));
    return;
  }

  const savedConfig = setGuildSelfBotConfig(interaction.guildId, {
    channelId: channel.id,
    logChannelId: logChannel?.id || '',
    restrictedRoleId,
    action,
    timeoutMinutes,
    warningMessageId: warningMessage.id,
    updatedBy: interaction.user.id,
  });

  await interaction.editReply(buildReply({
    title: 'Anti self-bot ativado',
    description: 'O canal foi configurado. Qualquer mensagem de usuario enviada nele sera apagada e punida automaticamente.',
    color: SUCCESS_COLOR,
    fields: [
      {
        name: 'Canal protegido',
        value: `<#${savedConfig.channelId}>`,
        inline: true,
      },
      {
        name: 'Punicao',
        value: formatPunishment(savedConfig),
        inline: true,
      },
      {
        name: 'Logs',
        value: formatOptionalChannel(savedConfig.logChannelId),
        inline: true,
      },
      {
        name: 'Cargo temporario',
        value: formatOptionalRole(savedConfig.restrictedRoleId),
        inline: true,
      },
    ],
  }));
}

async function handlePanel(client, interaction) {
  const config = getGuildSelfBotConfig(interaction.guildId);

  if (!config?.enabled || !config.channelId) {
    await interaction.editReply(buildReply({
      title: 'Anti self-bot desativado',
      description: 'Use `/selfbot configurar` antes de reenviar o aviso.',
      color: ERROR_COLOR,
    }));
    return;
  }

  const channel = await fetchConfiguredChannel(client, config.channelId);
  if (!isSendableTextChannel(channel)) {
    await interaction.editReply(buildReply({
      title: 'Canal nao encontrado',
      description: 'O canal configurado nao existe mais ou o bot nao consegue enviar mensagens nele.',
      color: ERROR_COLOR,
    }));
    return;
  }

  try {
    const warningMessage = await publishSelfBotWarning(channel);
    setGuildSelfBotConfig(interaction.guildId, {
      warningMessageId: warningMessage.id,
      updatedBy: interaction.user.id,
    });

    await interaction.editReply(buildReply({
      title: 'Aviso reenviado',
      description: `Publiquei novamente o aviso anti self-bot em ${channel}.`,
      color: SUCCESS_COLOR,
    }));
  } catch (error) {
    await interaction.editReply(buildReply({
      title: 'Falha ao reenviar aviso',
      description: error.message,
      color: ERROR_COLOR,
    }));
  }
}

async function handleDisable(interaction) {
  const config = disableGuildSelfBotConfig(interaction.guildId, interaction.user.id);

  await interaction.editReply(buildReply({
    title: 'Anti self-bot desativado',
    description: 'Novas mensagens no canal antigo nao serao mais punidas automaticamente.',
    color: SUCCESS_COLOR,
    fields: [
      {
        name: 'Canal anterior',
        value: formatOptionalChannel(config?.channelId),
        inline: true,
      },
    ],
  }));
}

async function handleStatus(interaction) {
  const config = getGuildSelfBotConfig(interaction.guildId);

  await interaction.editReply(buildReply({
    title: 'Status anti self-bot',
    description: 'Configuracao atual do sistema de canal protegido.',
    color: config?.enabled ? SUCCESS_COLOR : INFO_COLOR,
    fields: [
      {
        name: 'Status',
        value: formatConfigStatus(config),
        inline: true,
      },
      {
        name: 'Canal protegido',
        value: formatOptionalChannel(config?.channelId),
        inline: true,
      },
      {
        name: 'Punicao',
        value: config ? formatPunishment(config) : 'Nao configurado',
        inline: true,
      },
      {
        name: 'Logs',
        value: formatOptionalChannel(config?.logChannelId),
        inline: true,
      },
      {
        name: 'Cargo temporario',
        value: formatOptionalRole(config?.restrictedRoleId),
        inline: true,
      },
      {
        name: 'Atualizado em',
        value: config?.updatedAt || 'Nunca',
        inline: true,
      },
    ],
  }));
}

module.exports = {
  name: 'selfbot',
  description: 'Configura um canal anti self-bot para punir flood automatico.',
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  options: [
    {
      name: 'configurar',
      description: 'Ativa o canal anti self-bot.',
      type: ApplicationCommandOptionType.Subcommand,
      options: [
        {
          name: 'canal',
          description: 'Canal onde qualquer mensagem de usuario sera punida.',
          type: ApplicationCommandOptionType.Channel,
          channel_types: TEXT_CHANNEL_TYPES,
          required: true,
        },
        {
          name: 'punicao',
          description: 'Punicao automatica aplicada ao usuario.',
          type: ApplicationCommandOptionType.String,
          required: false,
          choices: [
            {
              name: 'Timeout',
              value: 'timeout',
            },
            {
              name: 'Expulsar',
              value: 'kick',
            },
            {
              name: 'Banir',
              value: 'ban',
            },
          ],
        },
        {
          name: 'duracao_minutos',
          description: 'Duracao do timeout em minutos. Padrao: 10080.',
          type: ApplicationCommandOptionType.Integer,
          required: false,
          min_value: 1,
          max_value: 40320,
        },
        {
          name: 'canal_logs',
          description: 'Canal que recebera os logs das punicoes.',
          type: ApplicationCommandOptionType.Channel,
          channel_types: TEXT_CHANNEL_TYPES,
          required: false,
        },
        {
          name: 'cargo_castigo',
          description: 'Cargo temporario aplicado durante o castigo.',
          type: ApplicationCommandOptionType.Role,
          required: false,
        },
      ],
    },
    {
      name: 'painel',
      description: 'Reenvia o aviso no canal protegido configurado.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'status',
      description: 'Mostra a configuracao atual do anti self-bot.',
      type: ApplicationCommandOptionType.Subcommand,
    },
    {
      name: 'desativar',
      description: 'Desativa o canal anti self-bot.',
      type: ApplicationCommandOptionType.Subcommand,
    },
  ],

  async run(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        ...buildReply({
          title: 'Comando indisponivel',
          description: 'Use este comando dentro de um servidor.',
          color: ERROR_COLOR,
        }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({
        ...buildReply({
          title: 'Permissao necessaria',
          description: 'Apenas administradores podem configurar o anti self-bot.',
          color: ERROR_COLOR,
        }),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'configurar') {
      await handleConfigure(client, interaction);
      return;
    }

    if (subcommand === 'painel') {
      await handlePanel(client, interaction);
      return;
    }

    if (subcommand === 'desativar') {
      await handleDisable(interaction);
      return;
    }

    await handleStatus(interaction);
  },
};
