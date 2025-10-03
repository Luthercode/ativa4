import { SlashCommandBuilder } from 'discord.js';
import { loadJson, saveJson } from '../util/storage.js';
import path from 'path';

const CONFIG_PATH = path.resolve('src/data/config.json');

export const data = new SlashCommandBuilder()
  .setName('aptemplates')
  .setDescription('Gerenciar templates (owner).')
  .addSubcommand(sc => sc.setName('list').setDescription('Lista templates'))
  .addSubcommand(sc => sc.setName('add').setDescription('Adicionar template')
    .addStringOption(o => o.setName('id').setDescription('ID único').setRequired(true))
    .addStringOption(o => o.setName('nome').setDescription('Nome de exibição').setRequired(true))
    .addStringOption(o => o.setName('descricao').setDescription('Descrição').setRequired(true))
    .addIntegerOption(o => o.setName('cor').setDescription('Cor decimal').setRequired(false))
  )
  .addSubcommand(sc => sc.setName('remove').setDescription('Remover template')
    .addStringOption(o => o.setName('id').setDescription('ID existente').setRequired(true))
  );

export async function execute(interaction) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({ content: 'Apenas owner.', ephemeral: true });
  }
  const sub = interaction.options.getSubcommand();
  const cfg = loadJson(CONFIG_PATH, {});

  if (sub === 'list') {
    if (!cfg.templates || cfg.templates.length === 0) return interaction.reply({ content: 'Nenhum template.', ephemeral: true });
    const msg = cfg.templates.map(t => `• ${t.id} | ${t.nome} | ${t.color || 'sem cor'}`).join('\n');
    return interaction.reply({ content: msg.substring(0,1900), ephemeral: true });
  } else if (sub === 'add') {
    const id = interaction.options.getString('id');
    const nome = interaction.options.getString('nome');
    const desc = interaction.options.getString('descricao');
    const cor = interaction.options.getInteger('cor') || 0x5865F2;
    if (cfg.templates.find(t => t.id === id)) return interaction.reply({ content: 'ID já existe.', ephemeral: true });
    cfg.templates.push({ id, nome, descricao: desc, color: cor });
    saveJson(CONFIG_PATH, cfg);
    return interaction.reply({ content: `Template ${id} adicionado.`, ephemeral: true });
  } else if (sub === 'remove') {
    const id = interaction.options.getString('id');
    const before = cfg.templates.length;
    cfg.templates = cfg.templates.filter(t => t.id !== id);
    if (cfg.templates.length === before) return interaction.reply({ content: 'ID não encontrado.', ephemeral: true });
    saveJson(CONFIG_PATH, cfg);
    return interaction.reply({ content: `Template ${id} removido.`, ephemeral: true });
  }
}
