import loupeIcon from '../assets/complements/loupe.png'
import { useState, useEffect } from 'react'

function hojeISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatHora(dataStr) {
  if (!dataStr) return '--:--'
  const d = new Date(dataStr)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatData(dataStr) {
  if (!dataStr) return '--/--/----'
  const d = new Date(dataStr)
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function Estoque() {
  const [produtos, setProdutos] = useState([])
  const [movimentacoes, setMovimentacoes] = useState([])
  const [produtosMaisVendidos, setProdutosMaisVendidos] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingConsulta, setLoadingConsulta] = useState(false)
  const [busca, setBusca] = useState('')
  const [modalEntradaAberto, setModalEntradaAberto] = useState(false)
  const [produtoParaEntrada, setProdutoParaEntrada] = useState(null)
  const [quantidadeEntrada, setQuantidadeEntrada] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Consultas: movimentações ou produtos mais vendidos
  const [consultaAtiva, setConsultaAtiva] = useState('movimentacoes')
  const [dataInicio, setDataInicio] = useState(hojeISO())
  const [dataFim, setDataFim] = useState(hojeISO())

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

  async function buscarMovimentacoes() {
    setLoadingConsulta(true)
    try {
      const lista = await window.electronAPI.listarMovimentacoesPorPeriodo(dataInicio, dataFim)
      setMovimentacoes(lista)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingConsulta(false)
    }
  }

  async function buscarProdutosMaisVendidos() {
    setLoadingConsulta(true)
    try {
      const lista = await window.electronAPI.listarProdutosMaisVendidosPorPeriodo(dataInicio, dataFim)
      setProdutosMaisVendidos(lista)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingConsulta(false)
    }
  }

  function handleBuscarMovimentacoes() {
    setConsultaAtiva('movimentacoes')
    buscarMovimentacoes()
  }

  function handleBuscarMaisVendidos() {
    setConsultaAtiva('mais-vendidos')
    buscarProdutosMaisVendidos()
  }

  useEffect(() => {
    carregarProdutos()
  }, [])

  useEffect(() => {
    buscarMovimentacoes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const termoBusca = busca.trim().toLowerCase()
  const produtosFiltrados = termoBusca
    ? produtos.filter(
        (p) =>
          (p.nome && p.nome.toLowerCase().includes(termoBusca)) ||
          (p.codigo_barras && String(p.codigo_barras).includes(busca.trim()))
      )
    : produtos

  function abrirModalEntrada(produto) {
    setProdutoParaEntrada(produto)
    setQuantidadeEntrada('')
    setModalEntradaAberto(true)
  }

  async function handleConfirmarEntrada(e) {
    e.preventDefault()
    const qtd = parseInt(String(quantidadeEntrada).replace(/\D/g, ''), 10)
    if (!qtd || qtd < 1) {
      alert('Informe uma quantidade válida.')
      return
    }
    if (!produtoParaEntrada || !window.electronAPI?.adicionarEstoque) return

    setSalvando(true)
    try {
      await window.electronAPI.adicionarEstoque(produtoParaEntrada.id, qtd, 'admin')
      setModalEntradaAberto(false)
      setProdutoParaEntrada(null)
      carregarProdutos()
      carregarHistorico()
      if (consultaAtiva === 'movimentacoes') buscarMovimentacoes()
    } catch (err) {
      console.error(err)
      alert(`Erro ao adicionar estoque: ${err?.message || err}`)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="estoque">
      <div className="estoque-header">
        <div className="estoque-header-left">
          <h2 className="dashboard-heading">Estoque</h2>
          <p className="dashboard-subtitle">Controle de entrada e saída de mercadorias.</p>
          <div className="estoque-search-row">
            <div className="estoque-search-wrapper">
              <img src={loupeIcon} alt="" className="pdv-input-icon" />
              <input
                type="text"
                placeholder="Buscar produto para lançar estoque..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="estoque-content">
        <div className="estoque-list-section">
          <div className="estoque-table-wrapper">
            <table className="estoque-produtos-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Atual</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={3} className="estoque-empty">Carregando...</td>
                  </tr>
                ) : produtosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="estoque-empty">
                      {busca ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                    </td>
                  </tr>
                ) : (
                  produtosFiltrados.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="estoque-produto-cell">
                          <span className="estoque-produto-nome">{p.nome}{p.variacao ? ` (${p.variacao})` : ''}</span>
                          <span className="estoque-produto-codigo">{p.codigo_barras}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`estoque-atual ${(p.estoque ?? 0) === 0 ? 'estoque-falta' : ''}`}>
                          {p.estoque ?? 0}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="estoque-btn-entrada"
                          onClick={() => abrirModalEntrada(p)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 19V5M5 12l7-7 7 7" />
                          </svg>
                          Entrada
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="estoque-history-panel">
          <div className="estoque-consulta-header">
            <div className="estoque-consulta-btns">
              <button
                type="button"
                className={`estoque-consulta-btn ${consultaAtiva === 'movimentacoes' ? 'active' : ''}`}
                onClick={handleBuscarMovimentacoes}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 8v8M8 12h8" />
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                </svg>
                Movimentações
              </button>
              <button
                type="button"
                className={`estoque-consulta-btn ${consultaAtiva === 'mais-vendidos' ? 'active' : ''}`}
                onClick={handleBuscarMaisVendidos}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="M7 16l4-8 4 4 4-8" />
                </svg>
                Mais vendidos
              </button>
            </div>
            <div className="estoque-filtro-data">
              <div className="estoque-data-campo">
                <label>De</label>
                <input
                  type="date"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              <div className="estoque-data-campo">
                <label>Até</label>
                <input
                  type="date"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="estoque-consulta-body">
            {loadingConsulta ? (
              <p className="estoque-consulta-loading">Carregando...</p>
            ) : consultaAtiva === 'movimentacoes' ? (
              <div className="estoque-history-list">
                {movimentacoes.length === 0 ? (
                  <p className="estoque-history-empty">Nenhuma movimentação no período</p>
                ) : (
                  movimentacoes.map((m) => (
                    <div key={m.id} className="estoque-history-card">
                      <div className="estoque-history-card-info">
                        <span className="estoque-history-produto">{m.produto_nome}</span>
                        <span className="estoque-history-origem">
                          {m.origem === 'pdv' ? 'PDV' : 'Admin'}
                        </span>
                        <span className="estoque-history-hora">{formatData(m.data)} {formatHora(m.data)}</span>
                      </div>
                      <span className={`estoque-history-qtd ${m.tipo}`}>
                        {m.tipo === 'entrada' ? (
                          <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 19V5M5 12l7-7 7 7" />
                            </svg>
                            +{m.quantidade} un
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12l7 7 7-7" />
                            </svg>
                            -{m.quantidade} un
                          </>
                        )}
                      </span>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="estoque-mais-vendidos-list">
                {produtosMaisVendidos.length === 0 ? (
                  <p className="estoque-history-empty">Nenhuma venda no período</p>
                ) : (
                  produtosMaisVendidos.map((p, idx) => (
                    <div key={p.id} className="estoque-mais-vendidos-card">
                      <span className="estoque-mais-vendidos-pos">{idx + 1}º</span>
                      <div className="estoque-mais-vendidos-info">
                        <span className="estoque-mais-vendidos-nome">{p.nome}{p.variacao ? ` (${p.variacao})` : ''}</span>
                        <span className="estoque-mais-vendidos-codigo">{p.codigo_barras}</span>
                        <span className={`estoque-mais-vendidos-estoque ${(p.estoque ?? 0) === 0 ? 'estoque-falta' : ''}`}>
                          Estoque: {p.estoque ?? 0}
                        </span>
                      </div>
                      <span className="estoque-mais-vendidos-qtd">{p.total_vendido} vendidos</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {modalEntradaAberto && produtoParaEntrada && (
        <div className="modal-overlay" onClick={() => setModalEntradaAberto(false)}>
          <div className="modal-content estoque-modal-entrada" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Entrada de estoque</h3>
              <button type="button" className="modal-close" onClick={() => setModalEntradaAberto(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <form onSubmit={handleConfirmarEntrada}>
              <p className="estoque-modal-produto">{produtoParaEntrada.nome}{produtoParaEntrada.variacao ? ` (${produtoParaEntrada.variacao})` : ''}</p>
              <div className="modal-field">
                <label htmlFor="quantidade">Quantidade</label>
                <input
                  id="quantidade"
                  type="number"
                  min="1"
                  value={quantidadeEntrada}
                  onChange={(e) => setQuantidadeEntrada(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </div>
              <div className="estoque-modal-acoes">
                <button type="button" className="modal-btn-cancelar" onClick={() => setModalEntradaAberto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="modal-submit" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Confirmar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
