# Atualizações automáticas do GestorDesk

O aplicativo instalado procura novas versões no GitHub Releases, baixa o instalador e só troca a versão quando alguém confirma. O banco SQLite e o `.env` ficam fora da pasta substituída pelo instalador.

Nada neste arquivo publica uma release. Publicar continua sendo um passo manual, feito por uma tag.

## Arquitetura

- O `electron-builder` gera o instalador NSIS, o `latest.yml` e o `.blockmap`. A configuração está em `package.json`, com provedor `github`, conta `Fr4nc021` e repositório `GestorDesk`.
- No aplicativo empacotado, `electron/updater.cjs` chama `checkForUpdates` depois que a janela principal está pronta. A abertura do sistema não espera essa consulta nem o download.
- Em desenvolvimento (`npm start`) a consulta não acontece. Ela só liga com `GESTORDESK_FORCE_UPDATES=1`, e mesmo assim falta um `dev-app-update.yml`, que não faz parte do projeto.
- O download começa sozinho quando existe uma versão mais nova. A instalação não começa sozinha: `autoInstallOnAppQuit` fica desligado e versões mais antigas são recusadas.
- A interface recebe o estado por IPC, pelos canais `atualizacao:estado`, `atualizacao:verificar`, `atualizacao:instalar` e pelo evento `atualizacao:evento`. O preload não expõe `autoUpdater` nem outras APIs do Electron.
- O aviso fica no layout autenticado e na aba Atualização, em Configurações. A tela de login não mostra esse aviso.
- Ao confirmar a instalação, o processo pede para sair. O `before-quit` existente sincroniza com o Supabase e, no máximo em 12 segundos, chama `quitAndInstall` uma única vez. Fechar o aplicativo no dia a dia continua só sincronizando.

O banco usado pelo sistema fica em `%APPDATA%\GestorDesk\database.db`. A configuração do Supabase fica em `%APPDATA%\gestordesk\.env`. Os dois caminhos estão fora do diretório de instalação. O atualizador não apaga, copia nem recria esses arquivos.

O `database.db` da raiz do projeto, quando existe, continua sendo apenas o modelo opcional empacotado. O script `scripts/validar-release.cjs` recusa a publicação se esse arquivo tiver linhas em `produtos` ou `vendas`.

## Configuração no GitHub

Repositório: `https://github.com/Fr4nc021/GestorDesk`.

Em 1º de outubro de 2026 a página do repositório abriu sem login. A API `releases/latest` respondeu 404 porque ainda não havia release, não porque o repositório estivesse fechado. Uma release pública poderá ser baixada pelo aplicativo sem token.

Mantenha o repositório público. Se ele passar a ser privado, o aplicativo recebe 404 ou 401 e a atualização falha. Não coloque token do GitHub no código, no `.env` do aplicativo nem no executável.

No GitHub, em **Settings → Actions → General → Workflow permissions**, escolha **Read and write permissions**. O workflow `.github/workflows/release.yml` usa essa permissão para criar a release. Ele só dispara em tags `v*`.

## Secrets e variáveis

| Nome | Onde | Função |
| --- | --- | --- |
| `GITHUB_TOKEN` | secret automático do Actions | autentica a criação da release |
| `GH_TOKEN` | variável do workflow, preenchida com `secrets.GITHUB_TOKEN` | nome que o `electron-builder` espera |

Não crie um token pessoal para colocar dentro do GestorDesk. Não commite `.env`. O workflow falha com mensagem explícita se a tag não bater com `package.json`, se `GH_TOKEN` estiver vazio ou se o `database.db` da raiz tiver dados da loja.

## Gerar uma versão de produção

No computador de build, sem publicar:

```bash
npm ci
npm test
npm run dist
```

`npm run dist` chama o `electron-builder` com `--publish never`. O instalador sai em `release/build-<data>/`. Esse comando não envia nada ao GitHub.

Não use `npm run dist:clean` para preparar uma release da loja. Esse script apaga dados do `database.db` da raiz do projeto.

## Publicar uma nova versão

1. Aumente a versão para um número maior do que o que está instalado na loja. A versão atual do projeto é `2.1.0`. Se a cliente já usa essa versão sem o atualizador, a primeira release com atualização automática precisa ser maior, por exemplo `2.1.1`.

```bash
npm version patch
```

`npm version` grava a nova versão no `package.json` e cria um commit e uma tag local `vX.Y.Z`. Só faça isso quando quiser publicar.

2. Envie o commit e, separadamente, a tag. A tag tem de ser exatamente `v` mais a versão do `package.json`.

```bash
git push origin HEAD
git push origin vX.Y.Z
```

3. O Actions gera o frontend, valida a tag e publica o instalador NSIS, o `latest.yml` e o `.blockmap` numa GitHub Release. A release sai publicada, não como rascunho.

4. Abra a release e confira se esses três artefatos estão lá. Se o workflow falhar, nenhuma atualização chega nas lojas.

`npm run dist:publish` faz a mesma publicação a partir da máquina local e também exige `GH_TOKEN` e `GITHUB_REF_NAME=vX.Y.Z`. O caminho previsto é o Actions, para o token não ficar gravado no projeto.

## Testar em outro computador

1. Instale manualmente a primeira versão que contém este atualizador. O GestorDesk que já está na loja, sem este código, não passa a se atualizar sozinho.
2. Publique uma versão seguinte, com número maior.
3. Abra o aplicativo no outro computador, com internet, e entre no sistema. O aviso aparece depois do login, não na tela de login.
4. Espere o download e clique em **Reiniciar e instalar**. O aplicativo sincroniza, fecha e abre de novo na versão nova.
5. Confira se `%APPDATA%\GestorDesk\database.db` continua no lugar e se produtos e vendas seguem lá. Não apague esse arquivo para testar.

`npm start` neste repositório não consulta o GitHub. A aba Atualização deve informar que a verificação está desligada no desenvolvimento.

Não há, ainda, uma release publicada. Por isso o download real contra o GitHub não foi executado daqui.

## Erros comuns

- **Tag diferente da versão.** `v2.1.1` com `package.json` em `2.1.0` faz o workflow parar antes de publicar.
- **Actions sem permissão de escrita.** A release não é criada. Ajuste Workflow permissions para leitura e escrita.
- **Repositório privado.** O aplicativo não baixa `latest.yml`. Não resolva isso embutindo token.
- **Nenhuma release ainda.** O aplicativo trata 404 na consulta como “nenhuma atualização publicada”, sem bloquear o uso.
- **Sem internet ou GitHub fora.** Aparece um aviso e o botão Tentar novamente. O PDV continua abrindo.
- **Aplicativo antigo.** A versão instalada antes deste código precisa ser substituída uma vez pelo instalador novo.
- **Versão mais antiga publicada depois.** O aplicativo não instala por cima de uma versão mais nova.

## Reverter uma release problemática

Não apague a tag esperando que as lojas voltem sozinhas para a versão anterior. O atualizador não instala downgrade.

1. Corrija o problema no código.
2. Publique uma versão com número maior, pela mesma sequência de tag.
3. Se a release ruim ainda for a última, marque-a no GitHub como pre-release para ela deixar de ser a estável oferecida às instalações que ainda não baixaram.

Quem já instalou a versão com problema só recebe a correção quando existir uma versão mais nova publicada.
