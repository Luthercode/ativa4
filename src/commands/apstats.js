import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

export const data = new SlashCommandBuilder()
  .setName('apstats')
  .setDescription('Mostra estatísticas das apresentações (owner).');

export async function execute(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({ content: 'Apenas owner.', ephemeral: true });
  }
  const usedPath = path.resolve('src/data/used.json');
  const configPath = path.resolve('src/data/config.json');
  const presPath = path.resolve('src/data/presentations.json');
  const used = JSON.parse(fs.readFileSync(usedPath, 'utf8'));
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  let pres = [];
  try { pres = JSON.parse(fs.readFileSync(presPath, 'utf8')); } catch {}
  const total = pres.length;
  const pending = pres.filter(p => p.status === 'pending').length;
  const approved = pres.filter(p => p.status === 'approved').length;
  const rejected = pres.filter(p => p.status === 'rejected').length;
  const embed = new EmbedBuilder()
    .setTitle('Estatísticas de Apresentações')
    .addFields(
      { name: 'Total Usuários (used)', value: String(used.length), inline: true },
      { name: 'Registros', value: `${total} (Aprovadas: ${approved} / Pendentes: ${pending} / Rejeitadas: ${rejected})`, inline: false },
      { name: 'Canal Painel', value: config.presentationChannelId ? `<#${config.presentationChannelId}>` : 'Não definido', inline: true },
      { name: 'Canal Destino', value: config.targetChannelId ? `<#${config.targetChannelId}>` : 'Não definido', inline: true },
      { name: 'Canal Log', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Não definido', inline: true },
      { name: 'Moderação', value: config.moderationEnabled ? 'Ativa' : 'Off', inline: true },
      { name: 'Templates', value: String(config.templates.length), inline: true }
    )
    .setColor(0x5865F2)
    .setTimestamp();
  await interaction.reply({ embeds: [embed], ephemeral: true });
}
