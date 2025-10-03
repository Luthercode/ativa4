import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('apconfig')
  .setDescription('Abrir painel admin de apresentações (owner)');

export async function execute(interaction, ctx) {
  if (interaction.user.id !== process.env.OWNER_ID) {
    return interaction.reply({ content: 'Apenas o dono configurado pode usar.', ephemeral: true });
  }
  await interaction.reply({ ...ctx.buildAdminPanel(), ephemeral: true });
}
