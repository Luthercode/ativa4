import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('apattachment')
  .setDescription('Gerar URL de um anexo (imagem/gif/vídeo) para usar na apresentação')
  .addAttachmentOption(o => o.setName('arquivo').setDescription('Imagem / GIF / Vídeo').setRequired(true));

// Tipos de MIME permitidos
const ALLOWED = new Set([
  'image/png','image/jpeg','image/jpg','image/gif','image/webp',
  'video/mp4','video/quicktime','video/webm','video/x-matroska','video/mpeg'
]);

// Mapeamento por extensão (fallback quando contentType vem null em alguns uploads mobile/browser)
const EXT_MAP = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', mpeg: 'video/mpeg'
};

function formatBytes(b) {
  const units = ['B','KB','MB','GB'];
  let i = 0; let v = b;
  while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
  return `${v.toFixed(2)} ${units[i]}`;
}

export async function execute(interaction) {
  const attachment = interaction.options.getAttachment('arquivo');
  if (!attachment) {
    return interaction.reply({ content: 'Anexo não encontrado.', ephemeral: true });
  }
  let { contentType, size, url, name } = attachment;
  const originalType = contentType;
  if (!contentType) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (EXT_MAP[ext]) contentType = EXT_MAP[ext];
  }
  if (!contentType || !ALLOWED.has(contentType.toLowerCase())) {
    return interaction.reply({ content: `Tipo não permitido ou não detectado (contentType=${originalType || 'null'})`, ephemeral: true });
  }
  // Limite de tamanho (ex: 25MB) - pode ajustar
  const MAX = 25 * 1024 * 1024;
  if (size > MAX) {
    return interaction.reply({ content: 'Arquivo excede 25MB.', ephemeral: true });
  }
  // URL direta do CDN do Discord já é https e geralmente confiável
  // Retornamos uma mensagem com a URL para o usuário colar no campo de mídia do modal de apresentação
  // Mostrar a URL crua em bloco de código para evitar estilização e facilitar copiar
  const msg = `URL gerada para uso:\n\`\`\`${url}\`\`\`\nCopie e cole no campo de mídia quando criar sua apresentação.`;
  const embed = new EmbedBuilder()
    .setTitle('Prévia do Anexo')
    .setDescription(`Arquivo: **${name}**\nTipo: ${contentType}${originalType && originalType !== contentType ? ' (inferido)' : ''}\nTamanho: ${formatBytes(size)}`)
    .setColor(0x5865F2)
    .setFooter({ text: 'Se estiver correto, copie a URL acima.' });
  if (contentType.startsWith('image/') || contentType === 'image/gif') {
    embed.setImage(url);
  } else if (contentType.startsWith('video/')) {
    embed.addFields({ name: 'Preview', value: 'Vídeo não pode ser incorporado aqui. A URL funcionará ao publicar.' });
  }
  if (process.env.LOG_ATTACH === '1') {
    console.log('[APATTACHMENT]', { name, size, contentType, originalType, url });
  }
  return interaction.reply({ content: msg, embeds: [embed], ephemeral: true });
}
