/**
 * Emissão de NFC-e pela API da Focus NFe (https://doc.focusnfe.com.br).
 * A Focus assina, numera e envia a nota para a SEFAZ; aqui só montamos o JSON e guardamos a resposta.
 * O envio da NFC-e é síncrono: a resposta já diz se a nota foi autorizada ou rejeitada.
 */

const URL_BASE = {
  1: 'https://api.focusnfe.com.br',
  2: 'https://homologacao.focusnfe.com.br',
}

const TIMEOUT_MS = 60000

/** Código tPag da SEFAZ para cada forma de pagamento do PDV. */
const FORMA_PAGAMENTO_SEFAZ = {
  dinheiro: '01',
  credito: '03',
  debito: '04',
  pix: '17',
}

const FORMAS_CARTAO = ['credito', 'debito']

/** Mesmo critério de src/utils/fiscal.js (regraFiscalVenda), conforme o manual do contador. */
function regraFiscalVenda({ tipo_posse, icms_st }) {
  if (tipo_posse === 'proprio') {
    return icms_st ? { cfop: '5405', csosn: '500', cstPisCofins: '99' } : { cfop: '5102', csosn: '102', cstPisCofins: '99' }
  }
  return { cfop: '5115', csosn: '102', cstPisCofins: '99' }
}

function centavos(valor) {
  return Math.round((Number(valor) || 0) * 100)
}

function dinheiro(cents) {
  return (cents / 100).toFixed(2)
}

function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

/** Data/hora atual em Brasília no formato que a Focus aceita (no máximo 5 minutos de diferença). */
function agoraBrasilia() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(new Date())
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {})
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}-03:00`
}

/** Distribui o desconto da venda entre os itens, proporcional ao valor de cada um; a sobra de centavos vai no último. */
function distribuirDesconto(brutos, descontoCents) {
  const totalBruto = brutos.reduce((acc, v) => acc + v, 0)
  if (descontoCents <= 0 || totalBruto <= 0) return brutos.map(() => 0)
  let restante = descontoCents
  return brutos.map((bruto, i) => {
    if (i === brutos.length - 1) return restante
    const parte = Math.min(Math.floor((descontoCents * bruto) / totalBruto), restante)
    restante -= parte
    return parte
  })
}

/**
 * Valida a venda e devolve o JSON da NFC-e para a Focus.
 * @param {object} dados - { venda, itens, pagamentos, config, cpf }
 *   itens: vendas_itens com os campos fiscais do produto (nome, ncm, cest, origem, tipo_posse, icms_st, unidade)
 */
function montarNfce({ venda, itens, pagamentos, config, cpf = '' }) {
  const cnpj = somenteDigitos(config.cnpj)
  if (cnpj.length !== 14) throw new Error('Cadastre o CNPJ da loja em Configurações › Fiscal.')
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('A venda não tem itens.')

  const semNcm = itens.filter((i) => somenteDigitos(i.ncm).length !== 8)
  if (semNcm.length > 0) {
    const nomes = [...new Set(semNcm.map((i) => i.nome))].slice(0, 5).join(', ')
    throw new Error(`Produto sem NCM: ${nomes}. Preencha o NCM na aba Fiscal do produto.`)
  }

  const brutos = itens.map((i) => centavos(i.quantidade * i.preco_unitario))
  const totalBruto = brutos.reduce((acc, v) => acc + v, 0)
  const totalVenda = centavos(venda.valor_total)
  const descontoCents = Math.max(totalBruto - totalVenda, 0)
  const descontos = distribuirDesconto(brutos, descontoCents)

  const items = itens.map((item, indice) => {
    const regra = regraFiscalVenda(item)
    const unidade = String(item.unidade || 'UN').trim().toUpperCase() || 'UN'
    const descricao = [item.nome, item.variacao].filter(Boolean).join(' - ').slice(0, 120)
    const linha = {
      numero_item: String(indice + 1),
      codigo_produto: String(item.codigo_barras || item.produto_id),
      descricao,
      codigo_ncm: somenteDigitos(item.ncm),
      cfop: regra.cfop,
      unidade_comercial: unidade,
      unidade_tributavel: unidade,
      quantidade_comercial: Number(item.quantidade).toFixed(4),
      quantidade_tributavel: Number(item.quantidade).toFixed(4),
      valor_unitario_comercial: Number(item.preco_unitario).toFixed(2),
      valor_unitario_tributavel: Number(item.preco_unitario).toFixed(2),
      valor_bruto: dinheiro(brutos[indice]),
      icms_origem: String(item.origem ?? '0'),
      icms_situacao_tributaria: regra.csosn,
      pis_situacao_tributaria: regra.cstPisCofins,
      pis_base_calculo: '0.00',
      pis_aliquota_porcentual: '0.00',
      pis_valor: '0.00',
      cofins_situacao_tributaria: regra.cstPisCofins,
      cofins_base_calculo: '0.00',
      cofins_aliquota_porcentual: '0.00',
      cofins_valor: '0.00',
    }
    if (descontos[indice] > 0) linha.valor_desconto = dinheiro(descontos[indice])
    const cest = somenteDigitos(item.cest)
    if (cest.length === 7) linha.cest = cest
    return linha
  })

  // A soma dos pagamentos tem que fechar com o total da nota: o que passou (troco) sai do dinheiro.
  const formas = (pagamentos || []).filter((p) => centavos(p.valor) > 0)
  if (formas.length === 0) formas.push({ forma_pagamento: venda.forma_pagamento, valor: venda.valor_total })
  const valores = formas.map((p) => centavos(p.valor))
  let excedente = valores.reduce((acc, v) => acc + v, 0) - totalVenda
  if (excedente < 0) throw new Error('Os pagamentos da venda não cobrem o total.')
  const ordemAjuste = [
    ...formas.map((p, i) => (p.forma_pagamento === 'dinheiro' ? i : -1)).filter((i) => i >= 0),
    ...formas.map((_, i) => i).reverse(),
  ]
  for (const i of ordemAjuste) {
    if (excedente <= 0) break
    const tirar = Math.min(valores[i], excedente)
    valores[i] -= tirar
    excedente -= tirar
  }

  const formasPagamento = formas
    .map((p, i) => {
      const codigo = FORMA_PAGAMENTO_SEFAZ[p.forma_pagamento] || '99'
      const pagamento = { forma_pagamento: codigo, valor_pagamento: dinheiro(valores[i]) }
      if (FORMAS_CARTAO.includes(p.forma_pagamento)) pagamento.tipo_integracao = '2'
      return pagamento
    })
    .filter((p) => Number(p.valor_pagamento) > 0)

  const nota = {
    cnpj_emitente: cnpj,
    data_emissao: agoraBrasilia(),
    natureza_operacao: 'VENDA AO CONSUMIDOR',
    presenca_comprador: '1',
    modalidade_frete: '9',
    local_destino: '1',
    items,
    formas_pagamento: formasPagamento,
  }
  const cpfDigitos = somenteDigitos(cpf)
  if (cpfDigitos.length === 11) nota.cpf_destinatario = cpfDigitos
  else if (cpfDigitos.length === 14) nota.cnpj_destinatario = cpfDigitos
  else if (cpfDigitos) throw new Error('CPF/CNPJ na nota inválido.')
  return nota
}

function tokenDoAmbiente(config) {
  const ambiente = String(config.ambiente) === '1' ? 1 : 2
  const token = String((ambiente === 1 ? config.focus_token_producao : config.focus_token_homologacao) || '').trim()
  if (!token) {
    throw new Error(
      `Informe o token de ${ambiente === 1 ? 'produção' : 'homologação'} da Focus NFe em Configurações › Fiscal.`,
    )
  }
  return { ambiente, token, base: URL_BASE[ambiente] }
}

async function requisicao(config, metodo, caminho, corpo) {
  const { token, base } = tokenDoAmbiente(config)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const resposta = await fetch(`${base}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controller.signal,
    })
    const texto = await resposta.text()
    let dados = null
    try {
      dados = texto ? JSON.parse(texto) : null
    } catch {
      dados = { mensagem: texto.slice(0, 500) }
    }
    return { http: resposta.status, dados: dados || {} }
  } catch (err) {
    const semResposta = new Error(
      err?.name === 'AbortError'
        ? 'A Focus NFe não respondeu a tempo.'
        : `Sem conexão com a Focus NFe (${err?.message || err}).`,
    )
    semResposta.semResposta = true
    throw semResposta
  } finally {
    clearTimeout(timer)
  }
}

function emitirNfce(config, ref, nota) {
  return requisicao(config, 'POST', `/v2/nfce?ref=${encodeURIComponent(ref)}`, nota)
}

function consultarNfce(config, ref) {
  return requisicao(config, 'GET', `/v2/nfce/${encodeURIComponent(ref)}`)
}

function cancelarNfce(config, ref, justificativa) {
  return requisicao(config, 'DELETE', `/v2/nfce/${encodeURIComponent(ref)}`, { justificativa })
}

/** Link completo de um caminho devolvido pela Focus (DANFCe, XML). */
function urlCompleta(config, caminho) {
  if (!caminho) return null
  if (/^https?:\/\//i.test(caminho)) return caminho
  const ambiente = String(config.ambiente) === '1' ? 1 : 2
  return `${URL_BASE[ambiente]}${caminho}`
}

/** Baixa o XML autorizado para guardar no computador (o contador pede os XML do mês). */
async function baixarArquivo(config, caminho) {
  const url = urlCompleta(config, caminho)
  if (!url) return null
  const { token } = tokenDoAmbiente(config)
  const resposta = await fetch(url, {
    headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}` },
  })
  if (!resposta.ok) return null
  return resposta.text()
}

/** Mensagem legível de uma resposta de erro da Focus. */
function mensagemDaResposta({ http, dados }) {
  if (dados?.mensagem_sefaz) return `SEFAZ: ${dados.mensagem_sefaz}`
  const erros = Array.isArray(dados?.erros) ? dados.erros.map((e) => e.mensagem).filter(Boolean) : []
  if (erros.length > 0) return erros.join(' ')
  if (dados?.mensagem) return dados.mensagem
  if (http === 401) return 'Token da Focus NFe inválido.'
  return `A Focus NFe recusou o pedido (HTTP ${http}).`
}

module.exports = {
  montarNfce,
  emitirNfce,
  consultarNfce,
  cancelarNfce,
  baixarArquivo,
  urlCompleta,
  mensagemDaResposta,
  regraFiscalVenda,
}
