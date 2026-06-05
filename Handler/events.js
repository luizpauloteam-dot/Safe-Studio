const fs = require("fs");
const path = require("path");

function registrarArquivo(filePath, carregados, client) {
  delete require.cache[require.resolve(filePath)];
  const eventModule = require(filePath);
  const fileLabel = path.basename(filePath);

  if (typeof eventModule.setClient === "function") {
    eventModule.setClient(client);
    carregados.push(`${fileLabel} -> setClient`);
    return;
  }

  if (typeof eventModule.execute === "function" && eventModule.name) {
    client.on(eventModule.name, (...args) => eventModule.execute(...args, client));
    carregados.push(`${fileLabel} -> ${eventModule.name}`);
    return;
  }

  console.warn(`[eventsHandler] Arquivo ignorado: ${fileLabel}`);
}

function listarArquivos(dir, carregados, client) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      listarArquivos(filePath, carregados, client);
      continue;
    }

    if (file.endsWith(".js")) {
      registrarArquivo(filePath, carregados, client);
    }
  }
}

function eventsHandler(client) {
  const eventsPath = path.resolve("./Events");
  const carregados = [];

  listarArquivos(eventsPath, carregados, client);
  console.log(`Eventos carregados: ${carregados.join(" | ")}`);
}

module.exports = eventsHandler;
