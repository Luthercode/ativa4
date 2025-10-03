import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('apmidia')
  .setDescription('Mostra instruções de como anexar mídia para a apresentação');

const HELP_TEXT = 'Para adicionar imagem / GIF / vídeo:\n1. Use /apattachment e envie o arquivo.\n2. Copie a URL retornada.\n3. Clique em "Criar Apresentação" e cole no campo de mídia.\nFormatos: PNG, JPG, GIF, WEBP, MP4, MOV, WEBM, MKV até 25MB.';

export async function execute(interaction, { config }) {
  if (config.compactMode) {
    // tenta atualizar painel se disponível
    if (globalThis.logPanelEvent && globalThis.updatePanel) {
      globalThis.logPanelEvent(`Ajuda mídia (/apmidia) por ${interaction.user.username}`);
      const embed = new EmbedBuilder().setTitle('Ajuda de Mídia').setDescription(HELP_TEXT).setColor(0x5865F2);
      await globalThis.updatePanel(interaction.guild, [embed]);
      return interaction.reply({ content: 'Instruções exibidas no painel.', ephemeral: true });
    }
  }
  return interaction.reply({ embeds: [ new EmbedBuilder().setTitle('Ajuda de Mídia').setDescription(HELP_TEXT).setColor(0x5865F2) ], ephemeral: true });
}
