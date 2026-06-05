const { Events } = require('discord.js');
const { startGiveawayWatcher } = require('../../utils/giveaways');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    startGiveawayWatcher(client);
    console.log('[Sorteio] Monitor automatico iniciado.');
  },
};
