export function rotuloArtesao(nome, nomeFantasia, vazio = '') {
  const n = String(nome || '').trim()
  const f = String(nomeFantasia || '').trim()
  if (n && f && f.toLowerCase() !== n.toLowerCase()) return `${n} — ${f}`
  return n || f || vazio
}

/** Nome fantasia na tela de produtos. Se ainda não houver fantasia, usa a razão social (ou o nome já gravado). */
export function rotuloNomeFantasia(nomeFantasia, razaoSocial, nome, vazio = '') {
  const f = String(nomeFantasia || '').trim()
  if (f) return f
  const r = String(razaoSocial || '').trim()
  if (r) return r
  return String(nome || '').trim() || vazio
}

export function textoInclui(termoLower, ...partes) {
  if (!termoLower) return true
  return partes.some((parte) => String(parte || '').toLowerCase().includes(termoLower))
}

/** Produto inativo, ou de fornecedor inativo, não pode ser vendido. */
export function produtoVendavel(produto) {
  return produto?.ativo !== 0 && produto?.artesao_ativo !== 0
}
