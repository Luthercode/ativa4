# Bot de Apresentação

Bot para permitir que cada membro faça UMA apresentação personalizada via painel em um canal específico. O bot gera uma embed e envia para outro canal destino.

## Funcionalidades
  - `/apconfig` painel admin.
  - `/apstats` estatísticas completas (pendentes, aprovadas, rejeitadas, etc.).
  - `/apreload` recarrega config.
  - `/apexport` exporta apresentações (JSON/CSV, aprovadas ou todas).
  - `/aptemplates` gerencia templates dinamicamente (add/remove/list).
  
### Novo: Upload de Mídia (/apattachment)

Use o comando `/apattachment` para enviar uma imagem / GIF / vídeo (até 25MB). O bot retorna uma URL CDN segura (https://cdn.discordapp.com/...) E agora mostra uma prévia (embed) com nome, tipo, tamanho e a própria imagem (ou nota para vídeo). Suporta: PNG, JPG, JPEG, GIF, WEBP, MP4, MOV (quicktime), WEBM e MKV (matroska).

Fluxo recomendado com o novo botão do painel:
1. Clique no botão "Adicionar Foto/Vídeo" no painel para abrir as instruções (ou simplesmente use diretamente `/apattachment`).
2. Execute `/apattachment` e selecione seu arquivo.
3. Confira a prévia no embed e copie a URL exibida (resposta é ephemeral).
4. Ao clicar em "Criar Apresentação", cole esta URL no campo de mídia do modal.
5. Continue o fluxo normalmente.

Observações:
- O botão "Adicionar Foto/Vídeo" não faz upload direto: ele serve como atalho instruindo o usuário a usar `/apattachment` e explicar o processo.
- Se um host estiver bloqueado por `allowedMediaHosts`, anexos do Discord continuam funcionando pois o bot libera automaticamente `cdn.discordapp.com` e `media.discordapp.net`.

## Mensagens Temporárias e Auto-Delete (Novo)
Mensagens auxiliares enviadas em canais temporários de upload (ex.: instruções dentro do canal recém-criado) agora podem ser removidas automaticamente após alguns segundos para evitar poluição visual.

Configuração:
- Campo `autoDeleteHelperSeconds` em `config.json` define em quantos segundos a mensagem auxiliar será apagada.
- Valor padrão: 30.
- Se definir 0 ou negativo, o bot ignora e NÃO apaga automaticamente.

Comportamento:
1. Ao criar um canal temporário de upload, o bot envia uma breve mensagem guiando o usuário.
2. Essa mensagem é programada para deletar após o tempo configurado.
3. A mídia enviada (mensagem do usuário) NÃO é apagada automaticamente.

Benefícios:
- Mantém o canal limpo.
- Evita necessidade de moderação manual das instruções.

Boas práticas:
- Ajuste para 15–45 segundos conforme o nível de familiaridade dos usuários.
- Para depuração, pode colocar um valor alto (ex.: 300) temporariamente.

## Requisitos
- Node 18+ (ESM / discord.js v14).
- Criar um bot no Portal do Discord, pegar TOKEN e CLIENT ID.

## Instalação
```powershell
npm install
```

## Configuração
Copie `.env.example` para `.env` e preencha:
```
DISCORD_TOKEN=seu_token
CLIENT_ID=seu_client_id
GUILD_ID=opcional_id_da_guild_para_registro_rapido
OWNER_ID=seu_id_de_usuario
```

Campos principais de `config.json` (resumo adicional):
- `presentationChannelId`: Canal onde fica o painel público.
- `targetChannelId`: Canal geral de destino (se não usar split de gênero).
- `targetChannelBoysId` / `targetChannelGirlsId`: Canais específicos por gênero.
- `logChannelId`: Canal de log se `compactMode` = false (ou também pode receber logs resumidos).
- `moderationEnabled`: Boolean para fila de moderação.
- `moderationChannelId`: Canal onde chegam os drafts para aprovar.
- `panelMessageId`: ID da mensagem do painel (para atualizar / reusar sem duplicar).
- `rateLimitSeconds`: Cooldown mínimo entre tentativas de abrir modal.
- `maxDescriptionLength`: Limite de caracteres da descrição no modal.
- `allowedMediaHosts`: Array de hosts permitidos para URLs de mídia.
- `templates`: Lista de templates exibidos no select.
- `compactMode`: Se true, mensagens de log são condensadas em menos linhas.
- `tempMediaCategoryId`: Categoria onde canais temporários de upload são criados.
- `tempChannelTTLSeconds`: Tempo de vida de um canal temporário antes de ser deletado.
- `autoDeleteHelperSeconds`: Tempo para auto-delete da mensagem auxiliar no canal temporário (30 padrão; 0 = desativa).

## Registrar comandos
Se quiser registrar só na guild (mais rápido para desenvolvimento) preencha `GUILD_ID`.
```powershell
npm run register
```
Se não tiver `GUILD_ID` os comandos serão globais (demoram até 1h para propagar).

## Executar
```powershell
npm start
```

## Edição de Rascunho (Novo)
Após preencher o modal inicial e receber a prévia, agora aparece o botão **Editar** junto de **Publicar/Enviar p/ Moderação** e **Cancelar**. Você pode:
1. Clicar em Editar para reabrir o modal já preenchido.
2. Ajustar texto e/ou link de mídia.
3. Confirmar novamente.

O rascunho só é fixado definitivamente após publicar (ou ir para moderação). Enquanto não confirmar, pode editar quantas vezes quiser.

## Uso (Modo Normal)
1. Execute `/apconfig`.
2. Configure: Painel, Destino (ou canais Meninos/Meninas), (opcional) Log.
3. Gere o painel público.
4. Usuário escolhe um template E seleciona gênero (Meninos/Meninas) no painel.
5. Clica em Criar, preenche modal e confirma.
6. Publica direto (sem moderação) ou vai para fila (se moderação ativa).

## Uso (Com Moderação)
1. Ative moderação com botão Toggle Moderação no painel admin.
2. Defina canal de moderação + canais de destino (geral ou meninos/meninas).
3. Usuário escolhe template + gênero, cria rascunho e envia (vai para canal de moderação).
4. Staff clica Aprovar/Rejeitar.
5. Aprovar publica no canal de gênero correspondente ou, se não configurado, no canal destino geral.
6. Rejeitar marca como `rejected` (pode resetar para permitir nova tentativa).

## Divisão por Gênero (Novo)
Agora é possível separar publicações em dois canais distintos (Meninos / Meninas):
1. No `/apconfig`, defina opcionalmente Canal Meninos e Canal Meninas.
2. O painel exibirá um seletor extra de gênero.
3. O usuário precisa selecionar gênero antes de clicar em Criar Apresentação.
4. Publicação direta ou aprovação de moderação envia para o canal correto; se o canal específico não estiver configurado cai no canal destino geral.

Fallback / Regras:
- Se gênero = meninos e Canal Meninos configurado → usa esse.
- Se gênero = meninas e Canal Meninas configurado → usa esse.
- Caso contrário → usa Canal Destino geral (`targetChannelId`).
- Se nada estiver configurado: erro informando ausência de canal.

Moderação:
- Os registros armazenam `gender` para direcionar corretamente no momento da aprovação.
- A mudança de gênero após criar o draft requer recriar (ou adicionar futura função de editar gênero, se necessário).

## Templates
Definidos em `src/data/config.json` dentro do array `templates`.
Cada objeto:
```json
{
  "id": "clean",
  "nome": "Clássico Limpo",
  "descricao": "Layout simples com título e descrição.",
  "color": 5793266
}
```
Você pode adicionar novos (reinicie o bot para carregar ou implemente hot-reload futuro).

## Resetar Apresentação de Alguém
Use o botão "Reset Usuário" no painel admin: remove da lista `used` (não apaga registros históricos em `presentations.json`).

## Próximas Melhorias (sugestões)
- Armazenar tudo em banco (SQLite) em vez de JSON.
- Adicionar comando para exportar todas apresentações em JSON/CSV.
- Suporte a anexos reais (upload) com verificação.
- Internacionalização.
- Paginação/scroll de templates se houver muitos.

## Segurança / Limites
- URLs de mídia verificadas apenas superficialmente (host + extensão).
- Recomendado restringir permissões no canal do painel para evitar flood.
- Dados são armazenados em arquivos JSON — para produção considere banco (SQLite/Postgres).
- Rate limit básico por usuário; se quiser reforçar, adicione camadas (ex: cooldown por IP via gateway reverse proxy em outra camada).

## Troubleshooting
### Erro: `ERR_INVALID_MODULE_SPECIFIER` ao registrar comandos
Motivo: import dinâmico usando caminho tipo `path.join('./commands', file)` pode gerar barra invertida no Windows e o Node ESM interpreta como nome de pacote.

Solução implementada: uso de `new URL(`./commands/${file}`, import.meta.url).pathname` para obter caminho válido independente de SO.

Se ainda ocorrer:
1. Verifique se "type": "module" está no `package.json`.
2. Rode com Node 18+.
3. Limpe cache: feche terminal e abra novamente.
4. Teste um import manual no REPL:
  ```js
  import(path.resolve('src/commands/apconfig.js')).then(m=>console.log('ok')).catch(console.error);
  ```

### Comandos não aparecem no Discord
- Se usou registro global sem `GUILD_ID`, pode demorar até 1h.
- Confirme se `CLIENT_ID` corresponde ao bot correto.
- Verifique se o bot tem escopo `applications.commands` e está no servidor.

### Moderação não publica
- Confirme se `moderationEnabled` está true e `moderationChannelId` configurado via painel.
- Canal de destino precisa ser configurado também.

### Export grande não aparece
Se a saída exceder limite de caracteres, o arquivo é salvo localmente (lado do servidor). Faça download direto do host ou adapte a lógica para enviar como anexo.

## Licença
Uso livre para seu servidor.

## Deploy (GitHub + Replit / Hospedar 24/7)

### 1. Subir para o GitHub
1. Crie um repositório novo (privado recomendado se não quiser expor o código ou configs).
2. Garanta que o arquivo `.gitignore` inclui `node_modules/` e `.env` (já fornecido aqui).
3. Rode os comandos locais:
```powershell
git init
git add .
git commit -m "Inicial"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/NOME_REPO.git
git push -u origin main
```

### 2. Preparar Replit
1. Acesse replit.com e importe o repositório do GitHub.
2. Após importar, vá em Secrets (ou variável de ambiente) e adicione:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - (Opcional) `GUILD_ID`
   - `OWNER_ID`
3. Confirme se o arquivo `package.json` tem o script start: `node src/index.js`.
4. Caso Replit não detecte automaticamente, crie (ou edite) um arquivo `.replit`:
```
run = "npm install && npm start"
```
Isso garante que dependências sejam instaladas antes de iniciar.

### 3. Manter Online
- Replit free pode hibernar; opções:
  - Usar Replit Deploys (pago) ou Always On.
  - Alternativa: UptimeRobot pingando uma rota HTTP — você pode criar um pequeno servidor HTTP no mesmo processo.

Exemplo simples (opcional) para evitar hibernação criando um mini keep-alive HTTP:
```js
// Adicione no início do index.js (ou arquivo separado) se quiser expor uma porta HTTP
import http from 'node:http';
http.createServer((_, res) => { res.writeHead(200); res.end('OK'); }).listen(process.env.PORT || 3000);
```
Depois configure um monitor (UptimeRobot) apontando para a URL fornecida pelo Replit (https://seuprojeto.seuusuario.repl.co/).

### 4. Registrar Comandos no Ambiente de Produção
Dentro do console do Replit (Shell):
```bash
node src/register-commands.js
```
Se usar `GUILD_ID` a propagação é quase instantânea.

### 5. Atualizar Código Futuramente
Local:
```powershell
git add .
git commit -m "feat: melhoria X"
git push
```
No Replit: clique em Pull (ou reimporte) para sincronizar.

### 6. Segurança
- Nunca commitar `.env`.
- Não exponha `DISCORD_TOKEN` em logs públicos.
- Revogue o token se suspeitar de vazamento.

### 7. Arquivos Persistentes
- Os arquivos JSON em `src/data` (ex.: `presentations.json`, `used.json`) foram adicionados ao `.gitignore` para evitar expor dados dos usuários. Se quiser backup versionado, remova-os do `.gitignore` conscientemente.

---
