import { SlashCommandBuilder } from 'discord.js';
import { loadJson, saveJson } from '../util/storage.js';
import path from 'path';

export const data = new SlashCommandBuilder()
  .setName('apreload')
  .setDescription('Recarrega config (owner).');

export async function execute(interaction, ctx) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({ content: 'Apenas owner.', ephemeral: true });
  }
  const CONFIG_PATH = path.resolve('src/data/config.json');
  const fresh = loadJson(CONFIG_PATH, {});
  // atualizar objeto em memória
  Object.assign(ctx.config, fresh);
  ctx.save();
  await interaction.reply({ content: 'Config recarregada.', ephemeral: true });
}
