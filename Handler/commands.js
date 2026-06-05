const fs = require('fs').promises;
const { Collection } = require('discord.js');

function getConfiguredGuildIds() {
  const rawGuildIds = process.env.DISCORD_GUILD_IDS || process.env.GUILD_IDS || '';

  return String(rawGuildIds)
    .split(',')
    .map((guildId) => guildId.trim())
    .filter(Boolean);
}

function getCommandScope() {
  return String(process.env.DISCORD_COMMAND_SCOPE || 'guild').toLowerCase();
}

function normalizeCommandData(command) {
  if (typeof command.data?.toJSON === 'function') {
    return command.data.toJSON();
  }

  const { run, ...commandData } = command;
  return commandData;
}

function getTargetGuilds(client) {
  const configuredGuildIds = getConfiguredGuildIds();

  if (!configuredGuildIds.length) {
    return [...client.guilds.cache.values()];
  }

  return configuredGuildIds
    .map((guildId) => client.guilds.cache.get(guildId))
    .filter(Boolean);
}

async function clearGlobalCommands(client) {
  await client.application.commands.set([]);
  console.log('Comandos globais antigos removidos.');
}

async function clearGuildCommands(client) {
  const guilds = [...client.guilds.cache.values()];

  for (const guild of guilds) {
    await guild.commands.set([]);
  }

  if (guilds.length) {
    console.log(`Comandos de servidor antigos removidos de ${guilds.length} servidor(es).`);
  }
}

async function registerSlashCommands(client, slashArray, comandosCarregados) {
  try {
    if (getCommandScope() === 'global') {
      await clearGuildCommands(client);
      await client.application.commands.set(slashArray);
      console.log('Comandos registrados globalmente.');
    } else {
      await clearGlobalCommands(client);
      const targetGuilds = getTargetGuilds(client);

      if (!targetGuilds.length) {
        console.warn('Nenhum servidor encontrado para registrar comandos.');
      }

      for (const guild of targetGuilds) {
        await guild.commands.set(slashArray);
      }

      console.log(`Comandos registrados em ${targetGuilds.length} servidor(es).`);
    }

    console.log(`Comandos carregados: [${comandosCarregados.join(', ')}]`);
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
}

async function commandsHandler(client) {
  const slashArray = [];
  const comandosCarregados = [];
  client.slashCommands = new Collection();

  try {
    const folders = await fs.readdir('./Commands');

    for (const subfolder of folders) {
      const files = await fs.readdir(`./Commands/${subfolder}/`);

      for (const file of files) {
        if (!file.endsWith('.js')) continue;

        const filePath = `../Commands/${subfolder}/${file}`;
        delete require.cache[require.resolve(filePath)];

        const command = require(filePath);
        const commandData = normalizeCommandData(command);
        const commandName = command.name || commandData.name;

        if (!commandName || typeof command.run !== 'function') continue;

        client.slashCommands.set(commandName, command);
        slashArray.push(commandData);
        comandosCarregados.push(commandName);
      }
    }

    client.once('ready', async () => {
      await registerSlashCommands(client, slashArray, comandosCarregados);
    });

    client.on('guildCreate', async (guild) => {
      if (getCommandScope() === 'global') return;

      const configuredGuildIds = getConfiguredGuildIds();
      if (configuredGuildIds.length && !configuredGuildIds.includes(guild.id)) {
        return;
      }

      try {
        await guild.commands.set(slashArray);
        console.log(`Comandos registrados no servidor ${guild.name}.`);
      } catch (error) {
        console.error(`Erro ao registrar comandos no servidor ${guild.name}:`, error);
      }
    });
  } catch (error) {
    console.error('Erro ao carregar comandos:', error);
  }
}

module.exports = commandsHandler;
