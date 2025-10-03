import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import path from 'path';

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID; // opcional
  if (!token || !clientId) throw new Error('DISCORD_TOKEN ou CLIENT_ID faltando');

  const commands = [];
  const cmdDir = path.resolve('src/commands');
  for (const file of readdirSync(cmdDir).filter(f => f.endsWith('.js'))) {
    const modPath = new URL(`./commands/${file}`, import.meta.url).pathname;
    const mod = await import(modPath);
    if (mod.data) commands.push(mod.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('Comandos registrados (guild).');
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('Comandos registrados (global).');
  }
}

main().catch(e => console.error(e));
