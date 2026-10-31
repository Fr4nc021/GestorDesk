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
  listarBuracosNumeracao,
  registrarInutilizacao,
  aliquotasIbpt,
  listarNfcePendentesReenvio,
  obterDevolucaoClienteParaNfe,
  ultimaNotaFiscalDaDevolucaoCliente,
  contarTentativasNotaFiscalDevolucaoCliente,
  listarNotasParaXml,
  listarXmlsEntrada,
} = require('../database')
const focus = require('./focusNfe')
const { criarZip } = require('./zip')

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
    const campos = camposDaResposta(dados)
    if (campos.status === 'autorizado' && !obterNotaFiscal(notaId)?.autorizada_em) {
      campos.autorizada_em = new Date().toISOString()
    }
    nota = await guardarXmlAutorizado(config, atualizarNotaFiscal(notaId, campos))
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
    montar: () => {
      const dados = obterVendaParaNfce(vendaId)
      const ibpt = config.usar_ibpt === '1' ? aliquotasIbpt(dados.itens.map((i) => i.ncm)) : null
      return focus.montarNfce({ ...dados, config, cpf, ibpt })
    },
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

/** Emite (ou tenta de novo) a NF-e de entrada da devolução de um cliente. */
async function emitirNfeDevolucaoCliente(devolucaoId) {
  const config = obterConfigFiscal()
  const dados = obterDevolucaoClienteParaNfe(devolucaoId)
  const ultima = ultimaNotaFiscalDaDevolucaoCliente(devolucaoId)
  if (ultima?.status === 'cancelado') throw new Error('A NF-e desta devolução foi cancelada.')
  return emitirDocumento(config, {
    ultima,
    tentativas: contarTentativasNotaFiscalDevolucaoCliente(devolucaoId),
    montar: () => focus.montarNfeDevolucaoCliente({ ...obterDevolucaoClienteParaNfe(devolucaoId), config }),
    nova: (requisicao, tentativa) =>
      criarNotaFiscal({
        devolucao_cliente_id: devolucaoId,
        modelo: '55',
        ref: `devcliente-${devolucaoId}-${tentativa}-${sufixoAmbiente(config)}`,
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

/** Inutiliza na SEFAZ uma faixa de números pulados. Justificativa de 15 a 255 caracteres. */
async function inutilizarNumeracao({ modelo, serie, numero_inicial, numero_final, justificativa }) {
  const texto = String(justificativa || '').trim()
  if (texto.length < 15) throw new Error('A justificativa precisa ter pelo menos 15 caracteres.')
  const inicio = parseInt(numero_inicial, 10)
  const fim = parseInt(numero_final, 10)
  if (!(inicio > 0) || !(fim >= inicio)) throw new Error('Faixa de números inválida.')
  if (!['55', '65'].includes(String(modelo))) throw new Error('Modelo inválido.')
  const config = obterConfigFiscal()
  const resposta = await focus.inutilizar(config, String(modelo), {
    serie,
    numero_inicial: inicio,
    numero_final: fim,
    justificativa: texto.slice(0, 255),
  })
  const { http, dados } = resposta
  if (http >= 200 && http < 300 && dados?.status === 'autorizado') {
    registrarInutilizacao({
      modelo: String(modelo),
      serie,
      numero_inicial: inicio,
      numero_final: fim,
      ambiente: config.ambiente,
      justificativa: texto,
      protocolo: dados.protocolo_sefaz || dados.protocolo || null,
      caminho_xml: dados.caminho_xml || null,
    })
    return { ok: true, protocolo: dados.protocolo_sefaz || dados.protocolo || null }
  }
  throw new Error(focus.mensagemDaResposta(resposta))
}

let reenviando = false

/**
 * Reenvia os cupons que ficaram sem resposta. Para no primeiro erro de conexão (a internet ainda não voltou).
 * @returns {Promise<{ tentados: number, autorizados: number }>}
 */
async function reenviarPendentes() {
  if (reenviando) return { tentados: 0, autorizados: 0 }
  reenviando = true
  const resultado = { tentados: 0, autorizados: 0 }
  try {
    const config = obterConfigFiscal()
    const token = String(config.ambiente) === '1' ? config.focus_token_producao : config.focus_token_homologacao
    if (!token) return resultado
    for (const pendente of listarNfcePendentesReenvio()) {
      resultado.tentados += 1
      const nota =
        pendente.status === 'processando_autorizacao'
          ? await atualizarSituacaoNota(pendente.id)
          : await emitirNfceDaVenda(pendente.venda_id)
      if (nota?.status === 'autorizado') resultado.autorizados += 1
      if (nota?.status === 'erro_conexao') break
    }
  } catch (err) {
    console.warn('[NFC-e] Reenvio automático falhou:', err?.message || err)
  } finally {
    reenviando = false
  }
  return resultado
}

/** Pasta do .zip para cada tipo de nota. */
function pastaDaNota(nota) {
  if (nota.modelo === '65') return 'NFC-e (cupons)'
  if (nota.devolucao_cliente_id) return 'NF-e devolucao de cliente'
  if (nota.devolucao_tipo === 'simbolica') return 'NF-e devolucao simbolica (5919)'
  return 'NF-e devolucao ao artesao (5918)'
}

/**
 * Monta o .zip com os XMLs das notas do período (as que faltam no computador são baixadas da Focus).
 * @returns {Promise<{ buffer: Buffer, total: number, faltando: number }>}
 */
async function gerarZipXmls(dataInicio, dataFim) {
  const config = obterConfigFiscal()
  const notas = listarNotasParaXml({ dataInicio, dataFim, ambiente: config.ambiente })
  const arquivos = []
  let faltando = 0
  for (const nota of notas) {
    let xml = nota.xml
    if (!xml && nota.caminho_xml) {
      try {
        xml = await focus.baixarArquivo({ ...config, ambiente: nota.ambiente }, nota.caminho_xml)
        if (xml) atualizarNotaFiscal(nota.id, { xml })
      } catch {
        xml = null
      }
    }
    if (!xml) {
      faltando += 1
      continue
    }
    const sufixo = nota.status === 'cancelado' ? '-CANCELADA' : ''
    arquivos.push({ nome: `${pastaDaNota(nota)}/${nota.chave || `nota-${nota.id}`}${sufixo}.xml`, conteudo: xml })
  }
  for (const entrada of listarXmlsEntrada(dataInicio, dataFim)) {
    if (entrada.xml) arquivos.push({ nome: `NF-e de entrada (fornecedores)/${entrada.chave}.xml`, conteudo: entrada.xml })
  }
  if (arquivos.length === 0) throw new Error('Nenhum XML de nota no período.')
  return { buffer: criarZip(arquivos), total: arquivos.length, faltando }
}

function buracosNumeracao() {
  return listarBuracosNumeracao(obterConfigFiscal().ambiente)
}

/** Endereço do DANFE/DANFCe de uma nota autorizada. */
async function urlDanfe(notaId) {
  let nota = obterNotaFiscal(notaId)
  if (!nota) throw new Error('Nota não encontrada.')
  // Notas vindas de outro PC podem chegar sem o caminho: busca na Focus e guarda.
  if (!nota.caminho_danfe && ['autorizado', 'cancelado'].includes(nota.status)) {
    const config = { ...obterConfigFiscal(), ambiente: nota.ambiente }
    const { http, dados } = await API[nota.modelo].consultar(config, nota.ref)
    if (http >= 200 && http < 300 && dados?.caminho_danfe) {
      nota = atualizarNotaFiscal(nota.id, { caminho_danfe: dados.caminho_danfe })
    }
  }
  if (!nota?.caminho_danfe) throw new Error('Esta nota não tem documento para imprimir.')
  return { url: focus.urlCompleta({ ambiente: nota.ambiente }, nota.caminho_danfe), modelo: nota.modelo }
}

module.exports = {
  emitirNfceDaVenda,
  emitirNfeDevolucao,
  emitirNfeDevolucaoCliente,
  atualizarSituacaoNota,
  cancelarNota,
  urlDanfe,
  inutilizarNumeracao,
  buracosNumeracao,
  reenviarPendentes,
  gerarZipXmls,
}
