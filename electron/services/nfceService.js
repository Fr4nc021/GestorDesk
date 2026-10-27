/**
 * Emissão pela Focus NFe: NFC-e das vendas (modelo 65) e NF-e de devolução ao artesão (modelo 55).
 * Cada tentativa fica em notas_fiscais. Se a conexão cair no meio do envio, a próxima tentativa consulta a
 * mesma referência antes de reenviar, para não emitir duas notas para a mesma operação.
 */

const {
  obterConfigFiscal,
  obterVendaParaNfce,
  criarNotaFiscal,
  atualizarNotaFiscal,
  obterNotaFiscal,
  ultimaNotaFiscalDaVenda,
  contarTentativasNotaFiscal,
  ultimaNotaFiscalDaDevolucao,
  contarTentativasNotaFiscalDevolucao,
  obterDevolucaoParaNfe,
  definirStatusDevolucao,
} = require('../database')
const focus = require('./focusNfe')

/** Status em que a nota não saiu e pode ser enviada de novo com outra referência. */
const STATUS_REJEITADA = ['erro_autorizacao', 'denegado', 'erro_validacao']
const STATUS_PENDENTE = ['enviando', 'erro_conexao', 'processando_autorizacao']

/** A NF-e é assíncrona na Focus: depois do envio, consulta algumas vezes até sair da fila. */
const CONSULTAS_NFE = 5
const INTERVALO_CONSULTA_MS = 2000

const API = {
  65: { emitir: focus.emitirNfce, consultar: focus.consultarNfce, cancelar: focus.cancelarNfce },
  55: { emitir: focus.emitirNfe, consultar: focus.consultarNfe, cancelar: focus.cancelarNfe },
}

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function camposDaResposta(dados) {
  return {
    status: dados.status || 'erro_autorizacao',
    numero: dados.numero != null ? String(dados.numero) : null,
    serie: dados.serie != null ? String(dados.serie) : null,
    chave: dados.chave_nfe ? String(dados.chave_nfe).replace(/^NFe/, '') : null,
    protocolo: dados.protocolo || null,
    mensagem: dados.mensagem_sefaz ? `${dados.status_sefaz || ''} ${dados.mensagem_sefaz}`.trim() : dados.mensagem || null,
    caminho_danfe: dados.caminho_danfe || null,
    caminho_xml: dados.caminho_xml_nota_fiscal || null,
    url_qrcode: dados.qrcode_url || null,
    resposta: dados,
  }
}

async function guardarXmlAutorizado(config, nota) {
  if (nota.status !== 'autorizado' || !nota.caminho_xml || nota.xml) return nota
  try {
    const xml = await focus.baixarArquivo(config, nota.caminho_xml)
    return xml ? atualizarNotaFiscal(nota.id, { xml }) : nota
  } catch (err) {
    console.warn('[NFC-e] Não foi possível baixar o XML autorizado:', err?.message || err)
    return nota
  }
}

/** Aplica a resposta da Focus (emissão ou consulta) à tentativa gravada. */
async function aplicarResposta(config, notaId, resposta) {
  const { http, dados } = resposta
  let nota
  if (http >= 200 && http < 300 && dados?.status) {
    nota = await guardarXmlAutorizado(config, atualizarNotaFiscal(notaId, camposDaResposta(dados)))
  } else {
    nota = atualizarNotaFiscal(notaId, {
      status: 'erro_validacao',
      mensagem: focus.mensagemDaResposta(resposta),
      resposta: dados,
    })
  }
  if (nota.devolucao_id) {
    definirStatusDevolucao(nota.devolucao_id, nota.status === 'autorizado' ? 'nf_emitida' : 'aguardando_nf')
  }
  return nota
}

/** Consulta na Focus uma tentativa. Devolve null se a Focus não conhece a referência. */
async function consultar(config, nota) {
  const resposta = await API[nota.modelo].consultar(config, nota.ref)
  if (resposta.http === 404) return null
  return aplicarResposta(config, nota.id, resposta)
}

async function enviar(config, notaId, requisicao) {
  const registro = obterNotaFiscal(notaId)
  try {
    const resposta = await API[registro.modelo].emitir(config, registro.ref, requisicao)
    let nota = await aplicarResposta(config, notaId, resposta)
    for (let i = 0; i < CONSULTAS_NFE && nota.status === 'processando_autorizacao'; i += 1) {
      await esperar(INTERVALO_CONSULTA_MS)
      nota = (await consultar(config, nota)) || nota
    }
    return nota
  } catch (err) {
    if (err.semResposta) return atualizarNotaFiscal(notaId, { status: 'erro_conexao', mensagem: err.message })
    return atualizarNotaFiscal(notaId, { status: 'erro_validacao', mensagem: err?.message || String(err) })
  }
}

/**
 * Passo comum da emissão: reaproveita a tentativa pendente (consultando antes) ou cria uma nova.
 * @param {object} op - { ultima, tentativas, montar, nova(requisicao) }
 */
async function emitirDocumento(config, { ultima, tentativas, montar, nova }) {
  if (ultima?.status === 'autorizado') return ultima

  if (ultima && STATUS_PENDENTE.includes(ultima.status) && ultima.requisicao) {
    try {
      const conferida = await consultar(config, ultima)
      if (conferida && !STATUS_REJEITADA.includes(conferida.status)) return conferida
      if (!conferida) {
        // A Focus não recebeu: reenvia com a mesma referência (com data de emissão nova).
        return await enviar(config, ultima.id, montar())
      }
    } catch (err) {
      if (err.semResposta) return atualizarNotaFiscal(ultima.id, { status: 'erro_conexao', mensagem: err.message })
      throw err
    }
  }

  let requisicao
  try {
    requisicao = montar()
  } catch (err) {
    // Fica registrado para aparecer em Notas emitidas e poder ser reenviado depois de corrigir.
    const registro = nova(null, tentativas + 1)
    return atualizarNotaFiscal(registro.id, { status: 'erro_validacao', mensagem: err?.message || String(err) })
  }
  const registro = nova(requisicao, tentativas + 1)
  return enviar(config, registro.id, requisicao)
}

function sufixoAmbiente(config) {
  return String(config.ambiente) === '1' ? 'p' : 'h'
}

/**
 * Emite (ou tenta de novo) a NFC-e de uma venda.
 * @returns {Promise<object>} a linha de notas_fiscais com o resultado
 */
async function emitirNfceDaVenda(vendaId, { cpf = '' } = {}) {
  const config = obterConfigFiscal()
  const ultima = ultimaNotaFiscalDaVenda(vendaId)
  if (ultima?.status === 'cancelado') throw new Error('O cupom desta venda foi cancelado.')
  // Nas novas tentativas, mantém o CPF/CNPJ informado na primeira.
  if (!cpf && ultima?.requisicao) {
    try {
      const anterior = JSON.parse(ultima.requisicao)
      cpf = anterior.cpf_destinatario || anterior.cnpj_destinatario || ''
    } catch {
      cpf = ''
    }
  }
  const dadosVenda = obterVendaParaNfce(vendaId)
  return emitirDocumento(config, {
    ultima,
    tentativas: contarTentativasNotaFiscal(vendaId),
    montar: () => focus.montarNfce({ ...obterVendaParaNfce(vendaId), config, cpf }),
    nova: (requisicao, tentativa) =>
      criarNotaFiscal({
        venda_id: vendaId,
        modelo: '65',
        ref: `venda-${vendaId}-${tentativa}-${sufixoAmbiente(config)}`,
        ambiente: config.ambiente,
        valor_total: dadosVenda.venda.valor_total,
        requisicao,
      }),
  })
}

/** Emite (ou tenta de novo) a NF-e 5918 de uma devolução de peças ao artesão. */
async function emitirNfeDevolucao(devolucaoId) {
  const config = obterConfigFiscal()
  const dados = obterDevolucaoParaNfe(devolucaoId)
  const ultima = ultimaNotaFiscalDaDevolucao(devolucaoId)
  if (ultima?.status === 'cancelado' && dados.devolucao.status === 'nf_emitida') {
    throw new Error('A NF-e desta devolução foi cancelada.')
  }
  return emitirDocumento(config, {
    ultima: ultima?.status === 'cancelado' ? null : ultima,
    tentativas: contarTentativasNotaFiscalDevolucao(devolucaoId),
    montar: () => focus.montarNfeDevolucao({ ...obterDevolucaoParaNfe(devolucaoId), config }),
    nova: (requisicao, tentativa) =>
      criarNotaFiscal({
        devolucao_id: devolucaoId,
        modelo: '55',
        ref: `devolucao-${devolucaoId}-${tentativa}-${sufixoAmbiente(config)}`,
        ambiente: config.ambiente,
        valor_total: dados.devolucao.valor_total,
        requisicao,
      }),
  })
}

/** Consulta de novo uma nota que ficou em processamento ou sem resposta. */
async function atualizarSituacaoNota(notaId) {
  const nota = obterNotaFiscal(notaId)
  if (!nota) throw new Error('Nota não encontrada.')
  if (!STATUS_PENDENTE.includes(nota.status)) return nota
  const config = { ...obterConfigFiscal(), ambiente: nota.ambiente }
  try {
    return (await consultar(config, nota)) || nota
  } catch (err) {
    if (err.semResposta) return atualizarNotaFiscal(nota.id, { status: 'erro_conexao', mensagem: err.message })
    throw err
  }
}

/** Cancela uma nota autorizada. A SEFAZ exige justificativa de 15 a 255 caracteres. */
async function cancelarNota(notaId, justificativa) {
  const texto = String(justificativa || '').trim()
  if (texto.length < 15) throw new Error('A justificativa precisa ter pelo menos 15 caracteres.')
  const nota = obterNotaFiscal(notaId)
  if (!nota) throw new Error('Nota não encontrada.')
  if (nota.status !== 'autorizado') throw new Error('Só é possível cancelar uma nota autorizada.')
  const config = { ...obterConfigFiscal(), ambiente: nota.ambiente }
  const resposta = await API[nota.modelo].cancelar(config, nota.ref, texto.slice(0, 255))
  const { http, dados } = resposta
  if (http >= 200 && http < 300 && dados?.status === 'cancelado') {
    if (nota.devolucao_id) definirStatusDevolucao(nota.devolucao_id, 'aguardando_nf')
    return atualizarNotaFiscal(notaId, {
      status: 'cancelado',
      cancelada_em: new Date().toISOString(),
      justificativa_cancelamento: texto,
      mensagem: dados.mensagem_sefaz || 'Nota cancelada.',
    })
  }
  throw new Error(focus.mensagemDaResposta(resposta))
}

/** Endereço do DANFE/DANFCe de uma nota autorizada. */
function urlDanfe(notaId) {
  const nota = obterNotaFiscal(notaId)
  if (!nota?.caminho_danfe) throw new Error('Esta nota não tem documento para imprimir.')
  return { url: focus.urlCompleta({ ambiente: nota.ambiente }, nota.caminho_danfe), modelo: nota.modelo }
}

module.exports = { emitirNfceDaVenda, emitirNfeDevolucao, atualizarSituacaoNota, cancelarNota, urlDanfe }
