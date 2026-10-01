const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const {
  TIMEOUT_ENCERRAMENTO_MS,
  shouldCheckForUpdates,
  aceitarAtualizacao,
  tagCorrespondeVersao,
  classificarErroAtualizacao,
  sanitizarEstado,
  caminhoPersistenteForaDaInstalacao,
  bancoTemDadosDeLoja,
  contemTokenGitHub,
  validarConfigPublicacao,
  criarFluxoEncerramento,
} = require('../electron/atualizacaoPolitica.cjs')
const { avaliarBancoParaPublicacao } = require('../scripts/verificar-banco-publicacao.cjs')

const raiz = path.join(__dirname, '..')

function fluxoDeTeste(opcoes) {
  return criarFluxoEncerramento({
    sincronizar: async () => {},
    instalar: () => true,
    sair: () => {},
    timeoutMs: 5000,
    agendar: () => null,
    cancelar: () => {},
    ...opcoes,
  })
}

test('instalação só acontece depois do sync', async () => {
  let liberarSync
  const sync = new Promise((resolve) => {
    liberarSync = resolve
  })
  let instalou = 0
  let saiu = 0
  const fluxo = fluxoDeTeste({
    sincronizar: () => sync,
    instalar: () => {
      instalou += 1
      return true
    },
    sair: () => {
      saiu += 1
    },
  })

  assert.deepEqual(fluxo.pedirInstalacao(true), { ok: true, reason: 'quit' })
  const saida = fluxo.beforeQuit()
  assert.equal(saida.preventDefault, true)
  assert.equal(instalou, 0)
  liberarSync()
  const fim = await saida.concluido
  assert.deepEqual(fim, { acao: 'instalar', motivo: 'sync' })
  assert.equal(instalou, 1)
  assert.equal(saiu, 0)
})

test('timeout instala se o sync não voltar', async () => {
  let instalou = 0
  const fluxo = criarFluxoEncerramento({
    sincronizar: () => new Promise(() => {}),
    instalar: () => {
      instalou += 1
      return true
    },
    sair: () => {},
    timeoutMs: 30,
  })
  fluxo.pedirInstalacao(true)
  const fim = await fluxo.beforeQuit().concluido
  assert.equal(fim.motivo, 'timeout')
  assert.equal(fim.acao, 'instalar')
  assert.equal(instalou, 1)
})

test('segundo pedido de instalação não dispara outro instalador', async () => {
  let instalou = 0
  const fluxo = fluxoDeTeste({
    instalar: () => {
      instalou += 1
      return true
    },
  })
  assert.equal(fluxo.pedirInstalacao(true).ok, true)
  assert.deepEqual(fluxo.pedirInstalacao(true), { ok: false, reason: 'already-quitting' })
  await fluxo.beforeQuit().concluido
  assert.equal(instalou, 1)
  assert.deepEqual(fluxo.pedirInstalacao(true), { ok: false, reason: 'already-quitting' })
})

test('fechamento normal sincroniza e não instala', async () => {
  let instalou = 0
  let saiu = 0
  let sincronizou = 0
  const fluxo = fluxoDeTeste({
    sincronizar: async () => {
      sincronizou += 1
    },
    instalar: () => {
      instalou += 1
      return true
    },
    sair: () => {
      saiu += 1
    },
  })
  const primeira = fluxo.beforeQuit()
  const segunda = fluxo.beforeQuit()
  assert.equal(primeira.preventDefault, true)
  assert.equal(segunda.preventDefault, false)
  const fim = await primeira.concluido
  assert.deepEqual(fim, { acao: 'sair', motivo: 'sync' })
  assert.equal(sincronizou, 1)
  assert.equal(instalou, 0)
  assert.equal(saiu, 1)
})

test('falha de sync ainda encerra e instalação indisponível não prende o app', async () => {
  const comErro = fluxoDeTeste({
    sincronizar: async () => {
      throw new Error('sem rede')
    },
  })
  const erro = await comErro.beforeQuit().concluido
  assert.deepEqual(erro, { acao: 'sair', motivo: 'sync-erro' })

  let saiu = 0
  const semPacote = fluxoDeTeste({
    instalar: () => false,
    sair: () => {
      saiu += 1
    },
  })
  semPacote.pedirInstalacao(true)
  const fim = await semPacote.beforeQuit().concluido
  assert.equal(fim.acao, 'sair')
  assert.equal(fim.motivo, 'instalacao-indisponivel')
  assert.equal(saiu, 1)
  assert.deepEqual(semPacote.pedirInstalacao(false), { ok: false, reason: 'not-downloaded' })
})

test('erros de rede, GitHub e download', () => {
  assert.equal(classificarErroAtualizacao({ statusCode: 404 }).status, 'not-available')
  assert.equal(classificarErroAtualizacao(new Error('Cannot find latest.yml')).status, 'not-available')
  assert.equal(classificarErroAtualizacao(new Error('getaddrinfo ENOTFOUND github.com')).status, 'error')
  assert.match(classificarErroAtualizacao({ statusCode: 401 }).mensagem, /pública/)
  assert.equal(classificarErroAtualizacao(new Error('socket hang up'), 'baixar').mensagem, 'O download da atualização falhou.')
  const estado = sanitizarEstado({ status: 'baixando', progresso: 140, mensagem: 'x'.repeat(300), versaoNova: ' 2.2.0 ' }, '2.1.0')
  assert.equal(estado.status, 'error')
  assert.equal(estado.progresso, 100)
  assert.equal(estado.mensagem.length, 240)
  assert.equal(estado.versaoNova, '2.2.0')
})

test('desenvolvimento não verifica atualização sem pedido explícito', () => {
  assert.equal(shouldCheckForUpdates({ isPackaged: false }), false)
  assert.equal(shouldCheckForUpdates({ isPackaged: false, forceEnv: '0' }), false)
  assert.equal(shouldCheckForUpdates({ isPackaged: false, forceEnv: '1' }), true)
  assert.equal(shouldCheckForUpdates({ isPackaged: true }), true)
})

test('tag precisa ser exatamente v mais a versão e downgrade é recusado', () => {
  assert.equal(tagCorrespondeVersao('v2.1.0', '2.1.0'), true)
  assert.equal(tagCorrespondeVersao('v2.0.0', '2.1.0'), false)
  assert.equal(tagCorrespondeVersao('2.1.0', '2.1.0'), false)
  assert.equal(tagCorrespondeVersao('V2.1.0', '2.1.0'), false)
  assert.equal(aceitarAtualizacao('2.0.0', '2.1.0'), false)
  assert.equal(aceitarAtualizacao('2.1.0', '2.1.0'), false)
  assert.equal(aceitarAtualizacao('2.1.1', '2.1.0'), true)
  assert.equal(TIMEOUT_ENCERRAMENTO_MS, 12000)

  const pkg = require('../package.json')
  const valida = validarConfigPublicacao({
    publish: pkg.build.publish,
    tag: `v${pkg.version}`,
    version: pkg.version,
    token: 'token-de-teste',
    exigirToken: true,
    exigirTag: true,
  })
  assert.equal(valida.ok, true, valida.erros.join(' '))
  const divergente = validarConfigPublicacao({
    publish: pkg.build.publish,
    tag: 'v9.9.9',
    version: pkg.version,
    token: '',
    exigirToken: true,
    exigirTag: true,
  })
  assert.equal(divergente.ok, false)
  assert.equal(contemTokenGitHub('GH_TOKEN=abc'), false)
  assert.equal(contemTokenGitHub('GH_TOKEN="abc"'), true)
})

test('banco e configuração ficam fora da pasta instalada e a publicação recusa dados da loja', () => {
  assert.equal(caminhoPersistenteForaDaInstalacao(
    'C:\\Users\\loja\\AppData\\Roaming\\GestorDesk\\database.db',
    'C:\\Users\\loja\\AppData\\Local\\Programs\\GestorDesk',
  ), true)
  assert.equal(caminhoPersistenteForaDaInstalacao(
    'C:\\Users\\loja\\AppData\\Roaming\\gestordesk\\.env',
    'C:\\Users\\loja\\AppData\\Local\\Programs\\GestorDesk',
  ), true)
  assert.equal(caminhoPersistenteForaDaInstalacao(
    'C:\\Programas\\GestorDesk\\resources\\database.db',
    'C:\\Programas\\GestorDesk',
  ), false)
  assert.equal(bancoTemDadosDeLoja({ produtos: 0, vendas: 0 }), false)
  assert.equal(bancoTemDadosDeLoja({ produtos: 1, vendas: 0 }), true)

  const ausente = path.join(os.tmpdir(), `gestordesk-ausente-${Date.now()}.db`)
  assert.equal(avaliarBancoParaPublicacao(ausente).motivo, 'ausente')

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gestordesk-atualizacao-'))
  const vazio = path.join(dir, 'vazio.db')
  const cheio = path.join(dir, 'cheio.db')
  const dbVazio = new DatabaseSync(vazio)
  dbVazio.close()
  assert.equal(avaliarBancoParaPublicacao(vazio).ok, true)

  const dbCheio = new DatabaseSync(cheio)
  dbCheio.exec('CREATE TABLE produtos (id INTEGER PRIMARY KEY)')
  dbCheio.prepare('INSERT INTO produtos (id) VALUES (1)').run()
  dbCheio.close()
  const recusado = avaliarBancoParaPublicacao(cheio)
  assert.equal(recusado.ok, false)
  assert.equal(recusado.motivo, 'dados-da-loja')
  assert.equal(fs.existsSync(cheio), true)

  const main = fs.readFileSync(path.join(raiz, 'electron', 'main.cjs'), 'utf8')
  const updater = fs.readFileSync(path.join(raiz, 'electron', 'updater.cjs'), 'utf8')
  const politica = fs.readFileSync(path.join(raiz, 'electron', 'atualizacaoPolitica.cjs'), 'utf8')
  const instalador = fs.readFileSync(path.join(raiz, 'scripts', 'build-installer.cjs'), 'utf8')
  assert.match(main, /app\.getPath\('userData'\)/)
  assert.match(main, /timeoutMs: TIMEOUT_ENCERRAMENTO_MS/)
  assert.match(main, /sincronizar: \(\) => syncWithSupabase\(\)/)
  assert.match(updater, /autoInstallOnAppQuit = false/)
  assert.match(updater, /allowDowngrade = false/)
  assert.match(updater, /if \(!deveVerificar\(\)\)/)
  assert.match(instalador, /--publish',\s*'never'/)
  assert.equal(contemTokenGitHub(main + updater + politica), false)
  assert.doesNotMatch(updater, /unlink|rmSync|copyFile/)
  assert.doesNotMatch(politica, /unlink|rmSync|copyFile/)
})
