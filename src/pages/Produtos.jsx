import loupeIcon from '../assets/complements/loupe.png'
import filterIcon from '../assets/complements/filter.png'
import { useState, useEffect } from 'react'

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [artesoes, setArtesoes] = useState([])
  const [loading, setLoading] = useState(true)

  async function carregarProdutos() {
    try {
      const lista = await window.electronAPI.listarProdutos()
      setProdutos(lista)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function carregarArtesoes() {
    try {
      const lista = await window.electronAPI.listarArtesoes()
      setArtesoes(lista)
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    carregarProdutos()
    carregarArtesoes()
  }, [])

  async function handleNovoProduto() {
    if (artesoes.length === 0) {
      alert('Cadastre pelo menos um artesão antes de adicionar produtos.')
      return
    }

    const nome = prompt('Nome do produto:')
    if (!nome) return

    const variacao = prompt('Variação (P, M, G, GG) ou deixe vazio:')
    const precoCusto = parseFloat(prompt('Preço de custo:')) || 0
    const precoVenda = parseFloat(prompt('Preço de venda:')) || 0
    const estoque = parseInt(prompt('Estoque inicial:') || '0', 10)
    const artesaoId = parseInt(prompt(`ID do artesão (1 a ${artesoes.length}):`) || '1', 10)

    try {
      await window.electronAPI.criarProduto({
        nome,
        variacao: variacao || null,
        preco_custo: precoCusto,
        preco_venda: precoVenda,
        estoque,
        artesao_id: artesaoId,
      })
      carregarProdutos()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="produtos">
      <div className="produtos-header">
        <div className="produtos-header-left">
          <h2 className="dashboard-heading">Produtos</h2>
          <p className="dashboard-subtitle">Gerencie seu catálogo de produtos artesanais.</p>
          <div className="produtos-search-row">
            <div className="produtos-search-wrapper">
              <img src={loupeIcon} alt="" className="pdv-input-icon" />
              <input type="text" placeholder="Buscar por nome ou código..." />
            </div>
            <button type="button" className="produtos-filter-btn">
              <img src={filterIcon} alt="" className="produtos-filter-icon" />
            </button>
            <button type="button" className="produtos-btn-secondary">Etiquetas</button>
          </div>
        </div>
        <div className="produtos-actions">
          <button type="button" className="produtos-btn-primary" onClick={handleNovoProduto}>
            <span>+</span> Novo Produto
          </button>
        </div>
      </div>

      <div className="produtos-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Produto</th>
              <th>Artesão</th>
              <th>Categoria</th>
              <th>Estoque</th>
              <th>Preço</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>Carregando...</td>
              </tr>
            ) : produtos.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhum produto cadastrado.</td>
              </tr>
            ) : (
              produtos.map((p) => (
                <tr key={p.id}>
                  <td>{p.codigo_barras}</td>
                  <td>{p.nome}</td>
                  <td>{p.artesao_nome || '-'}</td>
                  <td>{p.variacao || '-'}</td>
                  <td>{p.estoque}</td>
                  <td>R$ {p.preco_venda?.toFixed(2)}</td>
                  <td>{/* Ações */}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
