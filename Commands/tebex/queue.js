const {
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getTebexQueue } = require('../../services/tebexApi');
const {
  buildTebexFooter,
  formatCommandError,
  formatIsoUtc,
  requireTebexAdmin,
  truncate,
} = require('../../utils/tebexAdmin');

function buildQueueSummary(queue) {
  const sourceLabel = queue.from_cache
    ? 'Cache local (respeitando next_check)'
    : 'Resposta direta da API';

  return [
    `Comandos offline: ${queue.offline_command_count}`,
    `Jogadores pendentes: ${queue.player_count}`,
    `next_check: ${queue.next_check}s`,
    `Proxima consulta permitida (UTC): ${formatIsoUtc(queue.next_allowed_at)}`,
    `Origem: ${sourceLabel}`,
  ].join('\n');
}

function buildCommandField(command, index) {
  return {
    name: truncate(`Comando ${index + 1}${command.id ? ` - #${command.id}` : ''}`, 256),
    value: truncate([
      `Player: ${command.player_name || '-'}`,
      `Package: ${command.package_name || '-'}`,
      `Payment: ${command.payment_id || '-'}`,
      `Delay: ${command.delay ?? 0}s`,
      `Command: ${command.command || '-'}`,
    ].join('\n'), 1024),
    inline: false,
  };
}

module.exports = {
  name: 'tebex-queue',
  description: 'Consulta a fila da Tebex Plugin API.',
  dm_permission: false,
  options: [],

  async run(client, interaction) {
    if (!await requireTebexAdmin(interaction)) return;

    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    try {
      const queue = await getTebexQueue();
      const commands = Array.isArray(queue.offline_commands)
        ? queue.offline_commands.slice(0, 5)
        : [];

      const embed = new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle('Tebex queue')
        .setDescription(buildQueueSummary(queue))
        .setFooter(buildTebexFooter())
        .setTimestamp(new Date());

      if (commands.length === 0) {
        const noCommandsMessage = queue.player_count > 0
          ? 'Nenhum comando offline foi retornado. Ainda existem jogadores pendentes para comandos online.'
          : 'Nenhum comando foi retornado pela fila no momento.';

        embed.addFields({
          name: 'Comandos',
          value: noCommandsMessage,
          inline: false,
        });
      } else {
        embed.addFields(commands.map((command, index) => buildCommandField(command, index)));
      }

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      console.error('[tebex-queue] Falha ao consultar fila Tebex:', error);
      await interaction.editReply(
        formatCommandError(error, 'Falha ao consultar a fila da Tebex Plugin API.'),
      );
    }
  },
};
