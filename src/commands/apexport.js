import { SlashCommandBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

export const data = new SlashCommandBuilder()
  .setName('apexport')
  .setDescription('Exporta apresentações em JSON ou CSV (owner).')
  .addStringOption(o => o.setName('formato').setDescription('json ou csv').setRequired(true).addChoices(
    { name: 'JSON', value: 'json' },
    { name: 'CSV', value: 'csv' }
  ))
  .addBooleanOption(o => o.setName('todas').setDescription('Incluir pendentes e rejeitadas (padrão só aprovadas)'));

export async function execute(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({ content: 'Apenas owner.', ephemeral: true });
  }
  const formato = interaction.options.getString('formato');
  const todas = interaction.options.getBoolean('todas') || false;
  const presPath = path.resolve('src/data/presentations.json');
  let pres = [];
  try { pres = JSON.parse(fs.readFileSync(presPath, 'utf8')); } catch {}
  if (!todas) pres = pres.filter(p => p.status === 'approved');
  if (formato === 'json') {
    const json = JSON.stringify(pres, null, 2);
    if (json.length > 1900) {
      const temp = path.resolve(`export_${Date.now()}.json`);
      fs.writeFileSync(temp, json, 'utf8');
      return interaction.reply({ content: `Exportado (${pres.length} registros). Arquivo salvo localmente no servidor: ${temp}`, ephemeral: true });
    } else {
      return interaction.reply({ content: '```json\n' + json + '\n```', ephemeral: true });
    }
  } else if (formato === 'csv') {
    const header = ['id','userId','username','templateId','status','createdAt','approvedAt','media'];
    const lines = [header.join(',')];
    for (const p of pres) {
      lines.push([
        p.id,
        p.userId,
        p.username?.replace(/,/g,' '),
        p.templateId,
        p.status,
        p.createdAt,
        p.approvedAt || '',
        p.media || ''
      ].map(v => '"' + String(v).replace(/"/g,'""') + '"').join(','));
    }
    const csv = lines.join('\n');
    if (csv.length > 1900) {
      const temp = path.resolve(`export_${Date.now()}.csv`);
      fs.writeFileSync(temp, csv, 'utf8');
      return interaction.reply({ content: `Exportado (${pres.length} registros). Arquivo salvo localmente no servidor: ${temp}`, ephemeral: true });
    } else {
      return interaction.reply({ content: '```\n' + csv + '\n```', ephemeral: true });
    }
  } else {
    return interaction.reply({ content: 'Formato inválido.', ephemeral: true });
  }
}
