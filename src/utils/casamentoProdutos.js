/**
 * Liga os itens de uma NF-e de entrada aos produtos já cadastrados do fornecedor, para não duplicar
 * produto nem estoque. Ordem de confiança: código de barras (EAN), vínculo feito em nota anterior
 * (mesmo código do item no fornecedor), nome igual e, por último, nome parecido (só sugestão).
 */

export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function palavras(texto) {
  return new Set(normalizarTexto(texto).split(' ').filter((p) => p.length > 1))
}

/** Semelhança entre 0 e 1 pelas palavras em comum. */
export function semelhanca(a, b) {
  const pa = palavras(a)
  const pb = palavras(b)
  if (pa.size === 0 || pb.size === 0) return 0
  let comuns = 0
  for (const p of pa) if (pb.has(p)) comuns += 1
  return comuns / Math.max(pa.size, pb.size)
}

const SEMELHANCA_MINIMA = 0.5

function nomeCompleto(produto) {
  return [produto.nome, produto.variacao].filter(Boolean).join(' ')
}

/**
 * @param {object} item - item da nota (descricao, codigo, ean)
 * @param {Array} produtos - produtos do fornecedor
 * @param {Array} vinculos - [{ codigo, produto_id }] de notas anteriores do mesmo fornecedor
 * @returns {{ produto: object|null, origem: 'ean'|'codigo'|'nome'|'sugestao'|null }}
 */
export function encontrarProduto(item, produtos, vinculos = []) {
  if (item.ean) {
    const porEan = produtos.find((p) => String(p.codigo_barras || '') === item.ean)
    if (porEan) return { produto: porEan, origem: 'ean' }
  }
  if (item.codigo) {
    const vinculo = vinculos.find((v) => v.codigo === item.codigo)
    const porCodigo = vinculo && produtos.find((p) => p.id === vinculo.produto_id)
    if (porCodigo) return { produto: porCodigo, origem: 'codigo' }
  }
  const descricao = normalizarTexto(item.descricao)
  const porNome = produtos.find(
    (p) => normalizarTexto(p.nome) === descricao || normalizarTexto(nomeCompleto(p)) === descricao,
  )
  if (porNome) return { produto: porNome, origem: 'nome' }

  let melhor = null
  let melhorNota = 0
  for (const p of produtos) {
    const nota = Math.max(semelhanca(item.descricao, p.nome), semelhanca(item.descricao, nomeCompleto(p)))
    if (nota > melhorNota) {
      melhor = p
      melhorNota = nota
    }
  }
  if (melhor && melhorNota >= SEMELHANCA_MINIMA) return { produto: melhor, origem: 'sugestao' }
  return { produto: null, origem: null }
}

export const ORIGEM_CASAMENTO = {
  ean: 'Encontrado pelo código de barras',
  codigo: 'Mesmo item de uma nota anterior',
  nome: 'Mesmo nome',
  sugestao: 'Nome parecido: confira se é o mesmo produto',
}
