const path = require('path')

const STATUS_ATUALIZACAO = new Set([
  'idle',
  'dev',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'not-available',
  'error',
])

const TIMEOUT_ENCERRAMENTO_MS = 12000

function shouldCheckForUpdates({ isPackaged = false, forceEnv = '' } = {}) {
  if (String(forceEnv) === '1') return true
  return Boolean(isPackaged)
}

function compararVersoes(esquerda, direita) {
  const partes = (valor) => String(valor ?? '')
    .split('.')
    .slice(0, 3)
    .map((parte) => {
      const numero = parseInt(parte, 10)
      return Number.isFinite(numero) ? numero : 0
    })

  const a = partes(esquerda)
  const b = partes(direita)
  for (let i = 0; i < 3; i += 1) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

function aceitarAtualizacao(candidata, atual) {
  return compararVersoes(candidata, atual) > 0
}

function tagCorrespondeVersao(tag, version) {
  return typeof tag === 'string'
    && typeof version === 'string'
    && tag.length > 0
    && tag === `v${version}`
}

function classificarErroAtualizacao(err, fase = 'verificar') {
  const message = String(err?.message || err || '')
  const status = Number(err?.statusCode || err?.status || 0)
  const semRelease = status === 404
    || /\b404\b/.test(message)
    || /latest\.yml/i.test(message)
    || /no published versions/i.test(message)

  if (fase === 'verificar' && semRelease) {
    return {
      status: 'not-available',
      mensagem: 'Nenhuma atualização publicada.',
    }
  }

  if (status === 401 || status === 403 || /\b(401|403)\b/.test(message) || /unauthorized|forbidden/i.test(message)) {
    return {
      status: 'error',
      mensagem: 'Não foi possível baixar a atualização. A release precisa estar pública, sem token no aplicativo.',
    }
  }

  if (/ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ERR_INTERNET|ERR_NETWORK|getaddrinfo|offline/i.test(message)) {
    return {
      status: 'error',
      mensagem: 'Não foi possível verificar atualizações. Sem conexão ou o GitHub está indisponível.',
    }
  }

  if (fase === 'baixar') {
    return {
      status: 'error',
      mensagem: 'O download da atualização falhou.',
    }
  }

  return {
    status: 'error',
    mensagem: 'Não foi possível verificar atualizações.',
  }
}

function sanitizarEstado(entrada, versaoAtual) {
  const status = STATUS_ATUALIZACAO.has(entrada?.status) ? entrada.status : 'error'
  const progressoNumero = Number(entrada?.progresso)
  const progresso = Number.isFinite(progressoNumero)
    ? Math.max(0, Math.min(100, Math.round(progressoNumero)))
    : null
  const versaoNova = typeof entrada?.versaoNova === 'string' && entrada.versaoNova.trim()
    ? entrada.versaoNova.trim().slice(0, 32)
    : null

  return {
    status,
    versaoAtual: String(versaoAtual || ''),
    versaoNova,
    progresso,
    mensagem: String(entrada?.mensagem || '').slice(0, 240),
  }
}

function caminhoPersistenteForaDaInstalacao(persistente, instalacao) {
  if (!persistente || !instalacao) return false
  const alvo = path.resolve(String(persistente))
  const raiz = path.resolve(String(instalacao))
  const relativo = path.relative(raiz, alvo)
  const dentro = relativo === '' || (!relativo.startsWith('..') && !path.isAbsolute(relativo))
  return !dentro
}

function bancoTemDadosDeLoja({ produtos = 0, vendas = 0 } = {}) {
  return Number(produtos) > 0 || Number(vendas) > 0
}

function contemTokenGitHub(texto) {
  const conteudo = String(texto || '')
  return /ghp_[A-Za-z0-9]{20,}/.test(conteudo)
    || /github_pat_[A-Za-z0-9_]{20,}/.test(conteudo)
    || /GH_TOKEN\s*=\s*['"][^'"]+['"]/.test(conteudo)
}

function validarConfigPublicacao({
  publish,
  tag = '',
  version = '',
  token = '',
  exigirToken = false,
  exigirTag = false,
} = {}) {
  const erros = []
  const config = Array.isArray(publish) ? publish[0] : publish

  if (!config || config.provider !== 'github') {
    erros.push('A publicação precisa usar o provedor github do electron-updater.')
  }
  if (!config?.owner || !config?.repo || /placeholder|todo|changeme/i.test(`${config?.owner}${config?.repo}`)) {
    erros.push('Informe owner e repo reais do GitHub na configuração de publicação.')
  }
  if (config?.owner && config?.repo && (config.owner !== 'Fr4nc021' || config.repo !== 'GestorDesk')) {
    erros.push('O repositório de publicação deve ser Fr4nc021/GestorDesk, o remote já configurado.')
  }
  if (config && config.releaseType && config.releaseType !== 'release') {
    erros.push('A release precisa ser publicada como release, para o aplicativo conseguir baixá-la sem token.')
  }

  if (exigirTag && !tag) {
    erros.push('GITHUB_REF_NAME ausente. A publicação só pode ocorrer a partir de uma tag vX.Y.Z.')
  } else if (tag && !tagCorrespondeVersao(tag, version)) {
    erros.push(`A tag ${tag} não corresponde à versão v${version} do package.json.`)
  }

  if (exigirToken && !String(token || '').trim()) {
    erros.push('GH_TOKEN ausente. No GitHub Actions use secrets.GITHUB_TOKEN, sem gravar o token no projeto.')
  }

  return { ok: erros.length === 0, erros }
}

function criarFluxoEncerramento({
  sincronizar,
  instalar,
  sair,
  timeoutMs = TIMEOUT_ENCERRAMENTO_MS,
  agendar = setTimeout,
  cancelar = clearTimeout,
} = {}) {
  if (typeof sincronizar !== 'function') throw new Error('sincronizar é obrigatório')
  if (typeof instalar !== 'function') throw new Error('instalar é obrigatório')
  if (typeof sair !== 'function') throw new Error('sair é obrigatório')

  let syncOnQuitDone = false
  let quitForUpdateRequested = false
  let installStarted = false

  function pedirInstalacao(updateDownloaded) {
    if (!updateDownloaded) return { ok: false, reason: 'not-downloaded' }
    if (quitForUpdateRequested || installStarted) return { ok: false, reason: 'already-quitting' }
    quitForUpdateRequested = true
    return { ok: true, reason: 'quit' }
  }

  function beforeQuit() {
    if (syncOnQuitDone) return { preventDefault: false }

    syncOnQuitDone = true
    let settled = false
    let agendamento = null

    const concluido = new Promise((resolve) => {
      const finish = (motivo) => {
        if (settled) return
        settled = true
        if (agendamento) cancelar(agendamento)

        if (quitForUpdateRequested && !installStarted) {
          installStarted = true
          let instalou = true
          try {
            instalou = instalar()
          } catch {
            instalou = false
          }
          if (instalou === false) {
            installStarted = false
            quitForUpdateRequested = false
            sair()
            resolve({ acao: 'sair', motivo: 'instalacao-indisponivel' })
            return
          }
          resolve({ acao: 'instalar', motivo })
          return
        }

        sair()
        resolve({ acao: 'sair', motivo })
      }

      Promise.resolve()
        .then(() => sincronizar())
        .then(() => finish('sync'))
        .catch(() => finish('sync-erro'))

      agendamento = agendar(() => finish('timeout'), timeoutMs)
    })

    return { preventDefault: true, concluido }
  }

  return {
    pedirInstalacao,
    beforeQuit,
    estado: () => ({ syncOnQuitDone, quitForUpdateRequested, installStarted }),
  }
}

module.exports = {
  STATUS_ATUALIZACAO,
  TIMEOUT_ENCERRAMENTO_MS,
  shouldCheckForUpdates,
  compararVersoes,
  aceitarAtualizacao,
  tagCorrespondeVersao,
  classificarErroAtualizacao,
  sanitizarEstado,
  caminhoPersistenteForaDaInstalacao,
  bancoTemDadosDeLoja,
  contemTokenGitHub,
  validarConfigPublicacao,
  criarFluxoEncerramento,
}
