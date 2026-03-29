import { useEffect, useMemo, useRef, useState } from 'react'

function formatarPrecoVenda(valor) {
  if (valor == null) return '-'
  return `R$ ${Number(valor).toFixed(2).replace('.', ',')}`
}

export default function ProdutoSearchModal({
  open,
  onClose,
  onSelect,
  apenasComEstoque = true,
  titulo = 'Pesquisar Produto',
}) {
  const [produtos, setProdutos] = useState([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setBusca('')
    inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return

    async function carregarProdutos() {
      setLoading(true)
      try {
        if (!window.electronAPI?.listarProdutos) return
        const lista = await window.electronAPI.listarProdutos()
        const filtrados = apenasComEstoque
          ? (lista || []).filter((produto) => (produto.estoque ?? 0) > 0)
          : lista || []
        setProdutos(filtrados)
      } catch (err) {
        console.error('[ProdutoSearchModal] Erro ao carregar produtos:', err)
      } finally {
        setLoading(false)
      }
    }

    carregarProdutos()
  }, [open, apenasComEstoque])

  const produtosFiltrados = useMemo(() => {
    const termoLower = busca.trim().toLowerCase()
    const termoBruto = busca.trim()
    if (!termoLower) return produtos
    return produtos.filter((produto) => {
      const nomeLower = (produto.nome || '').toLowerCase()
      const codigo = String(produto.codigo_barras || '')
      return nomeLower.includes(termoLower) || codigo.includes(termoBruto)
    })
  }, [busca, produtos])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content pdv-modal-pesquisa"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{titulo}</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </div>

        <div className="pdv-modal-pesquisa-body">
          <div className="pdv-modal-pesquisa-search">
            <input
              ref={inputRef}
              type="text"
              placeholder="Digite o nome do produto ou código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          <div className="pdv-modal-pesquisa-table-wrapper">
            <table className="pdv-products-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Produto</th>
                  <th>Estoque</th>
                  <th>Preço</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>Carregando...</td>
                  </tr>
                ) : produtosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      {busca
                        ? 'Nenhum produto encontrado.'
                        : apenasComEstoque
                          ? 'Nenhum produto com estoque disponível.'
                          : 'Nenhum produto cadastrado.'}
                    </td>
                  </tr>
                ) : (
                  produtosFiltrados.map((produto) => (
                    <tr key={produto.id}>
                      <td>{produto.codigo_barras}</td>
                      <td>
                        {produto.nome}
                        {produto.variacao ? ` (${produto.variacao})` : ''}
                      </td>
                      <td>{produto.estoque ?? 0}</td>
                      <td>{formatarPrecoVenda(produto.preco_venda)}</td>
                      <td>
                        <button
                          type="button"
                          className="pdv-modal-pesquisa-select"
                          onClick={() => onSelect?.(produto)}
                        >
                          Selecionar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
