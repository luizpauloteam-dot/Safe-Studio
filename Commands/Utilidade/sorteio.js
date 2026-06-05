const {
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const {
  buildGiveawaySetupMessage,
  createDefaultGiveawayDraft,
  listActiveGiveaways,
} = require('../../utils/giveaways');

function getDraftKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

module.exports = {
  name: 'sorteio',
  description: 'Painel completo de sorteios com modal e Components V2.',
  dm_permission: false,
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
  options: [],

  async run(client, interaction) {
    if (!interaction.inGuild()) {
      await interaction.reply({
        content: 'Use este comando em um servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    client.giveawayDrafts ??= new Map();

    const draftKey = getDraftKey(interaction.guildId, interaction.user.id);
    const existingDraft = client.giveawayDrafts.get(draftKey);
    const draft = existingDraft || createDefaultGiveawayDraft(interaction.channelId);

    client.giveawayDrafts.set(draftKey, draft);

    await interaction.reply({
      ...buildGiveawaySetupMessage(
        interaction.guild,
        draft,
        listActiveGiveaways(interaction.guildId),
        { notice: 'Edite o rascunho no formulario e publique o sorteio.' },
      ),
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    });
  },
};
