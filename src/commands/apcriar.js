import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('apcriar')
  .setDescription('Abrir modal para criar sua apresentação (atalho do painel)');

export async function execute(interaction, { config }) {
  // Reaproveitar a função global exposta via globalThis (definida em index.js)
  if (!globalThis.openPresentationModal) {
    return interaction.reply({ content: 'Função não disponível no momento.', ephemeral: true });
  }
  await globalThis.openPresentationModal(interaction);
}
