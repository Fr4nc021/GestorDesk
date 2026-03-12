import loupeIcon from '../assets/complements/loupe.png'
import filterIcon from '../assets/complements/filter.png'
import { useState, useEffect, useRef, useMemo } from 'react'
import Barcode from 'react-barcode'

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [artesoes, setArtesoes] = useState([])
  const [valoresVariacao, setValoresVariacao] = useState(['P', 'M', 'G', 'GG']) // fallback inicial
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')

  const [modalAberto, setModalAberto] = useState(false)
  const [modalVariacoesAberto, setModalVariacoesAberto] = useState(false)
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

  // Variações (gestão de tipos e valores)
  const [tiposVariacao, setTiposVariacao] = useState([])
  const [novoTipoNome, setNovoTipoNome] = useState('')
  const [novoValorNome, setNovoValorNome] = useState('')
  const [tipoSelecionadoParaValor, setTipoSelecionadoParaValor] = useState('')
  const [editandoTipoId, setEditandoTipoId] = useState(null)
  const [editandoTipoNome, setEditandoTipoNome] = useState('')
  const [editandoValorId, setEditandoValorId] = useState(null)
  const [editandoValorNome, setEditandoValorNome] = useState('')

  // Etiquetas
  const [modalEtiquetasAberto, setModalEtiquetasAberto] = useState(false)
  const [modalVisualizarEtiquetasAberto, setModalVisualizarEtiquetasAberto] = useState(false)
  const [produtosParaEtiquetas, setProdutosParaEtiquetas] = useState([]) // { produto, quantidade }
  const [buscaEtiqueta, setBuscaEtiqueta] = useState('')
  const [sugestaoQtdPorChave, setSugestaoQtdPorChave] = useState({})
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

  async function carregarValoresVariacao() {
    try {
      if (window.electronAPI?.listarTodosValoresVariacao) {
        const vals = await window.electronAPI.listarTodosValoresVariacao()
        setValoresVariacao(vals && vals.length > 0 ? vals : ['P', 'M', 'G', 'GG'])
      }
    } catch (_) {
      // fallback mantém P, M, G, GG
    }
  }

  async function carregarTiposVariacao() {
    try {
      if (window.electronAPI?.listarTiposVariacao) {
        const lista = await window.electronAPI.listarTiposVariacao()
        setTiposVariacao(lista || [])
      }
    } catch (_) {
      setTiposVariacao([])
    }
  }

  async function abrirModalVariacoes() {
    setNovoTipoNome('')
    setNovoValorNome('')
    setTipoSelecionadoParaValor('')
    setEditandoTipoId(null)
    setEditandoValorId(null)
    await carregarTiposVariacao()
    setModalVariacoesAberto(true)
  }

  async function handleCriarTipoVariacao(e) {
    e.preventDefault()
    if (!novoTipoNome.trim()) return
    try {
      await window.electronAPI.criarTipoVariacao({ nome: novoTipoNome.trim() })
      setNovoTipoNome('')
      await carregarTiposVariacao()
      await carregarValoresVariacao()
      mostrarToast('Tipo de variação criado com sucesso!', 'success')
    } catch (err) {
      mostrarToast('Erro ao criar: ' + (err?.message || err), 'error')
    }
  }

  async function handleExcluirTipoVariacao(id) {
    if (!confirm('Excluir este tipo de variação? Os valores associados também serão removidos.')) return
    try {
      await window.electronAPI.excluirTipoVariacao(id)
      await carregarTiposVariacao()
      await carregarValoresVariacao()
      mostrarToast('Tipo de variação excluído.', 'success')
    } catch (err) {
      mostrarToast('Erro ao excluir: ' + (err?.message || err), 'error')
    }
  }

  function iniciarEdicaoTipo(tipo) {
    setEditandoTipoId(tipo.id)
    setEditandoTipoNome(tipo.nome)
  }

  async function salvarEdicaoTipo() {
    if (!editandoTipoNome.trim()) return
    try {
      await window.electronAPI.atualizarTipoVariacao(editandoTipoId, { nome: editandoTipoNome.trim() })
      setEditandoTipoId(null)
      await carregarTiposVariacao()
      mostrarToast('Tipo atualizado.', 'success')
    } catch (err) {
      mostrarToast('Erro: ' + (err?.message || err), 'error')
    }
  }

  async function handleCriarValorVariacao(e) {
    e.preventDefault()
    if (!novoValorNome.trim() || !tipoSelecionadoParaValor) return
    try {
      await window.electronAPI.criarValorVariacao({
        tipo_variacao_id: parseInt(tipoSelecionadoParaValor, 10),
        valor: novoValorNome.trim(),
      })
      setNovoValorNome('')
      setTipoSelecionadoParaValor('')
      await carregarTiposVariacao()
      await carregarValoresVariacao()
      mostrarToast('Valor de variação criado!', 'success')
    } catch (err) {
      mostrarToast('Erro ao criar: ' + (err?.message || err), 'error')
    }
  }

  async function handleExcluirValorVariacao(tipoId, valorId) {
    if (!confirm('Excluir este valor?')) return
    try {
      await window.electronAPI.excluirValorVariacao(valorId)
      await carregarTiposVariacao()
      await carregarValoresVariacao()
      mostrarToast('Valor excluído.', 'success')
    } catch (err) {
      mostrarToast('Erro ao excluir: ' + (err?.message || err), 'error')
    }
  }

  function iniciarEdicaoValor(tipoId, valor, valorId) {
    setEditandoValorId(valorId)
    setEditandoValorNome(valor)
    setTipoSelecionadoParaValor(String(tipoId))
  }

  async function salvarEdicaoValor() {
    if (!editandoValorNome.trim()) return
    try {
      await window.electronAPI.atualizarValorVariacao(editandoValorId, { valor: editandoValorNome.trim() })
      setEditandoValorId(null)
      await carregarTiposVariacao()
      await carregarValoresVariacao()
      mostrarToast('Valor atualizado.', 'success')
    } catch (err) {
      mostrarToast('Erro: ' + (err?.message || err), 'error')
    }
  }

  useEffect(() => {
    carregarProdutos()
    carregarArtesoes()
    carregarValoresVariacao()
  }, [])

  function abrirModal() {
    setProdutoEmEdicao(null)
    setNome('')
    setAdicionarVariacao(false)
    const obj = {}
    valoresVariacao.forEach((v) => { obj[v] = 0 })
    setVariacoesComQuantidade(obj)
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
    const variacoes = {}
    valoresVariacao.forEach((v) => { variacoes[v] = 0 })
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
        const variacoesSelecionadas = valoresVariacao.filter((v) => variacoesComQuantidade[v] > 0)
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
    setSugestaoQtdPorChave({})
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

  function adicionarProdutoParaEtiquetas(produto, quantidade = 1) {
    const qtd = Math.max(1, parseInt(quantidade, 10) || 1)
    setProdutosParaEtiquetas((prev) => {
      const idx = prev.findIndex((i) => i.produto.id === produto.id && (!produto.variacao || i.produto.variacao === produto.variacao))
      if (idx >= 0) {
        const nova = [...prev]
        nova[idx] = { ...nova[idx], quantidade: nova[idx].quantidade + qtd }
        return nova
      }
      return [...prev, { produto, quantidade: qtd }]
    })
  }

  function definirQuantidadeEtiqueta(idx, valor) {
    const num = parseInt(valor, 10)
    if (isNaN(num) || num < 0) return
    setProdutosParaEtiquetas((prev) => {
      const nova = [...prev]
      if (num === 0) return nova.filter((_, i) => i !== idx)
      nova[idx] = { ...nova[idx], quantidade: num }
      return nova
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

  const produtosFiltradosEtiquetas = useMemo(() => {
    const termo = buscaEtiqueta.trim().toLowerCase()
    if (!termo) return []
    return produtos.filter((p) => {
      const nome = (p.nome || '').toLowerCase()
      const codigo = String(p.codigo_barras || '')
      return nome.includes(termo) || codigo.includes(buscaEtiqueta.trim())
    })
  }, [buscaEtiqueta, produtos])

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

  /** Abre uma janela com apenas o HTML das etiquetas e imprime essa janela (evita página em branco). */
  function imprimirEtiquetasEmJanelaDedicada(containerEl) {
    const conteudo = containerEl?.innerHTML ?? ''
    if (!conteudo.trim()) return false
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{padding:8px;background:#fff}
      .etiquetas-container{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
      .etiqueta-item{border:1px solid #000;padding:8px;text-align:center;background:#fff;break-inside:avoid;page-break-inside:avoid;width:40mm;min-height:20mm}
      .etiqueta-nome{font-size:12px;font-weight:600;margin-bottom:4px;word-break:break-word}
      .etiqueta-barcode{display:flex;justify-content:center;margin:4px 0}
      .etiqueta-barcode svg{max-width:100%;height:auto}
      .etiqueta-codigo-numero{font-size:11px;font-family:monospace}
      .etiqueta-preco{font-size:12px;font-weight:700;margin-top:4px}
      @media print{body{padding:0}.etiqueta-item{width:40mm;min-height:20mm}}
    </style></head><body><div class="etiquetas-container">${conteudo}</div></body></html>`
    const printWin = window.open('', '_blank')
    if (!printWin) {
      mostrarToast('Permita pop-ups para imprimir etiquetas.', 'error')
      return false
    }
    printWin.document.write(html)
    printWin.document.close()
    printWin.focus()
    // Aguardar layout/SVG antes de imprimir
    const imprimirDepois = () => {
      printWin.print()
      printWin.onafterprint = () => printWin.close()
      // Fallback: fechar após um tempo se onafterprint não disparar
      setTimeout(() => { try { printWin.close() } catch (_) {} }, 3000)
    }
    if (printWin.document.readyState === 'complete') {
      setTimeout(imprimirDepois, 400)
    } else {
      printWin.addEventListener('load', () => setTimeout(imprimirDepois, 400))
    }
    return true
  }

  async function handleConfirmarImpressao() {
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    await new Promise((r) => setTimeout(r, 150))
    const container = etiquetasContainerRef.current
    const temEtiquetas = container?.querySelectorAll('.etiqueta-item').length > 0
    if (!temEtiquetas) {
      mostrarToast('Nenhuma etiqueta no DOM. Tente novamente.', 'error')
      return
    }
    const ok = imprimirEtiquetasEmJanelaDedicada(container)
    if (ok) {
      setModalVisualizarEtiquetasAberto(false)
      mostrarToast('Diálogo de impressão aberto. Selecione a impressora.', 'success')
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
          <button type="button" className="produtos-btn-secondary" onClick={abrirModalVariacoes}>
            Adicionar Variação
          </button>
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
                    {(produtoEmEdicao?.variacao ? [produtoEmEdicao.variacao] : valoresVariacao).map((v) => (
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
              {buscaEtiqueta.trim() && (
                <div className="modal-etiquetas-sugestoes">
                  <div className="modal-etiquetas-sugestoes-table-wrapper">
                    <table className="modal-etiquetas-tabela modal-etiquetas-sugestoes-tabela">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Produto</th>
                          <th>Preço</th>
                          <th>Qtd</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {produtosFiltradosEtiquetas.length === 0 ? (
                          <tr>
                            <td colSpan={5}>Nenhum produto encontrado.</td>
                          </tr>
                        ) : (
                          produtosFiltradosEtiquetas.map((p) => {
                            const chave = `${p.id}-${p.variacao || ''}`
                            const qtdStr = sugestaoQtdPorChave[chave] ?? '1'
                            const qtd = Math.max(1, parseInt(qtdStr, 10) || 1)
                            return (
                              <tr key={chave}>
                                <td>{p.codigo_barras}</td>
                                <td>{p.nome}{p.variacao ? ` (${p.variacao})` : ''}</td>
                                <td>R$ {p.preco_venda?.toFixed(2).replace('.', ',')}</td>
                                <td>
                                  <input
                                    type="number"
                                    min={1}
                                    className="modal-etiquetas-qtd-input modal-etiquetas-sugestao-qtd"
                                    value={qtdStr}
                                    onChange={(e) => setSugestaoQtdPorChave((prev) => ({ ...prev, [chave]: e.target.value }))}
                                  />
                                </td>
                                <td>
                                  <button
                                    type="button"
                                    className="modal-etiquetas-adicionar-sugestao"
                                    onClick={() => {
                                      adicionarProdutoParaEtiquetas(p, qtd)
                                      setBuscaEtiqueta('')
                                      setSugestaoQtdPorChave((prev) => { const next = { ...prev }; delete next[chave]; return next })
                                    }}
                                  >
                                    Adicionar
                                  </button>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
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
                            <input
                              type="number"
                              min={1}
                              className="modal-etiquetas-qtd-input"
                              value={item.quantidade}
                              onChange={(e) => definirQuantidadeEtiqueta(idx, e.target.value)}
                            />
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

      {modalVariacoesAberto && (
        <div className="modal-overlay" onClick={() => setModalVariacoesAberto(false)}>
          <div className="modal-content modal-variacoes" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Gerenciar Variações</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalVariacoesAberto(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <p className="modal-variacoes-desc">
              Adicione tipos de variação (ex: Tamanho, Cor) e seus valores. Estes estarão disponíveis ao cadastrar produtos.
            </p>

            <div className="modal-variacoes-section">
              <h4>Novo tipo de variação</h4>
              <form onSubmit={handleCriarTipoVariacao} className="modal-variacoes-form">
                <input
                  type="text"
                  placeholder="Ex: Cor, Material..."
                  value={novoTipoNome}
                  onChange={(e) => setNovoTipoNome(e.target.value)}
                />
                <button type="submit" className="modal-variacoes-btn-add">Adicionar tipo</button>
              </form>
            </div>

            <div className="modal-variacoes-section">
              <h4>Adicionar valor a um tipo</h4>
              <form onSubmit={handleCriarValorVariacao} className="modal-variacoes-form">
                <select
                  value={tipoSelecionadoParaValor}
                  onChange={(e) => setTipoSelecionadoParaValor(e.target.value)}
                  required
                >
                  <option value="">Selecione o tipo...</option>
                  {tiposVariacao.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Ex: Vermelho, P, M..."
                  value={novoValorNome}
                  onChange={(e) => setNovoValorNome(e.target.value)}
                />
                <button type="submit" className="modal-variacoes-btn-add">Adicionar valor</button>
              </form>
            </div>

            <div className="modal-variacoes-lista">
              <h4>Tipos e valores cadastrados</h4>
              {tiposVariacao.length === 0 ? (
                <p className="modal-variacoes-empty">Nenhum tipo cadastrado. Crie um tipo acima.</p>
              ) : (
                <ul className="modal-variacoes-tipos">
                  {tiposVariacao.map((tipo) => (
                    <li key={tipo.id} className="modal-variacoes-tipo-item">
                      <div className="modal-variacoes-tipo-header">
                        {editandoTipoId === tipo.id ? (
                          <form
                            onSubmit={(e) => { e.preventDefault(); salvarEdicaoTipo(); }}
                            className="modal-variacoes-edit-inline"
                          >
                            <input
                              type="text"
                              value={editandoTipoNome}
                              onChange={(e) => setEditandoTipoNome(e.target.value)}
                              autoFocus
                            />
                            <button type="submit">Salvar</button>
                            <button type="button" onClick={() => setEditandoTipoId(null)}>Cancelar</button>
                          </form>
                        ) : (
                          <>
                            <strong>{tipo.nome}</strong>
                            <div className="modal-variacoes-tipo-acoes">
                              <button
                                type="button"
                                className="artesaos-btn-edit"
                                title="Editar"
                                onClick={() => iniciarEdicaoTipo(tipo)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="artesaos-btn-excluir"
                                title="Excluir"
                                onClick={() => handleExcluirTipoVariacao(tipo.id)}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x2="14" y1="11" y2="17" />
                                </svg>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      <ul className="modal-variacoes-valores">
                        {(tipo.valores || []).map((v) => (
                          <li key={v.id} className="modal-variacoes-valor-item">
                            {editandoValorId === v.id ? (
                              <form
                                onSubmit={(e) => { e.preventDefault(); salvarEdicaoValor(); }}
                                className="modal-variacoes-edit-inline"
                              >
                                <input
                                  type="text"
                                  value={editandoValorNome}
                                  onChange={(e) => setEditandoValorNome(e.target.value)}
                                  autoFocus
                                />
                                <button type="submit">Salvar</button>
                                <button type="button" onClick={() => setEditandoValorId(null)}>Cancelar</button>
                              </form>
                            ) : (
                              <>
                                <span>{v.valor}</span>
                                <div className="modal-variacoes-valor-acoes">
                                  <button
                                    type="button"
                                    className="artesaos-btn-edit"
                                    title="Editar"
                                    onClick={() => iniciarEdicaoValor(tipo.id, v.valor, v.id)}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    className="artesaos-btn-excluir"
                                    title="Excluir"
                                    onClick={() => handleExcluirValorVariacao(tipo.id, v.id)}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      <line x1="10" y1="11" x2="10" y2="17" />
                                      <line x2="14" y1="11" y2="17" />
                                    </svg>
                                  </button>
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                        {(tipo.valores || []).length === 0 && (
                          <li className="modal-variacoes-valor-empty">Nenhum valor</li>
                        )}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="button"
              className="modal-btn-cancelar"
              onClick={() => setModalVariacoesAberto(false)}
            >
              Fechar
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
