/**
 * Leitura do XML de NF-e (modelo 55) recebida de fornecedor.
 * Usa o DOMParser do navegador; aceita o XML autorizado (nfeProc) ou só a NFe.
 */

/** Natureza da entrada pelo CFOP da nota do fornecedor (conforme o manual do contador). */
export const TIPOS_NOTA_ENTRADA = {
  remessa_consignacao: {
    label: 'Remessa em consignação',
    cfopEntrada: '1917',
    movimentaEstoque: true,
    tipoPosse: 'consignado',
  },
  faturamento_consignacao: {
    label: 'Acerto de consignação',
    cfopEntrada: '1113',
    movimentaEstoque: false,
    tipoPosse: 'consignado',
  },
  compra: {
    label: 'Compra para revenda',
    cfopEntrada: '1102',
    movimentaEstoque: true,
    tipoPosse: 'proprio',
  },
  compra_st: {
    label: 'Compra para revenda com ST',
    cfopEntrada: '1403',
    movimentaEstoque: true,
    tipoPosse: 'proprio',
  },
  outra: {
    label: 'Outra operação',
    cfopEntrada: '',
    movimentaEstoque: false,
    tipoPosse: 'consignado',
  },
}

/** CFOP de saída do fornecedor (sem o dígito de UF) → tipo da entrada na loja. */
export function tipoNotaPorCfop(cfop) {
  const base = String(cfop || '').replace(/\D/g, '').slice(1)
  // O MEI pode mandar a remessa com 5.904 em vez de 5.917 (manual do contador).
  if (base === '917' || base === '904') return 'remessa_consignacao'
  if (base === '113' || base === '114') return 'faturamento_consignacao'
  if (base === '101' || base === '102') return 'compra'
  if (base === '401' || base === '403' || base === '405') return 'compra_st'
  return 'outra'
}

function filhos(el, nome) {
  if (!el) return []
  return Array.from(el.getElementsByTagNameNS('*', nome))
}

function primeiro(el, nome) {
  return filhos(el, nome)[0] || null
}

function texto(el, nome) {
  const alvo = primeiro(el, nome)
  return alvo ? String(alvo.textContent || '').trim() : ''
}

function numero(el, nome) {
  const n = parseFloat(texto(el, nome))
  return Number.isFinite(n) ? n : 0
}

/**
 * @param {string} xmlTexto
 * @returns {object} dados da nota; lança Error com mensagem para o usuário se o arquivo não for uma NF-e.
 */
export function lerNfeXml(xmlTexto) {
  const doc = new DOMParser().parseFromString(String(xmlTexto || ''), 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('O arquivo não é um XML válido.')
  }

  const infNFe = primeiro(doc, 'infNFe')
  if (!infNFe) throw new Error('O arquivo não é uma NF-e (não encontrei a tag infNFe).')

  const ide = primeiro(infNFe, 'ide')
  const modelo = texto(ide, 'mod')
  if (modelo && modelo !== '55') {
    throw new Error(`Este XML é de modelo ${modelo}. Só é possível importar NF-e modelo 55.`)
  }

  const chaveProtocolo = texto(primeiro(doc, 'protNFe'), 'chNFe')
  const chaveId = String(infNFe.getAttribute('Id') || '').replace(/^NFe/, '')
  const chave = (chaveProtocolo || chaveId).replace(/\D/g, '')
  if (chave.length !== 44) throw new Error('Não encontrei a chave de acesso da nota.')

  const emit = primeiro(infNFe, 'emit')
  const enderEmit = primeiro(emit, 'enderEmit')
  const dest = primeiro(infNFe, 'dest')

  const itens = filhos(infNFe, 'det').map((det) => {
    const prod = primeiro(det, 'prod')
    const ean = texto(prod, 'cEAN')
    return {
      numero_item: parseInt(det.getAttribute('nItem') || '0', 10) || 0,
      codigo: texto(prod, 'cProd'),
      descricao: texto(prod, 'xProd'),
      ncm: texto(prod, 'NCM').replace(/\D/g, ''),
      cest: texto(prod, 'CEST').replace(/\D/g, ''),
      cfop: texto(prod, 'CFOP'),
      unidade: texto(prod, 'uCom') || 'UN',
      quantidade: numero(prod, 'qCom'),
      valor_unitario: numero(prod, 'vUnCom'),
      valor_total: numero(prod, 'vProd'),
      ean: /^\d{8,14}$/.test(ean) ? ean : '',
    }
  })
  if (itens.length === 0) throw new Error('A nota não tem itens.')

  const cfopPrincipal = itens[0].cfop
  const tipo = tipoNotaPorCfop(cfopPrincipal)

  return {
    chave,
    modelo: modelo || '55',
    serie: texto(ide, 'serie'),
    numero: texto(ide, 'nNF'),
    data_emissao: texto(ide, 'dhEmi') || texto(ide, 'dEmi'),
    natureza_operacao: texto(ide, 'natOp'),
    cfop: cfopPrincipal,
    tipo,
    valor_total: numero(primeiro(infNFe, 'ICMSTot'), 'vNF'),
    autorizada: Boolean(chaveProtocolo),
    emitente: {
      cpf_cnpj: texto(emit, 'CNPJ') || texto(emit, 'CPF'),
      razao_social: texto(emit, 'xNome'),
      nome_fantasia: texto(emit, 'xFant'),
      inscricao_estadual: texto(emit, 'IE'),
      crt: texto(emit, 'CRT'),
      logradouro: texto(enderEmit, 'xLgr'),
      numero: texto(enderEmit, 'nro'),
      complemento: texto(enderEmit, 'xCpl'),
      bairro: texto(enderEmit, 'xBairro'),
      codigo_municipio: texto(enderEmit, 'cMun'),
      cidade: texto(enderEmit, 'xMun'),
      uf: texto(enderEmit, 'UF'),
      cep: texto(enderEmit, 'CEP'),
      telefone: texto(enderEmit, 'fone'),
    },
    destinatario_cpf_cnpj: texto(dest, 'CNPJ') || texto(dest, 'CPF'),
    itens,
  }
}
