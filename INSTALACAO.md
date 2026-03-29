# Passo a passo - Instalar o GestorDesk em outro PC

Este guia mostra a forma atual de instalar o **GestorDesk** em outro computador. Voce pode:

- usar o **instalador (.exe)** (recomendado para uso no dia a dia);
- rodar via **codigo-fonte** (recomendado para desenvolvimento/suporte).

---

## Opcao 1: Instalacao pelo instalador (.exe)

Recomendado para quem so vai **usar** o sistema, sem desenvolver.

### Requisitos

- **Windows 10 ou 11** (64 bits)
- Espaço em disco: ~200 MB
- (Opcional) Conexao com a internet para sincronizacao com Supabase

### Passo 1: Gerar/obter o instalador

- No PC do projeto, gere o instalador com:

```bash
npm install
npm run dist
```

- O arquivo sera gerado na pasta **`release`**, com nome no formato:
  - **`GestorDesk Setup <versao>.exe`**
- Copie esse arquivo para o outro PC (pendrive, rede, compartilhamento etc.).

### Passo 2: Instalar no outro PC

1. No outro PC, localize o arquivo **`GestorDesk Setup <versao>.exe`**.
2. Clique com o botao direito -> **Executar como administrador** (ou de dois cliques).
3. Aceite o aviso de seguranca do Windows, se aparecer.
4. Siga o assistente de instalacao:
   - Escolha a pasta de instalacao (ou deixe a padrao).
   - Quando aparecer a tela de "apenas para mim" vs "para todos os usuarios":
     - Recomendado: **"Apenas para mim"** (o sistema guarda configuracoes e banco em `%APPDATA%` do usuario).
     - Em **"Para todos os usuarios"**, cada usuario do Windows ainda usa seu proprio `%APPDATA%\GestorDesk`.
   - Marque atalhos (Area de Trabalho/Menu Iniciar), se quiser.
5. Conclua a instalação.

### Passo 3: Revisar o arquivo `.env` (criado automaticamente)

Ao abrir o app pela primeira vez, o Electron cria automaticamente o arquivo **`.env`** no AppData do usuario.

1. Abra o GestorDesk uma vez (abrir e fechar).
2. No Explorador de Arquivos, acesse:
   ```text
   %APPDATA%\gestordesk
   ```
3. Abra o arquivo **`.env`** criado automaticamente.
4. Confira/ajuste os valores abaixo, se necessario:

   ```env
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_ANON_KEY=SUA_PUBLISHABLE_OU_LEGACY_ANON_KEY
   SUPABASE_AUTH_DOMAIN=gestordesk.local
   ```

5. Salve e feche o arquivo.

**Onde pegar esses valores**

- Acesse [supabase.com](https://supabase.com) -> seu projeto -> **Settings** -> **API**.
- **SUPABASE_URL**: campo "Project URL".
- **SUPABASE_ANON_KEY**: chave "anon" ou "public".

### Passo 4: Abrir o GestorDesk

- Use o atalho **GestorDesk** na Area de Trabalho ou no Menu Iniciar.
- Na primeira execucao, o banco local sera criado automaticamente em `%APPDATA%\GestorDesk\database.db`.
- Faca login com um usuario valido do sistema.

---

## Opcao 2: Instalacao a partir do codigo-fonte

Recomendado para **desenvolvedores** ou para suporte tecnico.

### Requisitos

- **Node.js** 18 ou superior ([nodejs.org](https://nodejs.org))
- **npm** (já vem com o Node.js)
- **Git** (opcional; para clonar o repositorio)

### Passo 1: Obter o projeto no outro PC

**Se usar Git**

```bash
git clone <URL_DO_REPOSITORIO> GestorDesk
cd GestorDesk
```

**Se nao usar Git:** copie a pasta do projeto para o outro PC.

### Passo 2: Instalar dependencias

No PowerShell/CMD, dentro da pasta do projeto:

```bash
npm install
```

Aguarde terminar (pode levar alguns minutos).

### Passo 3: Configurar o `.env`

1. Na raiz do projeto, copie **`.env.example`** para **`.env`**.
2. Abra o **`.env`** e preencha com os dados do seu projeto Supabase:

   ```env
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_ANON_KEY=SUA_PUBLISHABLE_OU_LEGACY_ANON_KEY
   SUPABASE_AUTH_DOMAIN=gestordesk.local
   ```

3. Salve o arquivo.

### Passo 4: Executar o aplicativo

Para rodar em modo desenvolvimento (Vite + Electron):

```bash
npm start
```

Para abrir apenas o desktop app apos build da interface:

```bash
npm run build
npm run electron
```

O banco SQLite **sempre** fica em **`%APPDATA%\GestorDesk\database.db`** (mesmo quando voce roda `npm start` ou `npm run electron`). O arquivo **`database.db` na raiz do projeto** serve de modelo na primeira copia e pode ser usado para recuperar dados se o app em userData estiver so com o cadastro padrao (sem produtos/vendas).

Se voce tinha variacoes so no `database.db` da pasta do projeto e o app mostra apenas **Tamanho**: feche o app, copie esse arquivo por cima de `%APPDATA%\GestorDesk\database.db` (facam backup do arquivo de destino antes), e abra de novo — ou apague o banco em userData **somente se** nao houver produtos/vendas importantes la, para na proxima abertura o app importar o da pasta do projeto automaticamente.

---

## Resumo rapido

| Cenário | O que fazer |
|--------|-------------|
| **Usar em outro PC** | Gerar/copiar `release\GestorDesk Setup <versao>.exe` -> instalar -> abrir o app 1x para gerar `.env` automaticamente em `%APPDATA%\gestordesk` |
| **Gerar novo instalador** | No projeto: `npm install` e `npm run dist` |
| **Rodar do código no outro PC** | Copiar/clonar projeto → `npm install` → criar `.env` na raiz → `npm start` ou `npm run build` + `npm run electron` |

---

## Solução de problemas

- **“Nao encontra o .env”**  
  Abra o app uma vez para ele gerar os arquivos locais e confirme que o `.env` existe em:
  - **Instalado:** `C:\Users\<SEU_USUARIO>\AppData\Roaming\gestordesk\.env`
  - **Codigo-fonte:** dentro da pasta **GestorDesk** (raiz do projeto).

- **Erro ao instalar (Windows)**
  Execute o `.exe` como administrador e, se necessario, libere o instalador no Windows Defender.

- **Sincronizacao nao funciona**
  Verifique `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `.env` e se o projeto Supabase esta ativo.

- **Banco vazio apos instalar**
  O banco local e criado na primeira execucao. Para popular dados de teste no ambiente de desenvolvimento, use scripts como `npm run seed:produtos` e `npm run seed:vendas`.

- **Sobrou so "Tamanho" nas variacoes apos atualizar**
  Os dados ficam em `%APPDATA%\GestorDesk\database.db`. Atualizar o instalador **nao** apaga essa pasta. Se voce cadastrou variacoes em outro arquivo (ex.: `database.db` na pasta do projeto), copie o arquivo certo para `%APPDATA%\GestorDesk\database.db` com o app fechado, ou veja a nota na secao "Opcao 2" acima.

Se seguir os passos acima, o GestorDesk ficara instalado e pronto para uso no outro PC.
