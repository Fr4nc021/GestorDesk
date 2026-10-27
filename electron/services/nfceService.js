/**
 * Fluxo da NFC-e de uma venda: monta a nota, envia pela Focus NFe e guarda o resultado em notas_fiscais.
 * Se a conexão cair no meio do envio, a próxima tentativa consulta a mesma referência antes de reenviar,
 * para não emitir dois cupons para a mesma venda.
 */

const {
  obterConfigFiscal,
  obterVendaParaNfce,
  criarNotaFiscal,
  atualizarNotaFiscal,
  obterNotaFiscal,
  ultimaNotaFiscalDaVenda,
  contarTentativasNotaFiscal,
} = require('../database')
const focus = require('./focusNfe')

/** Status da Focus que significam que a nota não saiu e pode ser enviada de novo com outra referência. */
const STATUS_REJEITADA = ['erro_autorizacao', 'denegado']

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
  if (http >= 200 && http < 300 && dados?.status) {
    const nota = atualizarNotaFiscal(notaId, camposDaResposta(dados))
    return guardarXmlAutorizado(config, nota)
  }
  return atualizarNotaFiscal(notaId, {
    status: 'erro_validacao',
    mensagem: focus.mensagemDaResposta(resposta),
    resposta: dados,
  })
}

/** Consulta na Focus uma tentativa que ficou sem resposta. Devolve null se a Focus não conhece a referência. */
async function conferirTentativaPendente(config, nota) {
  const resposta = await focus.consultarNfce(config, nota.ref)
  if (resposta.http === 404) return null
  return aplicarResposta(config, nota.id, resposta)
}

/**
 * Emite (ou tenta de novo) a NFC-e de uma venda.
 * @returns {Promise<object>} a linha de notas_fiscais com o resultado
 */
async function emitirNfceDaVenda(vendaId, { cpf = '' } = {}) {
  const config = obterConfigFiscal()
  const ultima = ultimaNotaFiscalDaVenda(vendaId)
  // Nas novas tentativas, mantém o CPF/CNPJ informado na primeira.
  if (!cpf && ultima?.requisicao) {
    try {
      const anterior = JSON.parse(ultima.requisicao)
      cpf = anterior.cpf_destinatario || anterior.cnpj_destinatario || ''
    } catch {
      cpf = ''
    }
  }

  if (ultima?.status === 'autorizado') return ultima
  if (ultima?.status === 'cancelado') throw new Error('O cupom desta venda foi cancelado.')

  if (ultima && ['enviando', 'erro_conexao', 'processando_autorizacao'].includes(ultima.status)) {
    try {
      const conferida = await conferirTentativaPendente(config, ultima)
      if (conferida && !STATUS_REJEITADA.includes(conferida.status) && conferida.status !== 'erro_validacao') {
        return conferida
      }
      if (!conferida) {
        // A Focus não recebeu: reenvia com a mesma referência (com data de emissão nova).
        const nota = focus.montarNfce({ ...obterVendaParaNfce(vendaId), config, cpf })
        return await enviar(config, ultima.id, nota)
      }
    } catch (err) {
      if (err.semResposta) return atualizarNotaFiscal(ultima.id, { status: 'erro_conexao', mensagem: err.message })
      throw err
    }
  }

  const dadosVenda = obterVendaParaNfce(vendaId)
  const tentativa = contarTentativasNotaFiscal(vendaId) + 1
  const novaTentativa = (requisicao) =>
    criarNotaFiscal({
      venda_id: vendaId,
      ref: `venda-${vendaId}-${tentativa}-${String(config.ambiente) === '1' ? 'p' : 'h'}`,
      ambiente: config.ambiente,
      valor_total: dadosVenda.venda.valor_total,
      requisicao,
    })

  let nota
  try {
    nota = focus.montarNfce({ ...dadosVenda, config, cpf })
  } catch (err) {
    // Fica registrado para aparecer em Notas emitidas e poder ser reenviado depois de corrigir.
    const registro = novaTentativa(null)
    return atualizarNotaFiscal(registro.id, { status: 'erro_validacao', mensagem: err?.message || String(err) })
  }
  const registro = novaTentativa(nota)
  return enviar(config, registro.id, nota)
}

async function enviar(config, notaId, nota) {
  const registro = obterNotaFiscal(notaId)
  try {
    const resposta = await focus.emitirNfce(config, registro.ref, nota)
    return await aplicarResposta(config, notaId, resposta)
  } catch (err) {
    if (err.semResposta) return atualizarNotaFiscal(notaId, { status: 'erro_conexao', mensagem: err.message })
    return atualizarNotaFiscal(notaId, { status: 'erro_validacao', mensagem: err?.message || String(err) })
  }
}

/** Cancela um cupom autorizado. A SEFAZ exige justificativa de 15 a 255 caracteres. */
async function cancelarNfce(notaId, justificativa) {
  const texto = String(justificativa || '').trim()
  if (texto.length < 15) throw new Error('A justificativa precisa ter pelo menos 15 caracteres.')
  const nota = obterNotaFiscal(notaId)
  if (!nota) throw new Error('Nota não encontrada.')
  if (nota.status !== 'autorizado') throw new Error('Só é possível cancelar um cupom autorizado.')
  const config = { ...obterConfigFiscal(), ambiente: nota.ambiente }
  const resposta = await focus.cancelarNfce(config, nota.ref, texto.slice(0, 255))
  const { http, dados } = resposta
  if (http >= 200 && http < 300 && dados?.status === 'cancelado') {
    return atualizarNotaFiscal(notaId, {
      status: 'cancelado',
      cancelada_em: new Date().toISOString(),
      justificativa_cancelamento: texto,
      mensagem: dados.mensagem_sefaz || 'Cupom cancelado.',
    })
  }
  throw new Error(focus.mensagemDaResposta(resposta))
}

/** Endereço do DANFCe (cupom para imprimir) de uma nota autorizada. */
function urlDanfe(notaId) {
  const nota = obterNotaFiscal(notaId)
  if (!nota?.caminho_danfe) throw new Error('Esta nota não tem cupom para imprimir.')
  return focus.urlCompleta({ ambiente: nota.ambiente }, nota.caminho_danfe)
}

module.exports = { emitirNfceDaVenda, cancelarNfce, urlDanfe }
