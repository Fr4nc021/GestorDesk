/**
 * Regras fiscais da loja (Simples Nacional, RS), conforme o manual do contador.
 * Produto consignado sai com CFOP 5115; produto próprio com 5102 (5405 se o ICMS-ST já foi retido).
 */

export const TIPOS_POSSE = [
  { value: 'consignado', label: 'Consignado (peça de artesão)' },
  { value: 'proprio', label: 'Próprio (comprado pela loja)' },
]

export const ORIGENS_MERCADORIA = [
  { value: '0', label: '0 - Nacional' },
  { value: '1', label: '1 - Estrangeira, importação direta' },
  { value: '2', label: '2 - Estrangeira, adquirida no mercado interno' },
  { value: '3', label: '3 - Nacional, conteúdo de importação acima de 40% e até 70%' },
  { value: '4', label: '4 - Nacional, produção conforme processos produtivos básicos' },
  { value: '5', label: '5 - Nacional, conteúdo de importação até 40%' },
  { value: '6', label: '6 - Estrangeira, importação direta, sem similar nacional' },
  { value: '7', label: '7 - Estrangeira, mercado interno, sem similar nacional' },
  { value: '8', label: '8 - Nacional, conteúdo de importação acima de 70%' },
]

export const CRT_OPCOES = [
  { value: '1', label: '1 - Simples Nacional' },
  { value: '4', label: '4 - Simples Nacional - MEI' },
  { value: '2', label: '2 - Simples Nacional, excesso de sublimite' },
  { value: '3', label: '3 - Regime Normal' },
]

export const AMBIENTES = [
  { value: '2', label: 'Homologação (testes, sem valor fiscal)' },
  { value: '1', label: 'Produção (notas com valor fiscal)' },
]

/** CFOP, CSOSN e CST de PIS/COFINS da venda dentro do RS para o produto. */
export function regraFiscalVenda({ tipo_posse, icms_st }) {
  if (tipo_posse === 'proprio') {
    return icms_st
      ? { cfop: '5405', csosn: '500', cstPisCofins: '99' }
      : { cfop: '5102', csosn: '102', cstPisCofins: '99' }
  }
  return { cfop: '5115', csosn: '102', cstPisCofins: '99' }
}

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

/** 1234.56.78 */
export function formatarNcm(valor) {
  const d = somenteDigitos(valor).slice(0, 8)
  if (d.length <= 4) return d
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`
}

/** 12.345.678/0001-90 */
export function formatarCnpj(valor) {
  const d = somenteDigitos(valor).slice(0, 14)
  if (d.length <= 2) return d
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}
