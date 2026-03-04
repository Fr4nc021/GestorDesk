import { useEffect, useMemo, useRef, useState } from 'react'

export default function ProdutoSearchModal({ open, onClose, onSelect }) {
  const [produtos, setProdutos] = useState([])
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return

    async function carregarProdutos() {
      setLoading(true)
      try {
        if (!window.electronAPI?.listarProdutos) return
        const lista = await window.electronAPI.listarProdutos()
        const apenasComEstoque = (lista || []).filter((p) => (p.estoque ?? 0) > 0)
        setProdutos(apenasComEstoque)
      } catch (err) {
        console.error('Erro ao carregar produtos para pesquisa:', err)
      } finally {
        setLoading(false)
      }
    }

    carregarProdutos()
  }, [open])

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return produtos
    return produtos.filter((p) => {
      const nome = (p.nome || '').toLowerCase()
      const codigo = String(p.codigo_barras || '')
      return nome.includes(termo) || codigo.includes(busca.trim())
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
          <h3>Pesquisar Produto</h3>
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
                        : 'Nenhum produto com estoque disponível.'}
                    </td>
                  </tr>
                ) : (
                  produtosFiltrados.map((p) => (
                    <tr key={p.id}>
                      <td>{p.codigo_barras}</td>
                      <td>
                        {p.nome}
                        {p.variacao ? ` (${p.variacao})` : ''}
                      </td>
                      <td>{p.estoque ?? 0}</td>
                      <td>
                        {p.preco_venda != null
                          ? `R$ ${Number(p.preco_venda)
                              .toFixed(2)
                              .replace('.', ',')}`
                          : '-'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="pdv-modal-pesquisa-select"
                          onClick={() => onSelect?.(p)}
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

