import loupeIcon from '../assets/complements/loupe.png'
import filterIcon from '../assets/complements/filter.png'
import { useState, useEffect, useRef } from 'react'
import Barcode from 'react-barcode'

const VARIACOES = ['P', 'M', 'G', 'GG']

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [artesoes, setArtesoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  const [modalAberto, setModalAberto] = useState(false)
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [produtoEmEdicao, setProdutoEmEdicao] = useState(null)
  const [produtoParaExcluir, setProdutoParaExcluir] = useState(null)
  const [nome, setNome] = useState('')
  const [adicionarVariacao, setAdicionarVariacao] = useState(false)
  const [variacoesComQuantidade, setVariacoesComQuantidade] = useState({ P: 0, M: 0, G: 0, GG: 0 })
  const [precoCusto, setPrecoCusto] = useState('')
  const [precoVenda, setPrecoVenda] = useState('')
  const [estoque, setEstoque] = useState('')
  const [artesaoId, setArtesaoId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' })

  // Etiquetas
  const [modalEtiquetasAberto, setModalEtiquetasAberto] = useState(false)
  const [modalVisualizarEtiquetasAberto, setModalVisualizarEtiquetasAberto] = useState(false)
  const [produtosParaEtiquetas, setProdutosParaEtiquetas] = useState([]) // { produto, quantidade }
  const [buscaEtiqueta, setBuscaEtiqueta] = useState('')
  const etiquetasContainerRef = useRef(null)

  function mostrarToast(message, type = 'success') {
    setToast({ visible: true, message, type })
  }

  useEffect(() => {
    if (!toast.visible) return
    const timer = setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 4000)
    return () => clearTimeout(timer)
  }, [toast.visible])

  function fecharToast() {
    setToast((prev) => ({ ...prev, visible: false }))
  }

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

  function abrirModal() {
    setProdutoEmEdicao(null)
    setNome('')
    setAdicionarVariacao(false)
    setVariacoesComQuantidade({ P: 0, M: 0, G: 0, GG: 0 })
    setPrecoCusto('')
    setPrecoVenda('')
    setEstoque('')
    setArtesaoId('')
    setModalAberto(true)
  }

  function abrirModalEdicao(produto) {
    setProdutoEmEdicao(produto)
    setNome(produto.nome)
    setAdicionarVariacao(!!produto.variacao)
    const variacoes = { P: 0, M: 0, G: 0, GG: 0 }
    if (produto.variacao) variacoes[produto.variacao] = produto.estoque || 0
    setVariacoesComQuantidade(variacoes)
    setPrecoCusto(String(produto.preco_custo ?? ''))
    setPrecoVenda(String(produto.preco_venda ?? ''))
    setEstoque(String(produto.estoque ?? ''))
    setArtesaoId(String(produto.artesao_id ?? ''))
    setModalAberto(true)
  }

  function abrirModalExcluir(produto) {
    setProdutoParaExcluir(produto)
    setModalExcluirAberto(true)
  }

  function handleVariacaoQuantidade(variacao, valor) {
    const qtd = parseInt(String(valor).replace(/\D/g, ''), 10) || 0
    setVariacoesComQuantidade((prev) => ({ ...prev, [variacao]: qtd }))
  }

  async function handleSalvarProduto(e) {
    e.preventDefault()

    if (!nome.trim()) {
      alert('Informe o nome do produto.')
      return
    }

    const artesaoVal = parseInt(artesaoId, 10)
    if (!artesaoVal || artesaoVal < 1) {
      alert('Selecione um artesão.')
      return
    }

    const custo = parseFloat(String(precoCusto).replace(',', '.')) || 0
    const venda = parseFloat(String(precoVenda).replace(',', '.')) || 0

    if (!window.electronAPI) {
      alert('Execute o app pelo Electron (npm start). O banco de dados não está disponível no navegador.')
      return
    }

    setSalvando(true)
    try {
      if (produtoEmEdicao) {
        const qtd = adicionarVariacao
          ? variacoesComQuantidade[produtoEmEdicao.variacao] ?? 0
          : parseInt(String(estoque).replace(/\D/g, ''), 10) || 0
        await window.electronAPI.atualizarProduto(produtoEmEdicao.id, {
          nome: nome.trim(),
          variacao: produtoEmEdicao.variacao,
          preco_custo: custo,
          preco_venda: venda,
          estoque: qtd,
          artesao_id: artesaoVal,
        })
      } else if (adicionarVariacao) {
        const variacoesSelecionadas = VARIACOES.filter((v) => variacoesComQuantidade[v] > 0)
        if (variacoesSelecionadas.length === 0) {
          alert('Selecione pelo menos uma variação e informe a quantidade.')
          setSalvando(false)
          return
        }
        for (const variacao of variacoesSelecionadas) {
          const qtd = variacoesComQuantidade[variacao]
          await window.electronAPI.criarProduto({
            nome: nome.trim(),
            variacao,
            preco_custo: custo,
            preco_venda: venda,
            estoque: qtd,
            artesao_id: artesaoVal,
          })
        }
      } else {
        const qtd = parseInt(String(estoque).replace(/\D/g, ''), 10) || 0
        await window.electronAPI.criarProduto({
          nome: nome.trim(),
          variacao: null,
          preco_custo: custo,
          preco_venda: venda,
          estoque: qtd,
          artesao_id: artesaoVal,
        })
      }
      setModalAberto(false)
      carregarProdutos()
      const msgSucesso = produtoEmEdicao ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!'
      mostrarToast(msgSucesso, 'success')
    } catch (err) {
      console.error(err)
      const msg = err?.message || String(err)
      mostrarToast(`Erro ao salvar produto: ${msg}`, 'error')
    } finally {
      setSalvando(false)
    }
  }

  async function handleExcluirProduto() {
    if (!produtoParaExcluir) return
    if (!window.electronAPI) return
    try {
      await window.electronAPI.excluirProduto(produtoParaExcluir.id)
      setModalExcluirAberto(false)
      setProdutoParaExcluir(null)
      carregarProdutos()
      mostrarToast('Produto excluído com sucesso!', 'success')
    } catch (err) {
      console.error(err)
      mostrarToast(`Erro ao excluir produto: ${err?.message || err}`, 'error')
    }
  }

  function abrirModalEtiquetas() {
    setProdutosParaEtiquetas([])
    setBuscaEtiqueta('')
    setModalEtiquetasAberto(true)
  }

  async function pesquisarProdutoEtiqueta() {
    const termo = buscaEtiqueta.trim()
    if (!termo) return

    // Busca por código de barras
    if (window.electronAPI?.buscarProdutoPorCodigo) {
      const porCodigo = await window.electronAPI.buscarProdutoPorCodigo(termo)
      if (porCodigo) {
        adicionarProdutoParaEtiquetas(porCodigo)
        setBuscaEtiqueta('')
        return
      }
    }

    // Busca por nome (primeira correspondência exata ou parcial)
    const termoLower = termo.toLowerCase()
    const encontrado = produtos.find(
      (p) =>
        (p.nome && p.nome.toLowerCase().includes(termoLower)) ||
        (p.codigo_barras && String(p.codigo_barras).includes(termo))
    )
    if (encontrado) {
      adicionarProdutoParaEtiquetas(encontrado)
      setBuscaEtiqueta('')
    } else {
      mostrarToast('Produto não encontrado.', 'error')
    }
  }

  function adicionarProdutoParaEtiquetas(produto) {
    setProdutosParaEtiquetas((prev) => {
      const idx = prev.findIndex((i) => i.produto.id === produto.id && (!produto.variacao || i.produto.variacao === produto.variacao))
      if (idx >= 0) {
        const nova = [...prev]
        nova[idx] = { ...nova[idx], quantidade: nova[idx].quantidade + 1 }
        return nova
      }
      return [...prev, { produto, quantidade: 1 }]
    })
  }

  function alterarQuantidadeEtiqueta(idx, delta) {
    setProdutosParaEtiquetas((prev) => {
      const nova = [...prev]
      const q = Math.max(0, (nova[idx].quantidade || 1) + delta)
      if (q <= 0) {
        return nova.filter((_, i) => i !== idx)
      }
      nova[idx] = { ...nova[idx], quantidade: q }
      return nova
    })
  }

  function removerProdutoEtiqueta(idx) {
    setProdutosParaEtiquetas((prev) => prev.filter((_, i) => i !== idx))
  }

  function gerarListaEtiquetasParaImpressao() {
    const lista = []
    produtosParaEtiquetas.forEach(({ produto, quantidade }) => {
      for (let i = 0; i < quantidade; i++) {
        lista.push(produto)
      }
    })
    return lista
  }

  function handleImprimirEtiquetas() {
    if (produtosParaEtiquetas.length === 0) {
      mostrarToast('Adicione pelo menos um produto.', 'error')
      return
    }
    setModalEtiquetasAberto(false)
    setModalVisualizarEtiquetasAberto(true)
  }

  async function handleConfirmarImpressao() {
    if (window.electronAPI?.imprimirEtiquetas) {
      try {
        await window.electronAPI.imprimirEtiquetas()
        setModalVisualizarEtiquetasAberto(false)
        mostrarToast('Impressão enviada com sucesso!', 'success')
      } catch (err) {
        console.error(err)
        mostrarToast('Erro ao imprimir: ' + (err?.message || err), 'error')
      }
    } else {
      window.print()
      setModalVisualizarEtiquetasAberto(false)
    }
  }

  const produtosFiltrados = produtos.filter((p) => {
    const termo = busca.toLowerCase().trim()
    if (!termo) return true
    return (
      (p.nome && p.nome.toLowerCase().includes(termo)) ||
      (p.codigo_barras && String(p.codigo_barras).includes(termo))
    )
  })

  return (
    <div className="produtos">
      {toast.visible && (
        <div className={`toast toast-${toast.type}`}>
          <div className="toast-content">
            <span>{toast.message}</span>
            <button type="button" className="toast-close" onClick={fecharToast} aria-label="Fechar">×</button>
          </div>
          <div className="toast-timer" />
        </div>
      )}
      <div className="produtos-header">
        <div className="produtos-header-left">
          <h2 className="dashboard-heading">Produtos</h2>
          <p className="dashboard-subtitle">Gerencie seu catálogo de produtos artesanais.</p>
          <div className="produtos-search-row">
            <div className="produtos-search-wrapper">
              <img src={loupeIcon} alt="" className="pdv-input-icon" />
              <input
                type="text"
                placeholder="Buscar por nome ou código..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <button type="button" className="produtos-filter-btn">
              <img src={filterIcon} alt="" className="produtos-filter-icon" />
            </button>
            <button type="button" className="produtos-btn-secondary" onClick={abrirModalEtiquetas}>
                Etiquetas
            </button>
          </div>
        </div>
        <div className="produtos-actions">
          <button type="button" className="produtos-btn-primary" onClick={abrirModal}>
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
              <th>Estoque</th>
              <th>Preço</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>Carregando...</td>
              </tr>
            ) : produtosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  {busca ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado.'}
                </td>
              </tr>
            ) : (
              produtosFiltrados.map((p) => (
                <tr key={p.id}>
                  <td>{p.codigo_barras}</td>
                  <td>{p.nome}{p.variacao ? ` (${p.variacao})` : ''}</td>
                  <td>{p.artesao_nome || '-'}</td>
                  <td>{p.estoque}</td>
                  <td>R$ {p.preco_venda?.toFixed(2).replace('.', ',')}</td>
                  <td>
                    <div className="artesaos-acoes">
                      <button
                        type="button"
                        className="artesaos-btn-edit"
                        title="Editar"
                        onClick={() => abrirModalEdicao(p)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="artesaos-btn-excluir"
                        title="Excluir"
                        onClick={() => abrirModalExcluir(p)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div className="modal-overlay" onClick={() => !salvando && setModalAberto(false)}>
          <div className="modal-content modal-produto" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{produtoEmEdicao ? 'Editar Produto' : 'Cadastrar Novo Produto'}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !salvando && setModalAberto(false)}
                aria-label="Fechar"
                disabled={salvando}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSalvarProduto}>
              <div className="modal-field">
                <label htmlFor="nome">Nome do Produto</label>
                <input
                  id="nome"
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Vaso de Barro"
                  required
                />
              </div>

              <div className="modal-produto-variacao">
                <label className="modal-checkbox-label">
                  <input
                    type="checkbox"
                    checked={adicionarVariacao}
                    onChange={(e) => setAdicionarVariacao(e.target.checked)}
                    disabled={!!produtoEmEdicao}
                  />
                  Adicionar variação
                </label>
                {adicionarVariacao && (
                  <div className="modal-variacoes-grid">
                    {(produtoEmEdicao?.variacao ? [produtoEmEdicao.variacao] : VARIACOES).map((v) => (
                      <div key={v} className="modal-variacao-item">
                        <label className="modal-variacao-check">
                          <input
                            type="checkbox"
                            checked={variacoesComQuantidade[v] > 0}
                            onChange={(e) => handleVariacaoQuantidade(v, e.target.checked ? 1 : 0)}
                          />
                          {v}
                        </label>
                        <input
                          type="number"
                          min={0}
                          placeholder="Qtd"
                          value={variacoesComQuantidade[v] || ''}
                          onChange={(e) => handleVariacaoQuantidade(v, e.target.value)}
                          className="modal-variacao-qtd"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-produto-row modal-produto-row-3">
                <div className="modal-field">
                  <label htmlFor="precoCusto">Preço Custo</label>
                  <input
                    id="precoCusto"
                    type="text"
                    inputMode="decimal"
                    value={precoCusto}
                    onChange={(e) => setPrecoCusto(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="precoVenda">Preço Venda</label>
                  <input
                    id="precoVenda"
                    type="text"
                    inputMode="decimal"
                    value={precoVenda}
                    onChange={(e) => setPrecoVenda(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                {!adicionarVariacao && (
                  <div className="modal-field">
                    <label htmlFor="estoque">Estoque</label>
                    <input
                      id="estoque"
                      type="number"
                      min={0}
                      value={estoque}
                      onChange={(e) => setEstoque(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>

              <div className="modal-field">
                <label htmlFor="artesao">Artesão</label>
                <select
                  id="artesao"
                  value={artesaoId}
                  onChange={(e) => setArtesaoId(e.target.value)}
                  required
                >
                  <option value="">Selecione um artesão...</option>
                  {artesoes.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </select>
              </div>

              <button type="submit" className="modal-submit" disabled={salvando}>
                {salvando ? 'Salvando...' : produtoEmEdicao ? 'Salvar Alterações' : 'Salvar Produto'}
              </button>
            </form>
          </div>
        </div>
      )}

      {modalEtiquetasAberto && (
        <div className="modal-overlay" onClick={() => setModalEtiquetasAberto(false)}>
          <div className="modal-content modal-etiquetas" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Imprimir Etiquetas</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalEtiquetasAberto(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="modal-etiquetas-busca">
              <div className="modal-etiquetas-input-wrapper">
                <input
                  type="text"
                  placeholder="Digite o nome do produto ou leia o código de barras"
                  value={buscaEtiqueta}
                  onChange={(e) => setBuscaEtiqueta(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), pesquisarProdutoEtiqueta())}
                />
                <button type="button" className="modal-etiquetas-pesquisar" onClick={pesquisarProdutoEtiqueta}>
                  Pesquisar
                </button>
              </div>
            </div>
            <div className="modal-etiquetas-tabela-wrapper">
              <table className="modal-etiquetas-tabela">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Produto</th>
                    <th>Quantidade</th>
                    <th>Preço</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosParaEtiquetas.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Nenhum produto adicionado. Pesquise e adicione produtos acima.</td>
                    </tr>
                  ) : (
                    produtosParaEtiquetas.map((item, idx) => (
                      <tr key={`${item.produto.id}-${item.produto.variacao || ''}-${idx}`}>
                        <td>{item.produto.codigo_barras}</td>
                        <td>{item.produto.nome}{item.produto.variacao ? ` (${item.produto.variacao})` : ''}</td>
                        <td>
                          <div className="modal-etiquetas-qtd">
                            <button type="button" onClick={() => alterarQuantidadeEtiqueta(idx, -1)}>−</button>
                            <span>{item.quantidade}</span>
                            <button type="button" onClick={() => alterarQuantidadeEtiqueta(idx, 1)}>+</button>
                          </div>
                        </td>
                        <td>R$ {item.produto.preco_venda?.toFixed(2).replace('.', ',')}</td>
                        <td>
                          <div className="modal-etiquetas-acoes">
                            <button
                              type="button"
                              className="artesaos-btn-edit"
                              title="Remover"
                              onClick={() => removerProdutoEtiqueta(idx)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="modal-etiquetas-imprimir"
              onClick={handleImprimirEtiquetas}
              disabled={produtosParaEtiquetas.length === 0}
            >
              Imprimir
            </button>
          </div>
        </div>
      )}

      {modalVisualizarEtiquetasAberto && (
        <div className="modal-overlay" onClick={() => setModalVisualizarEtiquetasAberto(false)}>
          <div className="modal-content modal-visualizar-etiquetas" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Visualizar etiquetas</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalVisualizarEtiquetasAberto(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div ref={etiquetasContainerRef} className="etiquetas-container">
              {gerarListaEtiquetasParaImpressao().map((produto, i) => (
                <div key={`${produto.id}-${produto.variacao || ''}-${i}`} className="etiqueta-item">
                  <div className="etiqueta-nome">{produto.nome}{produto.variacao ? ` (${produto.variacao})` : ''}</div>
                  <div className="etiqueta-barcode">
                    <Barcode
                      value={produto.codigo_barras || ''}
                      format="EAN13"
                      width={1.2}
                      height={30}
                      margin={0}
                      displayValue={false}
                    />
                  </div>
                  <div className="etiqueta-codigo-numero">{produto.codigo_barras}</div>
                  <div className="etiqueta-preco">
                    {produto.preco_venda != null 
                      ? `R$ ${Number(produto.preco_venda).toFixed(2).replace('.', ',')}` 
                      : '-'}
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="modal-etiquetas-confirmar" onClick={handleConfirmarImpressao}>
              Confirmar
            </button>
          </div>
        </div>
      )}

      {modalExcluirAberto && produtoParaExcluir && (
        <div className="modal-overlay" onClick={() => setModalExcluirAberto(false)}>
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Excluir produto</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalExcluirAberto(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <p>
              Tem certeza que deseja excluir{' '}
              <strong>
                {produtoParaExcluir.nome}
                {produtoParaExcluir.variacao ? ` (${produtoParaExcluir.variacao})` : ''}
              </strong>
              ?
            </p>
            <div className="modal-confirm-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setModalExcluirAberto(false)}>
                Cancelar
              </button>
              <button type="button" className="modal-btn-excluir" onClick={handleExcluirProduto}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
