import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('apclear')
  .setDescription('Limpa uma quantidade de mensagens neste canal (owner somente).')
  .addIntegerOption(opt => opt.setName('qtd').setDescription('Quantidade de mensagens (1-100)').setRequired(true));

export async function execute(interaction) {
  const ownerId = process.env.OWNER_ID;
  if (!ownerId || interaction.user.id !== ownerId) {
    return interaction.reply({ content: 'Apenas o dono configurado pode usar este comando.', ephemeral: true });
  }
  const qtd = interaction.options.getInteger('qtd');
  if (qtd < 1 || qtd > 100) {
    return interaction.reply({ content: 'Valor inválido. Use entre 1 e 100.', ephemeral: true });
  }
  if (!interaction.channel || !interaction.channel.isTextBased()) {
    return interaction.reply({ content: 'Canal não suportado.', ephemeral: true });
  }
  try {
    await interaction.deferReply({ ephemeral: true });
    const deleted = await interaction.channel.bulkDelete(qtd, true);
    await interaction.editReply({ content: `Removidas ${deleted.size} mensagens (mensagens >14 dias não são deletadas).` });
  } catch (e) {
    console.error('[apclear] erro', e);
    try { await interaction.editReply({ content: 'Falha ao deletar mensagens.' }); } catch {}
  }
}
