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

/** Origens tratadas como nacionais na tabela do IBPT; as demais usam a alíquota de importados. */
const ORIGENS_NACIONAIS = ['0', '3', '4', '5', '8']

/** Tributos aproximados (em centavos) de um item pela tabela do IBPT, ou null se o NCM não está na tabela. */
function tributosAproximados(ibpt, item, valorCents) {
  const linha = ibpt?.[somenteDigitos(item.ncm)]
  if (!linha || valorCents <= 0) return null
  const aliqFederal = ORIGENS_NACIONAIS.includes(String(item.origem ?? '0')) ? linha.nacional_federal : linha.importados_federal
  const federal = Math.round((valorCents * aliqFederal) / 100)
  const estadual = Math.round((valorCents * linha.estadual) / 100)
  const municipal = Math.round((valorCents * linha.municipal) / 100)
  return { federal, estadual, municipal, total: federal + estadual + municipal, fonte: linha.fonte }
}

/**
 * Valida a venda e devolve o JSON da NFC-e para a Focus.
 * @param {object} dados - { venda, itens, pagamentos, config, cpf }
 *   itens: vendas_itens com os campos fiscais do produto (nome, ncm, cest, origem, tipo_posse, icms_st, unidade)
 */
function montarNfce({ venda, itens, pagamentos, config, cpf = '', ibpt = null }) {
  const cnpj = somenteDigitos(config.cnpj)
  if (cnpj.length !== 14) throw new Error('Cadastre o CNPJ da loja em Configurações › Fiscal.')
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('A venda não tem itens.')

  const semNcm = itens.filter((i) => somenteDigitos(i.ncm).length !== 8)
  if (semNcm.length > 0) {
    const nomes = [...new Set(semNcm.map((i) => i.nome))].slice(0, 5).join(', ')
    throw new Error(`Produto sem NCM: ${nomes}. Preencha o NCM na aba Fiscal do produto.`)
  }

  const semCest = itens.filter((i) => regraFiscalVenda(i).csosn === '500' && somenteDigitos(i.cest).length !== 7)
  if (semCest.length > 0) {
    const nomes = [...new Set(semCest.map((i) => i.nome))].slice(0, 5).join(', ')
    throw new Error(`Produto com ICMS-ST sem CEST: ${nomes}. Preencha o CEST na aba Fiscal do produto.`)
  }

  const brutos = itens.map((i) => centavos(i.quantidade * i.preco_unitario))
  const totalBruto = brutos.reduce((acc, v) => acc + v, 0)
  const totalVenda = centavos(venda.valor_total)
  const limite = Number(config.limite_identificacao_nfce) || 10000
  if (totalVenda >= centavos(limite) && ![11, 14].includes(somenteDigitos(cpf).length)) {
    throw new Error(`Venda a partir de R$ ${limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} precisa do CPF/CNPJ do cliente no cupom.`)
  }
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
    const tributos = tributosAproximados(ibpt, item, brutos[indice] - descontos[indice])
    if (tributos) linha.valor_total_tributos = dinheiro(tributos.total)
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
  if (ibpt) {
    const soma = { federal: 0, estadual: 0, municipal: 0, total: 0 }
    let fonte = 'IBPT'
    itens.forEach((item, i) => {
      const t = tributosAproximados(ibpt, item, brutos[i] - descontos[i])
      if (!t) return
      for (const k of Object.keys(soma)) soma[k] += t[k]
      fonte = t.fonte || fonte
    })
    if (soma.total > 0) {
      nota.valor_total_tributos = dinheiro(soma.total)
      const br = (cents) => dinheiro(cents).replace('.', ',')
      const partes = [`Federal R$ ${br(soma.federal)}`, `Estadual R$ ${br(soma.estadual)}`]
      if (soma.municipal > 0) partes.push(`Municipal R$ ${br(soma.municipal)}`)
      nota.informacoes_adicionais_contribuinte = `Trib. aprox.: ${partes.join(', ')}. Fonte: ${fonte}. Lei 12.741/2012.`
    }
  }

  const cpfDigitos = somenteDigitos(cpf)
  if (cpfDigitos.length === 11) nota.cpf_destinatario = cpfDigitos
  else if (cpfDigitos.length === 14) nota.cnpj_destinatario = cpfDigitos
  else if (cpfDigitos) throw new Error('CPF/CNPJ na nota inválido.')
  return nota
}

/**
 * NF-e de devolução ao artesão das peças recebidas em consignação (CFOP 5918), conforme o manual do contador:
 * CSOSN 400, PIS/COFINS 49, referenciando a chave da nota de remessa.
 * @param {object} dados - { devolucao, itens, chaveRemessa, artesao, config }
 */
function montarNfeDevolucao({ devolucao, itens, chaveRemessa, remessa, artesao, config }) {
  const cnpj = somenteDigitos(config.cnpj)
  if (cnpj.length !== 14) throw new Error('Cadastre o CNPJ da loja em Configurações › Fiscal.')
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('A devolução não tem itens.')
  const chave = somenteDigitos(chaveRemessa)
  if (chave.length !== 44) throw new Error('A nota de remessa não tem chave de acesso válida.')
  if (!artesao) throw new Error('A devolução não tem fornecedor.')

  const documento = somenteDigitos(artesao.cpf_cnpj)
  if (documento.length !== 11 && documento.length !== 14) {
    throw new Error('Cadastre o CPF ou CNPJ do fornecedor antes de emitir a nota.')
  }
  const faltando = [
    ['logradouro', 'endereço'],
    ['numero', 'número'],
    ['bairro', 'bairro'],
    ['cidade', 'cidade'],
    ['uf', 'UF'],
    ['cep', 'CEP'],
  ].filter(([campo]) => !String(artesao[campo] || '').trim())
  if (faltando.length > 0) {
    throw new Error(`Complete o cadastro do fornecedor: ${faltando.map(([, nome]) => nome).join(', ')}.`)
  }
  const semNcm = itens.filter((i) => somenteDigitos(i.ncm).length !== 8)
  if (semNcm.length > 0) {
    throw new Error(`Item sem NCM: ${semNcm.map((i) => i.descricao || i.produto_nome).slice(0, 5).join(', ')}.`)
  }

  const inscricao = somenteDigitos(artesao.inscricao_estadual)
  // Simbólica (5919/6919): peças vendidas pela loja; física (5918): peças que voltam ao artesão.
  const simbolica = devolucao.tipo === 'simbolica'
  const cfop = simbolica ? String(devolucao.cfop || '5919') : '5918'
  const nota = {
    cnpj_emitente: cnpj,
    data_emissao: agoraBrasilia(),
    // natOp tem no máximo 60 caracteres.
    natureza_operacao: simbolica
      ? 'DEVOLUCAO SIMBOLICA DE MERCADORIA RECEBIDA EM CONSIGNACAO'
      : 'DEVOLUCAO DE MERCADORIA RECEBIDA EM CONSIGNACAO',
    tipo_documento: '1',
    finalidade_emissao: '4',
    local_destino: String(artesao.uf || '').toUpperCase() === String(config.uf || 'RS').toUpperCase() ? '1' : '2',
    // A SEFAZ exige consumidor final quando o destinatário não é contribuinte (sem IE, rejeição 696).
    consumidor_final: inscricao ? '0' : '1',
    presenca_comprador: '9',
    modalidade_frete: '9',
    notas_referenciadas: [{ chave_nfe: chave }],
    nome_destinatario: String(artesao.razao_social || artesao.nome || '').slice(0, 60),
    logradouro_destinatario: artesao.logradouro,
    numero_destinatario: artesao.numero,
    bairro_destinatario: artesao.bairro,
    municipio_destinatario: artesao.cidade,
    uf_destinatario: String(artesao.uf).toUpperCase(),
    cep_destinatario: somenteDigitos(artesao.cep),
    pais_destinatario: 'Brasil',
    indicador_inscricao_estadual_destinatario: inscricao ? '1' : '9',
    formas_pagamento: [{ forma_pagamento: '90', valor_pagamento: '0.00' }],
    items: itens.map((item, indice) => {
      const unidade = String(item.unidade || 'UN').trim().toUpperCase() || 'UN'
      const linha = {
        numero_item: String(indice + 1),
        codigo_produto: String(item.codigo || item.codigo_barras || item.produto_id),
        descricao: String(item.descricao || item.produto_nome || '').slice(0, 120),
        codigo_ncm: somenteDigitos(item.ncm),
        cfop,
        unidade_comercial: unidade,
        unidade_tributavel: unidade,
        quantidade_comercial: Number(item.quantidade).toFixed(4),
        quantidade_tributavel: Number(item.quantidade).toFixed(4),
        valor_unitario_comercial: Number(item.valor_unitario).toFixed(2),
        valor_unitario_tributavel: Number(item.valor_unitario).toFixed(2),
        valor_bruto: dinheiro(centavos(item.quantidade * item.valor_unitario)),
        icms_origem: String(item.origem ?? '0'),
        icms_situacao_tributaria: '400',
        pis_situacao_tributaria: '49',
        cofins_situacao_tributaria: '49',
      }
      const cest = somenteDigitos(item.cest)
      if (cest.length === 7) linha.cest = cest
      return linha
    }),
  }
  if (documento.length === 14) nota.cnpj_destinatario = documento
  else nota.cpf_destinatario = documento
  if (inscricao) nota.inscricao_estadual_destinatario = inscricao
  if (artesao.complemento) nota.complemento_destinatario = artesao.complemento
  const telefone = somenteDigitos(artesao.telefone_whats)
  if (telefone.length >= 10) nota.telefone_destinatario = telefone
  // Texto pedido pelo manual do contador para a devolução.
  const dataRemessa = String(remessa?.data_emissao || '').slice(0, 10).split('-').reverse().join('/')
  const periodo = [devolucao.periodo_inicio, devolucao.periodo_fim]
    .map((d) => String(d || '').slice(0, 10).split('-').reverse().join('/'))
    .join(' a ')
  const complementar = [
    `${simbolica ? 'Devolução simbólica de mercadoria vendida no período de ' + periodo + ', recebida' : 'Devolução de mercadoria recebida'}` +
      ` em consignação mercantil pela NF-e nº ${remessa?.numero || chave.slice(25, 34)}` +
      `${dataRemessa ? `, de ${dataRemessa}` : ''}, nos termos do Ajuste SINIEF 02/93.`,
    'Documento emitido por ME/EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de ICMS e IPI.',
    devolucao.observacao ? String(devolucao.observacao) : '',
  ]
    .filter(Boolean)
    .join(' ')
  nota.informacoes_adicionais_contribuinte = complementar.slice(0, 2000)
  return nota
}

/**
 * NF-e de entrada da devolução de um cliente (consumidor), referenciando o cupom da venda.
 * CFOP escolhido por item na tela (1202, 1411 ou 1918). CSOSN 900 e PIS/COFINS 99, sem destaque de imposto.
 * @param {object} dados - { devolucao, itens, chaveCupom, config }
 */
function montarNfeDevolucaoCliente({ devolucao, itens, chaveCupom, config }) {
  const cnpj = somenteDigitos(config.cnpj)
  if (cnpj.length !== 14) throw new Error('Cadastre o CNPJ da loja em Configurações › Fiscal.')
  const chave = somenteDigitos(chaveCupom)
  if (chave.length !== 44) throw new Error('O cupom da venda não tem chave de acesso válida.')
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('A devolução não tem itens.')
  const semNcm = itens.filter((i) => somenteDigitos(i.ncm).length !== 8)
  if (semNcm.length > 0) throw new Error(`Produto sem NCM: ${semNcm.map((i) => i.nome).slice(0, 5).join(', ')}.`)

  const documento = somenteDigitos(devolucao.cliente_cpf_cnpj)
  const nota = {
    cnpj_emitente: cnpj,
    data_emissao: agoraBrasilia(),
    natureza_operacao: 'DEVOLUCAO DE VENDA',
    tipo_documento: '0',
    finalidade_emissao: '4',
    local_destino: String(devolucao.cliente_uf || '').toUpperCase() === String(config.uf || 'RS').toUpperCase() ? '1' : '2',
    consumidor_final: '1',
    presenca_comprador: '1',
    modalidade_frete: '9',
    notas_referenciadas: [{ chave_nfe: chave }],
    nome_destinatario: String(devolucao.cliente_nome || '').slice(0, 60),
    logradouro_destinatario: devolucao.cliente_logradouro,
    numero_destinatario: devolucao.cliente_numero,
    bairro_destinatario: devolucao.cliente_bairro,
    municipio_destinatario: devolucao.cliente_cidade,
    uf_destinatario: String(devolucao.cliente_uf).toUpperCase(),
    cep_destinatario: somenteDigitos(devolucao.cliente_cep),
    pais_destinatario: 'Brasil',
    indicador_inscricao_estadual_destinatario: '9',
    formas_pagamento: [{ forma_pagamento: '90', valor_pagamento: '0.00' }],
    items: itens.map((item, indice) => {
      const unidade = String(item.unidade || 'UN').trim().toUpperCase() || 'UN'
      const linha = {
        numero_item: String(indice + 1),
        codigo_produto: String(item.codigo_barras || item.produto_id),
        descricao: [item.nome, item.variacao].filter(Boolean).join(' - ').slice(0, 120),
        codigo_ncm: somenteDigitos(item.ncm),
        cfop: String(item.cfop),
        unidade_comercial: unidade,
        unidade_tributavel: unidade,
        quantidade_comercial: Number(item.quantidade).toFixed(4),
        quantidade_tributavel: Number(item.quantidade).toFixed(4),
        valor_unitario_comercial: Number(item.valor_unitario).toFixed(2),
        valor_unitario_tributavel: Number(item.valor_unitario).toFixed(2),
        valor_bruto: dinheiro(centavos(item.quantidade * item.valor_unitario)),
        icms_origem: String(item.origem ?? '0'),
        icms_situacao_tributaria: '900',
        pis_situacao_tributaria: '99',
        cofins_situacao_tributaria: '99',
      }
      const cest = somenteDigitos(item.cest)
      if (cest.length === 7) linha.cest = cest
      return linha
    }),
  }
  if (documento.length === 14) nota.cnpj_destinatario = documento
  else nota.cpf_destinatario = documento
  nota.informacoes_adicionais_contribuinte = [
    `Devolução de venda ao consumidor referente à NFC-e chave ${chave}.`,
    devolucao.motivo ? `Motivo: ${devolucao.motivo}.` : '',
    'Documento emitido por ME/EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de ICMS e IPI.',
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000)
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

function emitirNfe(config, ref, nota) {
  return requisicao(config, 'POST', `/v2/nfe?ref=${encodeURIComponent(ref)}`, nota)
}

function consultarNfe(config, ref) {
  return requisicao(config, 'GET', `/v2/nfe/${encodeURIComponent(ref)}`)
}

function cancelarNfe(config, ref, justificativa) {
  return requisicao(config, 'DELETE', `/v2/nfe/${encodeURIComponent(ref)}`, { justificativa })
}

/** Inutiliza uma faixa de números na SEFAZ. modelo '65' (NFC-e) ou '55' (NF-e). */
function inutilizar(config, modelo, { serie, numero_inicial, numero_final, justificativa }) {
  return requisicao(config, 'POST', `/v2/${modelo === '55' ? 'nfe' : 'nfce'}/inutilizacao`, {
    cnpj: somenteDigitos(config.cnpj),
    serie: String(serie),
    numero_inicial: String(numero_inicial),
    numero_final: String(numero_final),
    justificativa,
  })
}

/** NF-e emitidas contra o CNPJ da loja (Recebimento de NF-es da Focus). Até 100 por chamada, a partir de `versao`. */
function listarNfesRecebidas(config, cnpj, versao = 0) {
  return requisicao(config, 'GET', `/v2/nfes_recebidas?cnpj=${somenteDigitos(cnpj)}&versao=${Number(versao) || 0}`)
}

/** Ciência da operação: evento não conclusivo, que libera o XML completo da nota na Focus. */
function manifestarCiencia(config, chave) {
  return requisicao(config, 'POST', `/v2/nfes_recebidas/${somenteDigitos(chave)}/manifesto`, { tipo: 'ciencia' })
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
  montarNfeDevolucao,
  montarNfeDevolucaoCliente,
  emitirNfe,
  consultarNfe,
  cancelarNfe,
  listarNfesRecebidas,
  manifestarCiencia,
  inutilizar,
  baixarArquivo,
  urlCompleta,
  mensagemDaResposta,
  regraFiscalVenda,
}
