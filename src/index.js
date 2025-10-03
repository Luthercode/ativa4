import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, ChannelType } from 'discord.js';
import { loadJson, saveJson } from './util/storage.js';
import { readdirSync } from 'fs';
import path from 'path';

const CONFIG_PATH = path.resolve('src/data/config.json');
const USED_PATH = path.resolve('src/data/used.json');
const PRESENTATIONS_PATH = path.resolve('src/data/presentations.json');

const config = loadJson(CONFIG_PATH, { presentationChannelId: null, targetChannelId: null, logChannelId: null, panelMessageId: null, moderationEnabled: false, moderationChannelId: null, rateLimitSeconds: 30, maxDescriptionLength: 1000, allowedMediaHosts: [], templates: [], compactMode: false, tempMediaCategoryId: null, tempChannelTTLSeconds: 240, targetChannelBoysId: null, targetChannelGirlsId: null, autoDeleteHelperSeconds: 30 });
if (typeof config.autoDeleteHelperSeconds !== 'number' || config.autoDeleteHelperSeconds < 5) config.autoDeleteHelperSeconds = 30;
if (typeof config.targetChannelBoysId === 'undefined') config.targetChannelBoysId = null;
if (typeof config.targetChannelGirlsId === 'undefined') config.targetChannelGirlsId = null;
if (typeof config.compactMode === 'undefined') config.compactMode = false;
if (!config.tempChannelTTLSeconds) config.tempChannelTTLSeconds = 240;
let used = loadJson(USED_PATH, []);
let presentations = loadJson(PRESENTATIONS_PATH, []);
const templateSelections = new Map(); // userId -> templateId
const genderSelections = new Map(); // userId -> gender ('boys' | 'girls')
const drafts = new Map(); // userId -> draft object
const rateLimit = new Map(); // userId -> epoch seconds
const tempUploadChannels = new Map(); // userId -> { channelId, expiresAt }

function savePresentations() { saveJson(PRESENTATIONS_PATH, presentations); }
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function scheduleAutoDelete(message, seconds) {
  if (!message || !seconds) return;
  setTimeout(() => {
    message.delete().catch(()=>{});
  }, seconds * 1000);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Carregar comandos
async function loadCommands() {
  const cmdDir = path.resolve('src/commands');
  const files = readdirSync(cmdDir).filter(f => f.endsWith('.js'));
  for (const f of files) {
    const modPath = new URL(`./commands/${f}`, import.meta.url).pathname;
    const mod = await import(modPath);
    if (mod.data && mod.execute) client.commands.set(mod.data.name, mod);
  }
  console.log('[COMMANDS] Carregados:', [...client.commands.keys()].join(', '));
}

await loadCommands();

client.once('ready', async () => {
  console.log(`Logado como ${client.user.tag}`);
  // Varredura inicial de canais temporários
  if (config.tempMediaCategoryId) {
    const cat = await client.channels.fetch(config.tempMediaCategoryId).catch(()=>null);
    if (cat && cat.type === ChannelType.GuildCategory && cat.children) {
      for (const ch of cat.children.cache.values()) {
        if (ch.topic && ch.topic.startsWith('TEMP_UPLOAD:')) {
          const parts = ch.topic.split(':');
          const userId = parts[1];
          const expires = parseInt(parts[2],10);
            if (Date.now() > expires) {
              try { await ch.delete('Temp upload expirado (startup)'); } catch {}
            } else {
              tempUploadChannels.set(userId, { channelId: ch.id, expiresAt: expires });
              setTimeout(async ()=>{
                const meta = tempUploadChannels.get(userId);
                if (!meta || meta.channelId !== ch.id) return;
                const c2 = await client.channels.fetch(ch.id).catch(()=>null);
                if (c2) { try { await c2.delete('TTL expirou canal de upload (sweep)'); } catch {} }
                tempUploadChannels.delete(userId);
              }, Math.max(1000, expires - Date.now()));
            }
        }
      }
    }
  }
});

function isOwner(userId) {
  return process.env.OWNER_ID && userId === process.env.OWNER_ID;
}

// Helpers UI
function buildMemberPanelEmbed() {
  const lines = [];
  lines.push('Crie sua apresentação única! Você só pode enviar **UMA VEZ** (após aprovada, se moderação ativa).');
  if (config.moderationEnabled) lines.push('\nEsta comunidade usa moderação: sua apresentação irá para uma fila antes de publicar.');
  lines.push('\nSelecione primeiro o gênero (Meninos/Meninas) e um template, depois clique em Criar Apresentação.');
  lines.push('\nPara adicionar imagem/GIF/vídeo: use o botão "Adicionar Foto/Vídeo" para gerar canal temporário e depois /apattachment para obter a URL. Cole no campo de mídia do modal.');
  if (config.rateLimitSeconds) lines.push(`\nCooldown: ${config.rateLimitSeconds}s entre tentativas de criação.`);
  if (config.compactMode && globalThis.__panelEvents && globalThis.__panelEvents.length) {
    lines.push('\n---\n**Atividade Recente:**');
    for (const ev of globalThis.__panelEvents) lines.push(`\n• ${ev}`);
  }
  return new EmbedBuilder()
    .setTitle('Apresentação do Servidor')
    .setDescription(lines.join(''))
    .setColor(0x5865F2)
    .setFooter({ text: config.compactMode ? 'Modo compacto ativo.' : 'Use com responsabilidade.' });
}

function buildTemplatesSelect() {
  return new StringSelectMenuBuilder()
    .setCustomId('template_select')
    .setPlaceholder('Escolha um template de embed')
    .addOptions(config.templates.map(t => ({
      label: t.nome,
      value: t.id,
      description: t.descricao.substring(0, 90),
      emoji: colorToEmoji(t.color)
    })));
}

function buildMemberPanelComponents() {
  const genderSelect = new StringSelectMenuBuilder()
    .setCustomId('gender_select')
    .setPlaceholder('Escolha gênero do canal destino')
    .addOptions([
      { label: 'Meninos', value: 'boys', description: 'Enviar para canal de meninos' },
      { label: 'Meninas', value: 'girls', description: 'Enviar para canal de meninas' }
    ]);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('apresentacao_criar').setLabel('Criar Apresentação').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('apresentacao_modelos').setLabel('Ver Modelos').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('apresentacao_preview').setLabel('Pré-visualizar').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId('apresentacao_media_help').setLabel('Adicionar Foto/Vídeo').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(buildTemplatesSelect()),
    new ActionRowBuilder().addComponents(genderSelect)
  ];
}

// Inicializar array global de eventos (evita recriar em hot reload)
if (!globalThis.__panelEvents) globalThis.__panelEvents = [];
function logPanelEvent(text) {
  const d = new Date();
  const hh = d.getHours().toString().padStart(2,'0');
  const mm = d.getMinutes().toString().padStart(2,'0');
  globalThis.__panelEvents.unshift(`[${hh}:${mm}] ${text}`);
  if (globalThis.__panelEvents.length > 6) globalThis.__panelEvents.pop();
}

// Expor helpers para comandos externos reutilizarem
globalThis.openPresentationModal = openPresentationModal;
globalThis.updatePanel = updatePanel;
globalThis.logPanelEvent = logPanelEvent;

async function updatePanel(guild, extraEmbeds = []) {
  if (!config.presentationChannelId) return;
  const ch = await guild.channels.fetch(config.presentationChannelId).catch(()=>null);
  if (!ch || !ch.isTextBased()) return;
  let msg = null;
  if (config.panelMessageId) msg = await ch.messages.fetch(config.panelMessageId).catch(()=>null);
  if (!msg) {
    msg = await sendMemberPanel(ch);
  } else {
    await msg.edit({ embeds: [buildMemberPanelEmbed(), ...extraEmbeds], components: buildMemberPanelComponents() });
  }
}

async function safeReply(interaction, data) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.followUp(data);
    }
    return await interaction.reply(data);
  } catch (e) {
    if (e?.code === 10062) {
      console.warn('[safeReply] Unknown interaction ignorado');
    } else {
      console.error('[safeReply] erro', e);
    }
  }
}

async function safeEditReply(interaction, data) {
  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferReply({ ephemeral: data?.ephemeral });
    }
    return await interaction.editReply(data);
  } catch (e) {
    if (e?.code === 10062) {
      console.warn('[safeEditReply] Unknown interaction ignorado');
    } else {
      console.error('[safeEditReply] erro', e);
    }
  }
}

async function sendMemberPanel(channel) {
  try {
    if (config.panelMessageId) {
      const msg = await channel.messages.fetch(config.panelMessageId).catch(() => null);
      if (msg) {
        console.log('[PAINEL] Editando painel existente (panelMessageId encontrado)');
        await msg.edit({ embeds: [buildMemberPanelEmbed()], components: buildMemberPanelComponents() });
        return msg;
      }
    }
    // Fallback: tentar localizar painel existente pelo título para não duplicar
    const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (recent) {
      const found = [...recent.values()].find(m => m.author?.id === client.user.id && m.embeds?.[0]?.title === 'Apresentação do Servidor');
      if (found) {
        console.log('[PAINEL] Painel encontrado via fallback (scan mensagens recentes)');
        config.panelMessageId = found.id;
        saveJson(CONFIG_PATH, config);
        await found.edit({ embeds: [buildMemberPanelEmbed()], components: buildMemberPanelComponents() });
        return found;
      }
    }
    const sent = await channel.send({ embeds: [buildMemberPanelEmbed()], components: buildMemberPanelComponents() });
    console.log('[PAINEL] Novo painel criado (nenhum existente localizado)');
    config.panelMessageId = sent.id;
    saveJson(CONFIG_PATH, config);
    return sent;
  } catch (e) {
    console.error('Erro ao enviar/atualizar painel', e);
  }
}

// Cria ou reutiliza canal temporário de upload para um usuário
async function createOrGetTempUploadChannel(guild, user) {
  const existing = tempUploadChannels.get(user.id);
  if (existing) {
    const ch = await guild.channels.fetch(existing.channelId).catch(()=>null);
    if (ch) return ch; else tempUploadChannels.delete(user.id);
  }
  if (!config.tempMediaCategoryId) return null;
  const category = await guild.channels.fetch(config.tempMediaCategoryId).catch(()=>null);
  if (!category || category.type !== ChannelType.GuildCategory) return null;
  const baseName = user.username.toLowerCase().replace(/[^a-z0-9]+/g,'-').substring(0,15) || 'user';
  const ttl = config.tempChannelTTLSeconds || 240;
  const channel = await guild.channels.create({
    name: `upload-${baseName}`,
    parent: category.id,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: ['ViewChannel'] },
      { id: user.id, allow: ['ViewChannel','SendMessages','AttachFiles','ReadMessageHistory'] },
      { id: guild.members.me.id, allow: ['ViewChannel','SendMessages','EmbedLinks','AttachFiles','ManageChannels','ReadMessageHistory'] }
    ],
    topic: `TEMP_UPLOAD:${user.id}:${Date.now()+ ttl*1000}`
  });
  tempUploadChannels.set(user.id, { channelId: channel.id, expiresAt: Date.now()+ttl*1000 });
  setTimeout(async ()=>{
    const meta = tempUploadChannels.get(user.id);
    if (!meta || meta.channelId !== channel.id) return;
    const ch = await guild.channels.fetch(channel.id).catch(()=>null);
    if (ch) { try { await ch.delete('TTL expirou canal de upload'); } catch {} }
    tempUploadChannels.delete(user.id);
  }, ttl*1000);
  return channel;
}

function buildAdminPanel() {
  const embed = new EmbedBuilder()
    .setTitle('Painel Admin - Apresentações')
    .setDescription('Configure canais, moderação e gere/regenere o painel público.')
    .setColor(0x2f3136)
    .addFields(
      { name: 'Canal Painel', value: config.presentationChannelId ? `<#${config.presentationChannelId}>` : 'Não definido', inline: true },
      { name: 'Canal Destino', value: config.targetChannelId ? `<#${config.targetChannelId}>` : 'Não definido', inline: true },
      { name: 'Canal Meninos', value: config.targetChannelBoysId ? `<#${config.targetChannelBoysId}>` : '—', inline: true },
      { name: 'Canal Meninas', value: config.targetChannelGirlsId ? `<#${config.targetChannelGirlsId}>` : '—', inline: true },
      { name: 'Canal Log', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Não definido', inline: true },
      { name: 'Moderação', value: config.moderationEnabled ? 'Ativa' : 'Desativada', inline: true },
      { name: 'Canal Moderação', value: config.moderationChannelId ? `<#${config.moderationChannelId}>` : 'Não definido', inline: true },
      { name: 'Templates', value: config.templates.map(t => `• **${t.nome}** (${t.id})`).join('\n') || 'Nenhum', inline: false },
      { name: 'Categoria Temp Mídia', value: config.tempMediaCategoryId ? `<#${config.tempMediaCategoryId}>` : 'Não definida', inline: true },
      { name: 'TTL Canal Temp', value: `${config.tempChannelTTLSeconds || 240}s`, inline: true }
    );
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_set_painel').setLabel('Definir Painel').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('admin_set_destino').setLabel('Definir Destino').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('admin_set_log').setLabel('Definir Log').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin_toggle_mod').setLabel('Toggle Moderação').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin_set_mod_channel').setLabel('Canal Moderação').setStyle(ButtonStyle.Primary)
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_gerar').setLabel(config.panelMessageId ? 'Atualizar Painel Público' : 'Gerar Painel Público').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('admin_reset_usuario').setLabel('Reset Usuário').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('admin_toggle_compact').setLabel(config.compactMode ? 'Compact ON' : 'Compact OFF').setStyle(config.compactMode ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin_set_temp_cat').setLabel('Cat Temp Mídia').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('admin_set_temp_ttl').setLabel('TTL Temp').setStyle(ButtonStyle.Secondary)
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('admin_set_destino_meninos').setLabel('Canal Meninos').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('admin_set_destino_meninas').setLabel('Canal Meninas').setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row1, row2, row3] };
}

function openTemplateList(interaction) {
  const embeds = config.templates.map(t => new EmbedBuilder()
    .setTitle(`${colorToEmoji(t.color)} Modelo: ${t.nome}`)
    .setDescription(t.descricao)
    .setColor(t.color || 0x5865F2));
  return interaction.reply({ embeds, ephemeral: true });
}

function ensureTemplate(id) {
  return config.templates.find(t => t.id === id) || config.templates[0];
}

function colorToEmoji(color) {
  if (color === undefined || color === null) return '📦';
  try {
    const r = (color >> 16) & 0xFF;
    const g = (color >> 8) & 0xFF;
    const b = color & 0xFF;
    const max = Math.max(r,g,b);
    const min = Math.min(r,g,b);
    const delta = max - min;
    const brightness = (r+g+b)/3;
    if (delta < 15) {
      return brightness > 128 ? '⚪' : '⚫';
    }
    let h;
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
    if (h < 15 || h >= 345) return '🔴';
    if (h < 45) return '🟠';
    if (h < 70) return '🟡';
    if (h < 170) return '🟢';
    if (h < 250) return '🔵';
    return '🟣';
  } catch {
    return '📦';
  }
}

function validateMediaUrl(url) {
  if (!url) return { ok: true };
  try {
    const u = new URL(url);
    // Permitir sempre o CDN do Discord (para anexos via /apattachment)
    const discordHosts = ['cdn.discordapp.com','media.discordapp.net'];
    if (discordHosts.includes(u.host)) return { ok: true };
    if (config.allowedMediaHosts && config.allowedMediaHosts.length > 0) {
      if (!config.allowedMediaHosts.includes(u.host)) {
        return { ok: false, reason: 'Host não permitido.' };
      }
    }
    const ext = (u.pathname.split('.').pop() || '').toLowerCase();
    const allowedExt = ['png','jpg','jpeg','gif','webp','mp4','mov','webm'];
    if (!allowedExt.includes(ext)) {
      return { ok: false, reason: 'Extensão não suportada.' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'URL inválida.' };
  }
}

// Função reutilizável para abrir o modal de criação de apresentação
async function openPresentationModal(interaction) {
  if (used.includes(interaction.user.id)) return interaction.reply({ content: 'Você já fez sua apresentação. Se precisa refazer para testes, peça ao owner para usar "Reset Usuário" no painel admin (ou remover seu ID de used.json e reiniciar o bot).', ephemeral: true });
  if (config.presentationChannelId && interaction.channelId !== config.presentationChannelId) return interaction.reply({ content: `Use o canal correto: <#${config.presentationChannelId}>`, ephemeral: true });
  const gender = genderSelections.get(interaction.user.id);
  if (!gender) return interaction.reply({ content: 'Selecione primeiro o gênero (Meninos/Meninas) no painel antes de criar.', ephemeral: true });
  const now = Math.floor(Date.now()/1000);
  const last = rateLimit.get(interaction.user.id) || 0;
  if (config.rateLimitSeconds && (now - last) < config.rateLimitSeconds) {
    return interaction.reply({ content: `Aguarde ${config.rateLimitSeconds - (now - last)}s para tentar novamente.`, ephemeral: true });
  }
  rateLimit.set(interaction.user.id, now);
  const modal = new ModalBuilder().setCustomId('apresentacao_modal').setTitle('Sua Apresentação');
  const sobre = new TextInputBuilder().setCustomId('sobre').setLabel('Fale sobre você').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true);
  const midia = new TextInputBuilder().setCustomId('midia').setLabel('Link de imagem/GIF/vídeo (opcional)').setStyle(TextInputStyle.Short).setRequired(false);
  modal.addComponents(new ActionRowBuilder().addComponents(sobre), new ActionRowBuilder().addComponents(midia));
  await interaction.showModal(modal);
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const cmd = client.commands.get(interaction.commandName);
    if (!cmd) return;
    try { await cmd.execute(interaction, { config, save: () => saveJson(CONFIG_PATH, config), sendMemberPanel, buildAdminPanel }); }
    catch (e) { console.error(e); interaction.reply({ content: 'Erro ao executar comando.', ephemeral: true }); }
  } else if (interaction.isButton()) {
    if (interaction.customId === 'apresentacao_criar') {
      await openPresentationModal(interaction);
    } else if (interaction.customId === 'apresentacao_modelos') {
      return openTemplateList(interaction);
    } else if (interaction.customId === 'apresentacao_preview') {
      const templateId = templateSelections.get(interaction.user.id);
      const template = ensureTemplate(templateId);
      const preview = new EmbedBuilder()
        .setTitle(`${template.nome}`)
        .setDescription(template.descricao || 'Sem descrição.')
        .setColor(template.color || 0x5865F2)
        .setFooter({ text: 'Visualização do template.' });
      return interaction.reply({ embeds: [preview], ephemeral: true });
    } else if (interaction.customId === 'apresentacao_media_help') {
      if (!config.tempMediaCategoryId) {
        return interaction.reply({ content: 'Categoria de canais temporários não configurada (admin: usar Cat Temp Mídia).', ephemeral: true });
      }
      const ch = await createOrGetTempUploadChannel(interaction.guild, interaction.user);
      if (!ch) return interaction.reply({ content: 'Falha ao criar canal temporário.', ephemeral: true });
      try {
        const helperMsg = await ch.send({ content: `Canal temporário para <@${interaction.user.id}>\nTempo: **${config.tempChannelTTLSeconds || 240}s**\n1. Use **/apattachment** aqui.\n2. Copie a URL (bloco de código).\n3. Volte para <#${config.presentationChannelId}> e finalize a criação.\nEsta mensagem será apagada automaticamente.` });
        scheduleAutoDelete(helperMsg, config.autoDeleteHelperSeconds);
      } catch {}
      if (config.compactMode) { logPanelEvent(`Canal upload ${interaction.user.username}`); await updatePanel(interaction.guild); }
      return interaction.reply({ content: `Canal de upload criado: <#${ch.id}> (expira em ${config.tempChannelTTLSeconds || 240}s).`, ephemeral: true });
    } else if (interaction.customId.startsWith('admin_')) {
      if (!isOwner(interaction.user.id)) return interaction.reply({ content: 'Apenas o dono pode usar.', ephemeral: true });
      if (interaction.customId === 'admin_gerar') {
        try {
          if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
          if (!config.presentationChannelId) return interaction.editReply({ content: 'Defina primeiro o canal de painel.' });
          const ch = await interaction.guild.channels.fetch(config.presentationChannelId).catch(() => null);
          if (!ch) return interaction.editReply({ content: 'Canal inválido.' });
          const before = config.panelMessageId;
          await sendMemberPanel(ch);
          const created = before === null || before !== config.panelMessageId;
          await interaction.editReply({ content: created ? 'Painel criado.' : 'Painel atualizado.' });
        } catch (e) {
          console.error('[admin_gerar] erro', e);
          if (!interaction.replied) {
            try { await interaction.editReply({ content: 'Erro ao gerar painel.' }); } catch {}
          }
        }
        return;
  } else if (interaction.customId === 'admin_set_painel' || interaction.customId === 'admin_set_destino' || interaction.customId === 'admin_set_destino_meninos' || interaction.customId === 'admin_set_destino_meninas' || interaction.customId === 'admin_set_log' || interaction.customId === 'admin_set_mod_channel' || interaction.customId === 'admin_set_temp_cat' || interaction.customId === 'admin_set_temp_ttl') {
        // Usar modal para definir canal ID
        const modal = new ModalBuilder().setCustomId(interaction.customId + '_modal').setTitle('Definir');
        const label = interaction.customId === 'admin_set_temp_ttl' ? 'TTL em segundos (30-900)' : (interaction.customId === 'admin_set_temp_cat' ? 'ID da Categoria' : 'ID do Canal');
        const input = new TextInputBuilder().setCustomId('canal').setLabel(label).setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
      } else if (interaction.customId === 'admin_toggle_mod') {
        config.moderationEnabled = !config.moderationEnabled;
        saveJson(CONFIG_PATH, config);
  return safeReply(interaction, { content: `Moderação agora: ${config.moderationEnabled ? 'Ativa' : 'Desativada'}`, ephemeral: true });
      } else if (interaction.customId === 'admin_reset_usuario') {
        const modal = new ModalBuilder().setCustomId('admin_reset_usuario_modal').setTitle('Reset de Usuário');
        const input = new TextInputBuilder().setCustomId('usuario').setLabel('ID do usuário').setStyle(TextInputStyle.Short).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
      }
    } else if (interaction.customId === 'apresentacao_confirm') {
      const draft = drafts.get(interaction.user.id);
      if (!draft) return interaction.reply({ content: 'Nenhum rascunho encontrado.', ephemeral: true });
      if (config.moderationEnabled) {
        if (!config.moderationChannelId) return interaction.reply({ content: 'Moderação ativa mas canal de moderação não configurado.', ephemeral: true });
        const modCh = await interaction.guild.channels.fetch(config.moderationChannelId).catch(() => null);
        if (!modCh) return interaction.reply({ content: 'Canal de moderação inválido.', ephemeral: true });
        const pId = generateId();
  const record = { id: pId, userId: interaction.user.id, username: interaction.user.username, templateId: draft.template.id, description: draft.sobre, media: draft.midia || null, gender: draft.gender || null, status: 'pending', createdAt: Date.now() };
        presentations.push(record); savePresentations();
        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`mod_aprovar_${pId}`).setLabel('Aprovar').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`mod_rejeitar_${pId}`).setLabel('Rejeitar').setStyle(ButtonStyle.Danger)
        );
  await modCh.send({ content: `Apresentação pendente de <@${interaction.user.id}>`, embeds: [draft.embed], components: [actionRow] });
  drafts.delete(interaction.user.id);
  if (config.compactMode) { logPanelEvent(`Enviada p/ moderação: ${interaction.user.username}`); await updatePanel(interaction.guild); }
  return interaction.reply({ content: 'Sua apresentação foi enviada para moderação.', ephemeral: true });
      } else {
        // envio direto
  const gender = draft.gender || genderSelections.get(interaction.user.id);
  const splitActive = !!(config.targetChannelBoysId || config.targetChannelGirlsId);
  let channelIdFinal = null;
  if (splitActive) {
    if (!gender) return interaction.reply({ content: 'Seleção de gênero perdida. Reabra o fluxo selecionando gênero novamente.', ephemeral: true });
    if (gender === 'boys' && config.targetChannelBoysId) channelIdFinal = config.targetChannelBoysId;
    else if (gender === 'girls' && config.targetChannelGirlsId) channelIdFinal = config.targetChannelGirlsId;
    else return interaction.reply({ content: 'Canal específico para o gênero não configurado.', ephemeral: true });
  } else {
    channelIdFinal = config.targetChannelId;
  }
  if (!channelIdFinal) return interaction.reply({ content: 'Nenhum canal destino configurado.', ephemeral: true });
  const target = await interaction.guild.channels.fetch(channelIdFinal).catch(() => null);
        if (!target || !target.isTextBased()) return interaction.reply({ content: 'Canal destino inválido.', ephemeral: true });
        // Construir embed final sem prefixo de pré-visualização e sem username no título
        const finalEmbed = new EmbedBuilder()
          .setTitle('Apresentação')
          .setDescription(draft.sobre.substring(0,4000))
          .setColor(draft.template.color || 0x5865F2)
          .setFooter({ text: `Template: ${draft.template.nome}` })
          .setTimestamp();
        if (draft.midia) finalEmbed.setImage(draft.midia);
        await target.send({ content: `<@${interaction.user.id}>`, embeds: [finalEmbed] });
        const pId = generateId();
  const record = { id: pId, userId: interaction.user.id, username: interaction.user.username, templateId: draft.template.id, description: draft.sobre, media: draft.midia || null, gender: draft.gender || null, status: 'approved', createdAt: Date.now(), approvedAt: Date.now() };
        presentations.push(record); savePresentations();
        used.push(interaction.user.id); saveJson(USED_PATH, used);
        if (config.logChannelId) {
          const logCh = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
          if (logCh && logCh.isTextBased()) logCh.send({ content: `Apresentação aprovada (auto) de <@${interaction.user.id}> (${record.id}).` });
        }
        drafts.delete(interaction.user.id);
        return interaction.reply({ content: 'Apresentação publicada!', ephemeral: true });
      }
    } else if (interaction.customId === 'apresentacao_cancel') {
      drafts.delete(interaction.user.id);
      return interaction.reply({ content: 'Rascunho descartado.', ephemeral: true });
    } else if (interaction.customId === 'apresentacao_edit') {
      const draft = drafts.get(interaction.user.id);
      if (!draft) return interaction.reply({ content: 'Nenhum rascunho para editar.', ephemeral: true });
      const modal = new ModalBuilder().setCustomId('apresentacao_edit_modal').setTitle('Editar Apresentação');
      const sobreInput = new TextInputBuilder()
        .setCustomId('sobre')
        .setLabel('Fale sobre você (editar)')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(1000)
        .setRequired(true)
        .setValue(draft.sobre.substring(0,1000));
      const midiaInput = new TextInputBuilder()
        .setCustomId('midia')
        .setLabel('Link de mídia (opcional)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(draft.midia ? draft.midia.substring(0,400) : '');
      modal.addComponents(new ActionRowBuilder().addComponents(sobreInput), new ActionRowBuilder().addComponents(midiaInput));
      try { await interaction.showModal(modal); } catch (e) { console.error('Erro ao mostrar modal de edição', e); }
      return;
    } else if (interaction.customId.startsWith('mod_aprovar_') || interaction.customId.startsWith('mod_rejeitar_')) {
      if (!isOwner(interaction.user.id)) return interaction.reply({ content: 'Apenas owner (ou ampliar lógica de permissão futura).', ephemeral: true });
      const id = interaction.customId.split('_').pop();
      const record = presentations.find(p => p.id === id);
      if (!record) return interaction.reply({ content: 'Registro não encontrado.', ephemeral: true });
      if (record.status !== 'pending') return interaction.reply({ content: 'Já moderado.', ephemeral: true });
      const approve = interaction.customId.startsWith('mod_aprovar_');
      if (approve) {
        let channelModerationApprove = null;
        const splitActive = !!(config.targetChannelBoysId || config.targetChannelGirlsId);
        if (splitActive) {
          if (!record.gender) return interaction.reply({ content: 'Registro sem gênero salvo. Não é possível aprovar (inconsistência).', ephemeral: true });
          if (record.gender === 'boys' && config.targetChannelBoysId) channelModerationApprove = config.targetChannelBoysId;
          else if (record.gender === 'girls' && config.targetChannelGirlsId) channelModerationApprove = config.targetChannelGirlsId;
          else return interaction.reply({ content: 'Canal específico para o gênero não configurado.', ephemeral: true });
        } else {
          channelModerationApprove = config.targetChannelId;
        }
        if (!channelModerationApprove) return interaction.reply({ content: 'Nenhum canal destino configurado.', ephemeral: true });
        const target = await interaction.guild.channels.fetch(channelModerationApprove).catch(() => null);
        if (!target || !target.isTextBased()) return interaction.reply({ content: 'Canal destino inválido.', ephemeral: true });
        const template = ensureTemplate(record.templateId);
        const embed = new EmbedBuilder()
          .setTitle('Apresentação')
          .setDescription(record.description.substring(0,4000))
          .setColor(template.color || 0x5865F2)
          .setFooter({ text: `Template: ${template.nome}` })
          .setTimestamp(record.createdAt);
        if (record.media) embed.setImage(record.media);
        await target.send({ content: `<@${record.userId}>`, embeds: [embed] });
        record.status = 'approved';
        record.approvedAt = Date.now();
        record.moderatorId = interaction.user.id;
        if (!used.includes(record.userId)) { used.push(record.userId); saveJson(USED_PATH, used); }
        savePresentations();
        if (config.logChannelId) {
          const logCh = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
          if (logCh && logCh.isTextBased()) logCh.send({ content: `Apresentação aprovada por <@${interaction.user.id}> (user <@${record.userId}>) id=${record.id}` });
        }
        if (config.compactMode) { logPanelEvent(`Aprovada apresentação de ${record.username}`); await updatePanel(interaction.guild); }
        return interaction.reply({ content: 'Aprovada e publicada.', ephemeral: true });
      } else {
        record.status = 'rejected';
        record.moderatorId = interaction.user.id;
        savePresentations();
        if (config.logChannelId) {
          const logCh = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
          if (logCh && logCh.isTextBased()) logCh.send({ content: `Apresentação rejeitada por <@${interaction.user.id}> (user <@${record.userId}>) id=${record.id}` });
        }
        if (config.compactMode) { logPanelEvent(`Rejeitada apresentação de ${record.username}`); await updatePanel(interaction.guild); }
        return interaction.reply({ content: 'Rejeitada.', ephemeral: true });
      }
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'apresentacao_modal') {
      let sobre = interaction.fields.getTextInputValue('sobre');
      const midia = interaction.fields.getTextInputValue('midia');
  const selected = templateSelections.get(interaction.user.id);
  const template = ensureTemplate(selected);
      if (used.includes(interaction.user.id)) return interaction.reply({ content: 'Você já fez sua apresentação.', ephemeral: true });
      if (sobre.length > (config.maxDescriptionLength || 1000)) {
        sobre = sobre.substring(0, config.maxDescriptionLength);
      }
      const mediaCheck = validateMediaUrl(midia);
      if (!mediaCheck.ok) return interaction.reply({ content: `Mídia rejeitada: ${mediaCheck.reason}`, ephemeral: true });
      const embed = new EmbedBuilder()
        .setTitle('Apresentação')
        .setDescription(sobre.substring(0, 4000))
        .setColor(template.color || 0x5865F2)
        .setFooter({ text: `Template: ${template.nome}` })
        .setTimestamp();
      if (midia) embed.setImage(midia);
  const gender = genderSelections.get(interaction.user.id) || null;
  drafts.set(interaction.user.id, { embed, template, sobre, midia, gender });
      templateSelections.delete(interaction.user.id);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apresentacao_confirm').setLabel(config.moderationEnabled ? 'Enviar p/ Moderação' : 'Publicar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('apresentacao_edit').setLabel('Editar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('apresentacao_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({ content: 'Confirme abaixo sua apresentação.', embeds: [embed], components: [row], ephemeral: true });
    } else if (interaction.customId === 'apresentacao_edit_modal') {
      const draft = drafts.get(interaction.user.id);
      if (!draft) return interaction.reply({ content: 'Rascunho inexistente para editar.', ephemeral: true });
      let sobre = interaction.fields.getTextInputValue('sobre');
      const midia = interaction.fields.getTextInputValue('midia');
      if (sobre.length > (config.maxDescriptionLength || 1000)) {
        sobre = sobre.substring(0, config.maxDescriptionLength);
      }
      const mediaCheck = validateMediaUrl(midia);
      if (midia && !mediaCheck.ok) return interaction.reply({ content: `Mídia rejeitada: ${mediaCheck.reason}`, ephemeral: true });
      draft.sobre = sobre;
      draft.midia = midia || null;
      const template = draft.template;
      const embed = new EmbedBuilder()
        .setTitle('Apresentação')
        .setDescription(sobre.substring(0,4000))
        .setColor(template.color || 0x5865F2)
        .setFooter({ text: `Template: ${template.nome}` })
        .setTimestamp();
      if (draft.midia) embed.setImage(draft.midia);
      draft.embed = embed;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('apresentacao_confirm').setLabel(config.moderationEnabled ? 'Enviar p/ Moderação' : 'Publicar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('apresentacao_edit').setLabel('Editar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('apresentacao_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Danger)
      );
      return interaction.reply({ content: 'Rascunho atualizado. Confirme abaixo sua apresentação.', embeds: [embed], components: [row], ephemeral: true });
  } else if (interaction.customId === 'admin_set_painel_modal' || interaction.customId === 'admin_set_destino_modal' || interaction.customId === 'admin_set_destino_meninos_modal' || interaction.customId === 'admin_set_destino_meninas_modal' || interaction.customId === 'admin_set_log_modal' || interaction.customId === 'admin_set_mod_channel_modal' || interaction.customId === 'admin_set_temp_cat_modal' || interaction.customId === 'admin_set_temp_ttl_modal') {
      if (!isOwner(interaction.user.id)) return interaction.reply({ content: 'Apenas dono.', ephemeral: true });
      const canalId = interaction.fields.getTextInputValue('canal');
      if (interaction.customId === 'admin_set_temp_ttl_modal') {
        const val = parseInt(canalId, 10);
        if (isNaN(val) || val < 30 || val > 900) return interaction.reply({ content: 'TTL inválido. Use entre 30 e 900.', ephemeral: true });
        config.tempChannelTTLSeconds = val;
        saveJson(CONFIG_PATH, config);
        await interaction.reply({ content: 'TTL atualizado.', ephemeral: true });
        await interaction.followUp({ ...buildAdminPanel(), ephemeral: true });
        return;
      }
      const canal = await interaction.guild.channels.fetch(canalId).catch(() => null);
      if (!canal) return interaction.reply({ content: 'Canal/Categoria inválido.', ephemeral: true });
      const painelAnterior = config.presentationChannelId;
      if (interaction.customId.startsWith('admin_set_painel')) config.presentationChannelId = canalId; 
  else if (interaction.customId.startsWith('admin_set_destino_meninos')) config.targetChannelBoysId = canalId;
  else if (interaction.customId.startsWith('admin_set_destino_meninas')) config.targetChannelGirlsId = canalId;
  else if (interaction.customId.startsWith('admin_set_destino')) config.targetChannelId = canalId;
      else if (interaction.customId.startsWith('admin_set_log')) config.logChannelId = canalId;
      else if (interaction.customId.startsWith('admin_set_mod_channel')) config.moderationChannelId = canalId;
      else if (interaction.customId.startsWith('admin_set_temp_cat')) config.tempMediaCategoryId = canalId;
      // Só resetar panelMessageId se o canal de painel realmente mudou
      if (interaction.customId.startsWith('admin_set_painel')) {
        if (painelAnterior !== canalId) {
          console.log('[PAINEL] Canal de painel alterado. Resetando panelMessageId. (antes=', painelAnterior, 'depois=', canalId, ')');
          config.panelMessageId = null;
        } else {
          console.log('[PAINEL] Canal de painel definido igual ao anterior. Mantendo panelMessageId=', config.panelMessageId);
        }
      }
      saveJson(CONFIG_PATH, config);
      await interaction.reply({ content: 'Canal configurado.', ephemeral: true });
      // Criação/atualização automática do painel quando canal painel é definido ou permanece mesmo (garantir sync)
      if (interaction.customId.startsWith('admin_set_painel')) {
        try {
          const painelCh = await interaction.guild.channels.fetch(config.presentationChannelId).catch(() => null);
          if (painelCh) {
            const beforeId = config.panelMessageId;
            await sendMemberPanel(painelCh);
            const afterId = config.panelMessageId;
            if (beforeId && beforeId === afterId) {
              await interaction.followUp({ content: 'Painel atualizado no canal selecionado.', ephemeral: true });
            } else if (afterId) {
              await interaction.followUp({ content: 'Painel criado no novo canal.', ephemeral: true });
            } else {
              await interaction.followUp({ content: 'Não foi possível criar/atualizar painel (ver logs).', ephemeral: true });
            }
          } else {
            await interaction.followUp({ content: 'Canal painel não acessível para criar painel.', ephemeral: true });
          }
        } catch (e) {
          console.error('[PAINEL] Erro ao criar/atualizar painel após definir canal', e);
          await interaction.followUp({ content: 'Erro ao criar/atualizar painel (ver console).', ephemeral: true });
        }
      }
      await interaction.followUp({ ...buildAdminPanel(), ephemeral: true });
    } else if (interaction.customId === 'admin_reset_usuario_modal') {
      if (!isOwner(interaction.user.id)) return interaction.reply({ content: 'Apenas dono.', ephemeral: true });
      const usuarioId = interaction.fields.getTextInputValue('usuario');
      used = used.filter(u => u !== usuarioId); saveJson(USED_PATH, used);
      await interaction.reply({ content: 'Usuário resetado.', ephemeral: true });
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'template_select') {
      const picked = interaction.values[0];
      templateSelections.set(interaction.user.id, picked);
      const template = ensureTemplate(picked);
      // Tornar seleção silenciosa (não gerar mensagem ephemeral). Apenas atualiza painel se compactMode.
      if (config.compactMode) {
        logPanelEvent(`Template ${template.nome} por ${interaction.user.username}`);
        const embedTemp = new EmbedBuilder()
          .setTitle(`Template Selecionado: ${template.nome}`)
          .setDescription(template.descricao.substring(0,400) || 'Sem descrição.')
          .setColor(template.color || 0x5865F2);
        await updatePanel(interaction.guild, [embedTemp]);
      }
      try { await interaction.deferUpdate(); } catch {}
      return;
    } else if (interaction.customId === 'gender_select') {
      const picked = interaction.values[0]; // 'boys' ou 'girls'
      genderSelections.set(interaction.user.id, picked);
      if (config.compactMode) {
        logPanelEvent(`Gênero ${picked === 'boys' ? 'Meninos' : 'Meninas'} por ${interaction.user.username}`);
        await updatePanel(interaction.guild);
      }
      try { await interaction.deferUpdate(); } catch {}
      return;
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
