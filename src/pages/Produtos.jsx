import loupeIcon from '../assets/complements/loupe.png'
import filterIcon from '../assets/complements/filter.png'
import { useState, useEffect, useMemo, useRef } from 'react'
import { recoverInputFocus } from '../utils/focusRecovery'
import Barcode from 'react-barcode'
import JsBarcode from 'jsbarcode'

export default function Produtos() {
  const [produtos, setProdutos] = useState([])
  const [artesoes, setArtesoes] = useState([])
  const [valoresVariacao, setValoresVariacao] = useState(['P', 'M', 'G', 'GG'])
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

  const [tiposVariacao, setTiposVariacao] = useState([])
  const [novoTipoNome, setNovoTipoNome] = useState('')
  const [novoValorPorTipo, setNovoValorPorTipo] = useState({})
  const [editandoTipoId, setEditandoTipoId] = useState(null)
  const [editandoTipoNome, setEditandoTipoNome] = useState('')
  const [editandoValorId, setEditandoValorId] = useState(null)
  const [editandoValorNome, setEditandoValorNome] = useState('')
  const [tipoVariacaoProdutoId, setTipoVariacaoProdutoId] = useState('')
  const [erroTipoVariacaoProduto, setErroTipoVariacaoProduto] = useState('')
  const [valorVariacaoParaExcluir, setValorVariacaoParaExcluir] = useState(null)

  const [modalEtiquetasAberto, setModalEtiquetasAberto] = useState(false)
  const [modalVisualizarEtiquetasAberto, setModalVisualizarEtiquetasAberto] = useState(false)
  const [produtosParaEtiquetas, setProdutosParaEtiquetas] = useState([])
  const [buscaEtiqueta, setBuscaEtiqueta] = useState('')
  const [filtroArtesaoEtiqueta, setFiltroArtesaoEtiqueta] = useState('')
  const [sugestaoQtdPorChave, setSugestaoQtdPorChave] = useState({})
  const [etiquetasSugestoesSelecionadas, setEtiquetasSugestoesSelecionadas] = useState([])
  const [etiquetasListaSelecionadas, setEtiquetasListaSelecionadas] = useState([])
  const [etiquetasConfigTamanhoAberta, setEtiquetasConfigTamanhoAberta] = useState(false)

  const [configEtiquetas, setConfigEtiquetas] = useState({
    larguraEtiqueta: 28,
    alturaEtiqueta: 18,
    larguraPapel: 60,
    alturaPapel: 40,
    colunas: 2,
    linhas: 2,
  })

  function mostrarToast(message, type = 'success') {
    setToast({ visible: true, message, type })
  }

  useEffect(() => {
    if (!toast.visible) return
    const timer = setTimeout(() => setToast((prev) => ({ ...prev, visible: false })), 4000)
    return () => clearTimeout(timer)
  }, [toast.visible])

  const buscaInputRef = useRef(null)
  const anyModalOpen =
    modalAberto ||
    modalVariacoesAberto ||
    modalExcluirAberto ||
    modalEtiquetasAberto ||
    modalVisualizarEtiquetasAberto ||
    Boolean(valorVariacaoParaExcluir)
  const prevModalOpen = useRef(false)
  useEffect(() => {
    if (prevModalOpen.current && !anyModalOpen) {
      queueMicrotask(() => {
        buscaInputRef.current?.focus()
        if (document.activeElement !== buscaInputRef.current) recoverInputFocus()
      })
    }
    prevModalOpen.current = anyModalOpen
  }, [anyModalOpen])

  function fecharToast() {
    setToast((prev) => ({ ...prev, visible: false }))
  }

  async function carregarProdutos() {
    try {
      const lista = await window.electronAPI.listarProdutos()
      setProdutos(lista)
    } catch (err) {
      console.error('[Produtos] Erro ao carregar lista de produtos:', err)
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
    } catch {
      /* ignore */
    }
  }

  async function carregarTiposVariacao() {
    try {
      if (window.electronAPI?.listarTiposVariacao) {
        const lista = await window.electronAPI.listarTiposVariacao()
        setTiposVariacao(lista || [])
      }
    } catch {
      setTiposVariacao([])
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem('gestordesk_config_etiquetas')
      if (raw) {
        const parsed = JSON.parse(raw)
        setConfigEtiquetas((prev) => ({
          ...prev,
          ...parsed,
        }))
      }
    } catch {
      /* ignore */
    }
  }, [])

  function atualizarConfigEtiquetas(parcial) {
    setConfigEtiquetas((prev) => {
      const next = { ...prev, ...parcial }
      try {
        localStorage.setItem('gestordesk_config_etiquetas', JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  async function abrirModalVariacoes() {
    setNovoTipoNome('')
    setNovoValorPorTipo({})
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

  async function handleCriarValorVariacaoPorTipo(e, tipoId) {
    e.preventDefault()
    const novoValor = novoValorPorTipo[tipoId] || ''
    if (!novoValor.trim()) return
    try {
      await window.electronAPI.criarValorVariacao({
        tipo_variacao_id: parseInt(tipoId, 10),
        valor: novoValor.trim(),
      })
      setNovoValorPorTipo((prev) => ({ ...prev, [tipoId]: '' }))
      await carregarTiposVariacao()
      await carregarValoresVariacao()
      mostrarToast('Valor de variação criado!', 'success')
    } catch (err) {
      mostrarToast('Erro ao criar: ' + (err?.message || err), 'error')
    }
  }

  async function handleExcluirValorVariacao(valorId) {
    const prevTipos = tiposVariacao
    const valorRemovido = prevTipos
      .flatMap((tipo) => tipo.valores || [])
      .find((v) => v.id === valorId)?.valor
    setTiposVariacao((prev) =>
      prev.map((tipo) => ({
        ...tipo,
        valores: (tipo.valores || []).filter((v) => v.id !== valorId),
      })),
    )
    if (valorRemovido) {
      setValoresVariacao((prev) => prev.filter((valor) => valor !== valorRemovido))
    }
    try {
      await window.electronAPI.excluirValorVariacao(valorId)
      await Promise.all([carregarTiposVariacao(), carregarValoresVariacao()])
      mostrarToast('Valor excluído.', 'success')
    } catch (err) {
      setTiposVariacao(prevTipos)
      await carregarValoresVariacao()
      mostrarToast('Erro ao excluir: ' + (err?.message || err), 'error')
    }
  }

  function abrirModalExcluirValorVariacao(tipoId, valor) {
    setValorVariacaoParaExcluir({
      tipoId,
      id: valor.id,
      valor: valor.valor,
      tipoNome: tiposVariacao.find((t) => t.id === tipoId)?.nome || '',
    })
  }

  function fecharModalExcluirValorVariacao() {
    setValorVariacaoParaExcluir(null)
  }

  async function confirmarExclusaoValorVariacao() {
    if (!valorVariacaoParaExcluir?.id) return
    const valorId = valorVariacaoParaExcluir.id
    setValorVariacaoParaExcluir(null)
    await handleExcluirValorVariacao(valorId)
  }

  function iniciarEdicaoValor(valor, valorId) {
    setEditandoValorId(valorId)
    setEditandoValorNome(valor)
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
    carregarTiposVariacao()
  }, [])

  function abrirModal() {
    setProdutoEmEdicao(null)
    setNome('')
    setAdicionarVariacao(false)
    const quantidadesIniciais = {}
    valoresVariacao.forEach((v) => { quantidadesIniciais[v] = 0 })
    setVariacoesComQuantidade(quantidadesIniciais)
    setPrecoCusto('')
    setPrecoVenda('')
    setEstoque('')
    setArtesaoId('')
    setTipoVariacaoProdutoId('')
    setErroTipoVariacaoProduto('')
    setModalAberto(true)
  }

  function abrirModalEdicao(produto) {
    setProdutoEmEdicao(produto)
    setNome(produto.nome)
    setAdicionarVariacao(!!produto.variacao)
    const tipoDoProduto = produto.variacao
      ? tiposVariacao.find((tipo) => (tipo.valores || []).some((valor) => valor.valor === produto.variacao))
      : null
    const variacoes = {}
    if (tipoDoProduto) {
      ;(tipoDoProduto.valores || []).forEach((valor) => { variacoes[valor.valor] = 0 })
    } else {
      valoresVariacao.forEach((v) => { variacoes[v] = 0 })
    }
    if (produto.variacao) variacoes[produto.variacao] = produto.estoque || 0
    setVariacoesComQuantidade(variacoes)
    setPrecoCusto(String(produto.preco_custo ?? ''))
    setPrecoVenda(String(produto.preco_venda ?? ''))
    setEstoque(String(produto.estoque ?? ''))
    setArtesaoId(String(produto.artesao_id ?? ''))
    setTipoVariacaoProdutoId(tipoDoProduto ? String(tipoDoProduto.id) : '')
    setErroTipoVariacaoProduto('')
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

  function handleSelecionarTipoVariacaoProduto(tipoId) {
    setTipoVariacaoProdutoId(tipoId)
    setErroTipoVariacaoProduto('')
    const tipo = tiposVariacao.find((t) => String(t.id) === String(tipoId))
    const valores = (tipo?.valores || []).map((v) => v.valor)
    const quantidadesPorValor = {}
    valores.forEach((v) => { quantidadesPorValor[v] = 0 })
    setVariacoesComQuantidade(quantidadesPorValor)
  }

  function parsePrecoInput(valor) {
    return parseFloat(String(valor).replace(',', '.')) || 0
  }

  function parseEstoqueInput(valor) {
    return parseInt(String(valor).replace(/\D/g, ''), 10) || 0
  }

  async function salvarProdutoEmEdicaoComVariacao(custo, venda, artesaoVal) {
    const tipoSelecionado = tiposVariacao.find((t) => String(t.id) === String(tipoVariacaoProdutoId))
    if (!tipoSelecionado) {
      setErroTipoVariacaoProduto('Selecione um tipo de variação.')
      setSalvando(false)
      return false
    }
    const valoresDoTipo = (tipoSelecionado.valores || []).map((v) => v.valor)
    const variacoesSelecionadas = valoresDoTipo.filter((v) => variacoesComQuantidade[v] > 0)
    if (variacoesSelecionadas.length === 0) {
      alert('Selecione pelo menos uma variação e informe a quantidade.')
      setSalvando(false)
      return false
    }
    const variacaoPrincipal =
      produtoEmEdicao.variacao && variacoesSelecionadas.includes(produtoEmEdicao.variacao)
        ? produtoEmEdicao.variacao
        : variacoesSelecionadas[0]
    const qtdPrincipal = variacoesComQuantidade[variacaoPrincipal] ?? 0
    await window.electronAPI.atualizarProduto(produtoEmEdicao.id, {
      nome: nome.trim(),
      variacao: variacaoPrincipal,
      preco_custo: custo,
      preco_venda: venda,
      estoque: qtdPrincipal,
      artesao_id: artesaoVal,
    })
    for (const variacao of variacoesSelecionadas) {
      if (variacao === variacaoPrincipal) continue
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
    return true
  }

  async function salvarProdutoEmEdicaoSemVariacao(custo, venda, artesaoVal) {
    const qtd = parseEstoqueInput(estoque)
    await window.electronAPI.atualizarProduto(produtoEmEdicao.id, {
      nome: nome.trim(),
      variacao: null,
      preco_custo: custo,
      preco_venda: venda,
      estoque: qtd,
      artesao_id: artesaoVal,
    })
  }

  async function salvarNovoProdutoComVariacoes(custo, venda, artesaoVal) {
    const tipoSelecionado = tiposVariacao.find((t) => String(t.id) === String(tipoVariacaoProdutoId))
    if (!tipoSelecionado) {
      setErroTipoVariacaoProduto('Selecione um tipo de variação.')
      setSalvando(false)
      return false
    }
    const valoresDoTipo = (tipoSelecionado.valores || []).map((v) => v.valor)
    const variacoesSelecionadas = valoresDoTipo.filter((v) => variacoesComQuantidade[v] > 0)
    if (variacoesSelecionadas.length === 0) {
      alert('Selecione pelo menos uma variação e informe a quantidade.')
      setSalvando(false)
      return false
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
    return true
  }

  async function salvarNovoProdutoSemVariacao(custo, venda, artesaoVal) {
    const qtd = parseEstoqueInput(estoque)
    await window.electronAPI.criarProduto({
      nome: nome.trim(),
      variacao: null,
      preco_custo: custo,
      preco_venda: venda,
      estoque: qtd,
      artesao_id: artesaoVal,
    })
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

    const custo = parsePrecoInput(precoCusto)
    const venda = parsePrecoInput(precoVenda)

    if (!window.electronAPI) {
      alert('Execute o app pelo Electron (npm start). O banco de dados não está disponível no navegador.')
      return
    }

    setSalvando(true)
    try {
      if (produtoEmEdicao) {
        if (adicionarVariacao) {
          const ok = await salvarProdutoEmEdicaoComVariacao(custo, venda, artesaoVal)
          if (!ok) return
        } else {
          await salvarProdutoEmEdicaoSemVariacao(custo, venda, artesaoVal)
        }
      } else if (adicionarVariacao) {
        const ok = await salvarNovoProdutoComVariacoes(custo, venda, artesaoVal)
        if (!ok) return
      } else {
        await salvarNovoProdutoSemVariacao(custo, venda, artesaoVal)
      }
      setModalAberto(false)
      carregarProdutos()
      const msgSucesso = produtoEmEdicao ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!'
      mostrarToast(msgSucesso, 'success')
    } catch (err) {
      console.error('[Produtos] Erro ao salvar produto:', err)
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

  function chaveProdutoEtiqueta(p) {
    return `${p.id}-${p.variacao || ''}`
  }

  /** Quantidade sugerida para etiquetas = estoque atual (0 se sem estoque). */
  function quantidadeEtiquetaPadraoPorEstoque(produto) {
    const e = produto?.estoque
    if (e === null || e === undefined || e === '') return 1
    const n = Math.floor(Number(e))
    if (Number.isNaN(n)) return 1
    return Math.max(0, n)
  }

  function produtoPassaFiltroArtesaoEtiqueta(p) {
    const f = filtroArtesaoEtiqueta.trim()
    if (!f) return true
    return String(p.artesao_id) === f
  }

  function abrirModalEtiquetas() {
    setProdutosParaEtiquetas([])
    setBuscaEtiqueta('')
    setFiltroArtesaoEtiqueta('')
    setSugestaoQtdPorChave({})
    setEtiquetasSugestoesSelecionadas([])
    setEtiquetasListaSelecionadas([])
    setEtiquetasConfigTamanhoAberta(false)
    setModalEtiquetasAberto(true)
  }

  async function pesquisarProdutoEtiqueta() {
    const termo = buscaEtiqueta.trim()
    if (!termo) return

    if (window.electronAPI?.buscarProdutoPorCodigo) {
      const porCodigo = await window.electronAPI.buscarProdutoPorCodigo(termo)
      if (porCodigo) {
        if (!produtoPassaFiltroArtesaoEtiqueta(porCodigo)) {
          mostrarToast('Este produto não corresponde ao filtro de artesão.', 'error')
          return
        }
        adicionarProdutoParaEtiquetas(porCodigo)
        setBuscaEtiqueta('')
        return
      }
    }

    const termoLower = termo.toLowerCase()
    const encontrado = produtos.find(
      (p) =>
        produtoPassaFiltroArtesaoEtiqueta(p) &&
        ((p.nome && p.nome.toLowerCase().includes(termoLower)) ||
          (p.codigo_barras && String(p.codigo_barras).includes(termo)))
    )
    if (encontrado) {
      adicionarProdutoParaEtiquetas(encontrado)
      setBuscaEtiqueta('')
    } else {
      mostrarToast('Produto não encontrado.', 'error')
    }
  }

  function adicionarProdutoParaEtiquetas(produto, quantidade) {
    const qtd =
      quantidade === undefined
        ? quantidadeEtiquetaPadraoPorEstoque(produto)
        : Math.max(0, parseInt(String(quantidade), 10) || 0)
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
      const base = Math.max(0, Math.floor(Number(nova[idx].quantidade)) || 0)
      const q = Math.max(0, base + delta)
      if (q <= 0) {
        return nova.filter((_, i) => i !== idx)
      }
      nova[idx] = { ...nova[idx], quantidade: q }
      return nova
    })
  }

  function removerProdutoEtiqueta(idx) {
    setProdutosParaEtiquetas((prev) => {
      const removido = prev[idx]
      const next = prev.filter((_, i) => i !== idx)
      if (removido) {
        const k = chaveProdutoEtiqueta(removido.produto)
        setEtiquetasListaSelecionadas((sel) => sel.filter((x) => x !== k))
      }
      return next
    })
  }

  function adicionarSelecionadosSugestoesEtiquetas() {
    const chaves = new Set(etiquetasSugestoesSelecionadas)
    const itens = produtosFiltradosEtiquetas
      .filter((p) => chaves.has(chaveProdutoEtiqueta(p)))
      .map((p) => {
        const chave = chaveProdutoEtiqueta(p)
        const padrao = quantidadeEtiquetaPadraoPorEstoque(p)
        const qtdStr = sugestaoQtdPorChave[chave] ?? String(padrao)
        const parsed = parseInt(qtdStr, 10)
        const qtd = Number.isNaN(parsed) ? padrao : Math.max(0, parsed)
        return { produto: p, quantidade: qtd }
      })
    if (itens.length === 0) return
    setProdutosParaEtiquetas((prev) => {
      const next = [...prev]
      for (const { produto, quantidade } of itens) {
        const qtd = Math.max(0, parseInt(String(quantidade), 10) || 0)
        const idx = next.findIndex(
          (i) =>
            i.produto.id === produto.id &&
            (!produto.variacao || i.produto.variacao === produto.variacao)
        )
        if (idx >= 0) {
          next[idx] = { ...next[idx], quantidade: next[idx].quantidade + qtd }
        } else {
          next.push({ produto, quantidade: qtd })
        }
      }
      return next
    })
    setBuscaEtiqueta('')
    setEtiquetasSugestoesSelecionadas([])
    setSugestaoQtdPorChave((prev) => {
      const n = { ...prev }
      itens.forEach(({ produto }) => {
        delete n[chaveProdutoEtiqueta(produto)]
      })
      return n
    })
  }

  function removerEtiquetasListaSelecionadas() {
    const sel = new Set(etiquetasListaSelecionadas)
    setProdutosParaEtiquetas((prev) => prev.filter((item) => !sel.has(chaveProdutoEtiqueta(item.produto))))
    setEtiquetasListaSelecionadas([])
  }

  const produtosFiltradosEtiquetas = useMemo(() => {
    const termo = buscaEtiqueta.trim().toLowerCase()
    const filtroArt = filtroArtesaoEtiqueta.trim()
    return produtos.filter((p) => {
      if (filtroArt && String(p.artesao_id) !== filtroArt) return false
      if (!termo) return true
      const nome = (p.nome || '').toLowerCase()
      const codigo = String(p.codigo_barras || '')
      return nome.includes(termo) || codigo.includes(buscaEtiqueta.trim())
    })
  }, [buscaEtiqueta, filtroArtesaoEtiqueta, produtos])

  const mostrarSugestoesEtiquetas =
    buscaEtiqueta.trim().length > 0 || filtroArtesaoEtiqueta.trim().length > 0

  const todasChavesSugestoesEtiquetas = useMemo(
    () => produtosFiltradosEtiquetas.map((p) => chaveProdutoEtiqueta(p)),
    [produtosFiltradosEtiquetas]
  )

  const todasSugestoesSelecionadas =
    todasChavesSugestoesEtiquetas.length > 0 &&
    todasChavesSugestoesEtiquetas.every((k) => etiquetasSugestoesSelecionadas.includes(k))

  const todasListaEtiquetasSelecionadas =
    produtosParaEtiquetas.length > 0 &&
    produtosParaEtiquetas.every((item) =>
      etiquetasListaSelecionadas.includes(chaveProdutoEtiqueta(item.produto))
    )

  function gerarListaEtiquetasParaImpressao() {
    const lista = []
    produtosParaEtiquetas.forEach(({ produto, quantidade }) => {
      const q = Math.max(0, Math.floor(Number(quantidade)) || 0)
      for (let i = 0; i < q; i++) {
        lista.push(produto)
      }
    })
    return lista
  }

  function escapeHtmlEtiqueta(str) {
    if (str == null) return ''
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function calcularLayoutEtiquetaProporcional(labelWidthMm, labelHeightMm) {
    const mmToPx = 96 / 25.4
    const base = Math.min(labelWidthMm, labelHeightMm)
    const clamp = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor))

    let paddingMm = clamp(labelWidthMm * 0.01, labelWidthMm * 0.015, labelWidthMm * 0.08)
    let gapVerticalMm = clamp(labelHeightMm * 0.03, labelHeightMm * 0.01, labelHeightMm * 0.06)
    let nomeFonteMm = clamp(labelHeightMm * 0.11, base * 0.06, labelHeightMm * 0.18)
    let codigoFonteMm = clamp(labelHeightMm * 0.085, base * 0.05, labelHeightMm * 0.13)
    let precoFonteMm = clamp(labelHeightMm * 0.11, base * 0.06, labelHeightMm * 0.18)
    let barcodeHeightMm = clamp(labelHeightMm * 0.55, labelHeightMm * 0.4, labelHeightMm * 0.75)
    const barcodeModuleMm = clamp(labelWidthMm * 0.015, labelWidthMm * 0.005, labelWidthMm * 0.03)

    const alturaSeguraMm = labelHeightMm * 0.98
    const alturaBlocoTextoMm = nomeFonteMm * 2.3 + codigoFonteMm * 1.3 + precoFonteMm * 1.3
    const alturaTotalMm = paddingMm * 2 + gapVerticalMm * 3 + barcodeHeightMm + alturaBlocoTextoMm
    if (alturaTotalMm > alturaSeguraMm) {
      const escala = alturaSeguraMm / alturaTotalMm
      paddingMm *= escala
      gapVerticalMm *= escala
      nomeFonteMm *= escala
      codigoFonteMm *= escala
      precoFonteMm *= escala
      barcodeHeightMm *= escala
    }

    return {
      paddingMm,
      gapVerticalMm,
      nomeFonteMm,
      codigoFonteMm,
      precoFonteMm,
      barcodeHeightMm,
      barcodeModuleMm,
      barcodeHeightPx: Math.max(1, barcodeHeightMm * mmToPx),
      barcodeModulePx: Math.max(0.2, barcodeModuleMm * mmToPx),
    }
  }

  function htmlEtiquetaProdutoParaImpressao(produto, idx, layout) {
    const nome =
      escapeHtmlEtiqueta(produto.nome) +
      (produto.variacao ? ` (${escapeHtmlEtiqueta(produto.variacao)})` : '')
    const code = String(produto.codigo_barras || '').trim()
    let barcodeInner = ''
    if (code) {
      try {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        const digits = code.replace(/\D/g, '')
        const formato =
          digits.length === 12 || digits.length === 13 ? 'EAN13' : 'CODE128'
        JsBarcode(svg, code, {
          format: formato,
          width: layout.barcodeModulePx,
          height: layout.barcodeHeightPx,
          margin: 0,
          displayValue: false,
        })
        svg.style.width = '100%'
        svg.style.height = `${layout.barcodeHeightMm}mm`
        svg.style.maxWidth = '100%'
        svg.style.display = 'block'
        barcodeInner = svg.outerHTML
      } catch {
        barcodeInner = `<span class="etiqueta-codigo-fallback">${escapeHtmlEtiqueta(code)}</span>`
      }
    }
    const preco =
      produto.preco_venda != null
        ? `R$ ${Number(produto.preco_venda).toFixed(2).replace('.', ',')}`
        : '-'
    return `<div class="etiqueta-item" data-idx="${idx}">
  <div class="etiqueta-nome">${nome}</div>
  <div class="etiqueta-barcode">${barcodeInner}</div>
  <div class="etiqueta-codigo-numero">${escapeHtmlEtiqueta(code)}</div>
  <div class="etiqueta-preco">${preco}</div>
</div>`
  }

  function handleImprimirEtiquetas() {
    if (produtosParaEtiquetas.length === 0) {
      mostrarToast('Adicione pelo menos um produto.', 'error')
      return
    }
    setModalEtiquetasAberto(false)
    setModalVisualizarEtiquetasAberto(true)
  }

  function montarCssImpressaoEtiquetas({
    paperWidthMm,
    paperHeightMm,
    labelWidthMm,
    labelHeightMm,
    columns,
    rows,
    layout,
  }) {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      :root {
        --paper-width-mm: ${paperWidthMm}mm;
        --paper-height-mm: ${paperHeightMm}mm;
        --label-width-mm: ${labelWidthMm}mm;
        --label-height-mm: ${labelHeightMm}mm;
        --cols: ${columns};
        --rows: ${rows};
        --etq-padding-mm: ${layout.paddingMm}mm;
        --etq-gap-v-mm: ${layout.gapVerticalMm}mm;
        --etq-nome-size-mm: ${layout.nomeFonteMm}mm;
        --etq-codigo-size-mm: ${layout.codigoFonteMm}mm;
        --etq-preco-size-mm: ${layout.precoFonteMm}mm;
        --etq-barcode-height-mm: ${layout.barcodeHeightMm}mm;
        --etq-nome-max-height-mm: ${layout.nomeFonteMm * 2.35}mm;
      }
      @page {
        margin: 0;
        size: var(--paper-width-mm) var(--paper-height-mm);
      }
      body {
        margin: 0;
        background: #fff;
        width: var(--paper-width-mm);
        min-height: var(--paper-height-mm);
      }
      .print-page {
        width: var(--paper-width-mm);
        min-height: var(--paper-height-mm);
        page-break-after: always;
        overflow: visible;
      }
      .print-page:last-child {
        page-break-after: auto;
      }
      .etiquetas-container {
        display: grid;
        grid-template-columns: repeat(var(--cols), var(--label-width-mm));
        grid-template-rows: repeat(var(--rows), var(--label-height-mm));
        width: var(--paper-width-mm);
        min-height: var(--paper-height-mm);
        gap: 0;
        align-content: start;
      }
      .etiqueta-item {
        border: 1px solid #000;
        padding: var(--etq-padding-mm);
        text-align: center;
        background: #fff;
        break-inside: avoid;
        page-break-inside: avoid;
        width: var(--label-width-mm);
        height: var(--label-height-mm);
        overflow: hidden;
        box-sizing: border-box;
        display: grid;
        grid-template-rows: auto auto auto auto;
        align-content: start;
        gap: var(--etq-gap-v-mm);
      }
      .etiqueta-nome {
        font-size: var(--etq-nome-size-mm);
        font-weight: 600;
        line-height: 1.1;
        word-break: break-word;
        max-height: var(--etq-nome-max-height-mm);
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }
      .etiqueta-barcode {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: var(--etq-barcode-height-mm);
      }
      .etiqueta-barcode svg {
        max-width: 100%;
        height: var(--etq-barcode-height-mm);
      }
      .etiqueta-codigo-numero {
        font-size: var(--etq-codigo-size-mm);
        font-family: monospace;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .etiqueta-preco {
        font-size: var(--etq-preco-size-mm);
        font-weight: 700;
        line-height: 1.1;
      }
      @media print {
        body { margin: 0; }
        .print-page { page-break-after: always; }
        .print-page:last-child { page-break-after: auto; }
      }
    `
  }

  function imprimirEtiquetasEmJanelaDedicada(listaProdutos) {
    if (!listaProdutos || listaProdutos.length === 0) return false

    const {
      larguraEtiqueta,
      alturaEtiqueta,
      larguraPapel,
      alturaPapel,
      colunas,
      linhas,
    } = configEtiquetas

    const labelWidthMm = Number(larguraEtiqueta) || 28
    const labelHeightMm = Number(alturaEtiqueta) || 18
    const paperWidthMm = Number(larguraPapel) || 60
    const paperHeightMm = Number(alturaPapel) || 40
    const columns = Math.max(1, parseInt(colunas, 10) || 1)
    const rows = Math.max(1, parseInt(linhas, 10) || 1)
    const labelsPerPage = columns * rows
    const layout = calcularLayoutEtiquetaProporcional(labelWidthMm, labelHeightMm)

    const labelHtmls = listaProdutos.map((produto, i) =>
      htmlEtiquetaProdutoParaImpressao(produto, i, layout)
    )

    const pageChunks = []
    for (let i = 0; i < labelHtmls.length; i += labelsPerPage) {
      pageChunks.push(labelHtmls.slice(i, i + labelsPerPage))
    }

    const pageHtml = pageChunks
      .map(
        (chunk) =>
          `<div class="print-page">
  <div class="etiquetas-container">
${chunk.join('\n')}
  </div>
</div>`
      )
      .join('\n')

    const printCss = montarCssImpressaoEtiquetas({
      paperWidthMm,
      paperHeightMm,
      labelWidthMm,
      labelHeightMm,
      columns,
      rows,
      layout,
    })

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>${printCss}</style></head><body>${pageHtml}</body></html>`

    const printWin = window.open('', '_blank')
    if (!printWin) {
      mostrarToast('Permita pop-ups para imprimir etiquetas.', 'error')
      return false
    }
    printWin.document.write(html)
    printWin.document.close()
    printWin.focus()
    const imprimirDepois = () => {
      printWin.print()
      printWin.onafterprint = () => {
        try {
          printWin.close()
        } catch {
          /* ignore */
        }
        queueMicrotask(() => {
          window.focus()
          recoverInputFocus()
        })
      }
      setTimeout(() => {
        try {
          printWin.close()
        } catch {
          /* ignore */
        }
        queueMicrotask(() => {
          window.focus()
          recoverInputFocus()
        })
      }, 3000)
    }
    if (printWin.document.readyState === 'complete') {
      setTimeout(imprimirDepois, 400)
    } else {
      printWin.addEventListener('load', () => setTimeout(imprimirDepois, 400))
    }
    return true
  }

  async function handleConfirmarImpressao() {
    const lista = gerarListaEtiquetasParaImpressao()
    if (lista.length === 0) {
      mostrarToast('Nenhuma etiqueta para imprimir. Verifique as quantidades.', 'error')
      return
    }
    const ok = imprimirEtiquetasEmJanelaDedicada(lista)
    if (ok) {
      setModalVisualizarEtiquetasAberto(false)
      mostrarToast(
        `Enviando ${lista.length} etiqueta(s) para impressão. Confira o total no diálogo da impressora.`,
        'success'
      )
    }
  }

  const produtosFiltrados = useMemo(() => {
    const termo = busca.toLowerCase().trim()
    if (!termo) return produtos
    return produtos.filter((produto) => {
      const nomeOk = produto.nome && produto.nome.toLowerCase().includes(termo)
      const codigoOk = produto.codigo_barras && String(produto.codigo_barras).includes(termo)
      return nomeOk || codigoOk
    })
  }, [produtos, busca])

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
                ref={buscaInputRef}
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
              <div className="modal-produto-body">
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
                      onChange={(e) => {
                        const checked = e.target.checked
                        setAdicionarVariacao(checked)
                        if (!checked) {
                          setErroTipoVariacaoProduto('')
                          setTipoVariacaoProdutoId('')
                        }
                      }}
                    />
                    Adicionar variação
                  </label>
                  {adicionarVariacao && (
                  <>
                    <div className="modal-field">
                      <label htmlFor="tipoVariacaoProduto">Tipo de variação</label>
                      <select
                        id="tipoVariacaoProduto"
                        value={tipoVariacaoProdutoId}
                        onChange={(e) => handleSelecionarTipoVariacaoProduto(e.target.value)}
                      >
                        <option value="">Selecione o tipo...</option>
                        {tiposVariacao.map((t) => (
                          <option key={t.id} value={t.id}>{t.nome}</option>
                        ))}
                      </select>
                      {erroTipoVariacaoProduto && (
                        <small className="modal-field-error">{erroTipoVariacaoProduto}</small>
                      )}
                    </div>
                    {tipoVariacaoProdutoId ? (
                      <div className="modal-variacoes-grid">
                        {(tiposVariacao.find((t) => String(t.id) === String(tipoVariacaoProdutoId))?.valores || []).map((valorObj) => {
                          const v = valorObj.valor
                          return (
                            <div key={`${tipoVariacaoProdutoId}-${valorObj.id}`} className="modal-variacao-item">
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
                          )
                        })}
                      </div>
                    ) : (
                      <p className="modal-variacoes-empty">Selecione um tipo de variação para exibir os valores.</p>
                    )}
                  </>
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
            <div className="modal-etiquetas-body">
              <div className="modal-etiquetas-busca">
                <div
                  className={
                    etiquetasConfigTamanhoAberta
                      ? 'modal-etiquetas-config-wrap modal-etiquetas-config-wrap--aberta'
                      : 'modal-etiquetas-config-wrap'
                  }
                >
                  <button
                    type="button"
                    className="modal-etiquetas-config-toggle"
                    onClick={() => setEtiquetasConfigTamanhoAberta((v) => !v)}
                    aria-expanded={etiquetasConfigTamanhoAberta}
                  >
                    <span>Tamanho da etiqueta (mm)</span>
                    <svg
                      className={etiquetasConfigTamanhoAberta ? 'modal-etiquetas-config-chevron aberta' : 'modal-etiquetas-config-chevron'}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {etiquetasConfigTamanhoAberta && (
                    <div className="modal-etiquetas-config">
                      <div className="modal-etiquetas-config-grid">
                        <label>
                          Largura etiqueta
                          <input
                            type="number"
                            min={5}
                            value={configEtiquetas.larguraEtiqueta}
                            onChange={(e) => atualizarConfigEtiquetas({ larguraEtiqueta: Number(e.target.value) || 0 })}
                          />
                        </label>
                        <label>
                          Altura etiqueta
                          <input
                            type="number"
                            min={5}
                            value={configEtiquetas.alturaEtiqueta}
                            onChange={(e) => atualizarConfigEtiquetas({ alturaEtiqueta: Number(e.target.value) || 0 })}
                          />
                        </label>
                        <label>
                          Largura papel
                          <input
                            type="number"
                            min={10}
                            value={configEtiquetas.larguraPapel}
                            onChange={(e) => atualizarConfigEtiquetas({ larguraPapel: Number(e.target.value) || 0 })}
                          />
                        </label>
                        <label>
                          Altura papel
                          <input
                            type="number"
                            min={10}
                            value={configEtiquetas.alturaPapel}
                            onChange={(e) => atualizarConfigEtiquetas({ alturaPapel: Number(e.target.value) || 0 })}
                          />
                        </label>
                        <label>
                          Colunas
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={configEtiquetas.colunas}
                            onChange={(e) => atualizarConfigEtiquetas({ colunas: Number(e.target.value) || 1 })}
                          />
                        </label>
                        <label>
                          Linhas (por folha)
                          <input
                            type="number"
                            min={1}
                            max={12}
                            value={configEtiquetas.linhas}
                            onChange={(e) => atualizarConfigEtiquetas({ linhas: Number(e.target.value) || 1 })}
                          />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
                <div className="modal-etiquetas-filtros-linha">
                  <label className="modal-etiquetas-filtro-artesao">
                    <span>Artesão</span>
                    <select
                      value={filtroArtesaoEtiqueta}
                      onChange={(e) => {
                        setFiltroArtesaoEtiqueta(e.target.value)
                        setEtiquetasSugestoesSelecionadas([])
                      }}
                    >
                      <option value="">Todos</option>
                      {artesoes.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
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
                {mostrarSugestoesEtiquetas && (
                  <div className="modal-etiquetas-sugestoes">
                    <div className="modal-etiquetas-sugestoes-acoes">
                      <button
                        type="button"
                        className="modal-etiquetas-adicionar-selecionados"
                        onClick={adicionarSelecionadosSugestoesEtiquetas}
                        disabled={etiquetasSugestoesSelecionadas.length === 0}
                      >
                        Adicionar selecionados
                      </button>
                    </div>
                    <div className="modal-etiquetas-sugestoes-table-wrapper">
                      <table className="modal-etiquetas-tabela modal-etiquetas-sugestoes-tabela">
                        <thead>
                          <tr>
                            <th className="modal-etiquetas-col-check">
                              <input
                                type="checkbox"
                                title="Selecionar todos"
                                checked={todasSugestoesSelecionadas}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEtiquetasSugestoesSelecionadas(todasChavesSugestoesEtiquetas)
                                  } else {
                                    setEtiquetasSugestoesSelecionadas([])
                                  }
                                }}
                              />
                            </th>
                            <th>Código</th>
                            <th>Produto</th>
                            <th>Artesão</th>
                            <th>Preço</th>
                            <th>Qtd</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {produtosFiltradosEtiquetas.length === 0 ? (
                            <tr>
                              <td colSpan={7}>Nenhum produto encontrado.</td>
                            </tr>
                          ) : (
                            produtosFiltradosEtiquetas.map((p) => {
                              const chave = chaveProdutoEtiqueta(p)
                              const padrao = quantidadeEtiquetaPadraoPorEstoque(p)
                              const qtdStr = sugestaoQtdPorChave[chave] ?? String(padrao)
                              const parsed = parseInt(qtdStr, 10)
                              const qtd = Number.isNaN(parsed) ? padrao : Math.max(0, parsed)
                              return (
                                <tr key={chave}>
                                  <td className="modal-etiquetas-col-check">
                                    <input
                                      type="checkbox"
                                      checked={etiquetasSugestoesSelecionadas.includes(chave)}
                                      onChange={() => {
                                        setEtiquetasSugestoesSelecionadas((prev) =>
                                          prev.includes(chave) ? prev.filter((x) => x !== chave) : [...prev, chave]
                                        )
                                      }}
                                    />
                                  </td>
                                  <td>{p.codigo_barras}</td>
                                  <td>{p.nome}{p.variacao ? ` (${p.variacao})` : ''}</td>
                                  <td>{p.artesao_nome || '—'}</td>
                                  <td>R$ {p.preco_venda?.toFixed(2).replace('.', ',')}</td>
                                  <td>
                                    <input
                                      type="number"
                                      min={0}
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
                                        setEtiquetasSugestoesSelecionadas((prev) => prev.filter((x) => x !== chave))
                                        setSugestaoQtdPorChave((prev) => {
                                          const next = { ...prev }
                                          delete next[chave]
                                          return next
                                        })
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
              <div className="modal-etiquetas-lista-toolbar">
                <button
                  type="button"
                  className="modal-etiquetas-remover-selecionados"
                  onClick={removerEtiquetasListaSelecionadas}
                  disabled={etiquetasListaSelecionadas.length === 0}
                >
                  Remover selecionados
                </button>
              </div>
              <div className="modal-etiquetas-tabela-wrapper">
                <table className="modal-etiquetas-tabela">
                  <thead>
                    <tr>
                      <th className="modal-etiquetas-col-check">
                        <input
                          type="checkbox"
                          title="Selecionar todos"
                          checked={todasListaEtiquetasSelecionadas}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEtiquetasListaSelecionadas(
                                produtosParaEtiquetas.map((item) => chaveProdutoEtiqueta(item.produto))
                              )
                            } else {
                              setEtiquetasListaSelecionadas([])
                            }
                          }}
                        />
                      </th>
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
                        <td colSpan={6}>Nenhum produto adicionado. Pesquise e adicione produtos acima.</td>
                      </tr>
                    ) : (
                      produtosParaEtiquetas.map((item, idx) => (
                        <tr key={`${item.produto.id}-${item.produto.variacao || ''}-${idx}`}>
                          <td className="modal-etiquetas-col-check">
                            <input
                              type="checkbox"
                              checked={etiquetasListaSelecionadas.includes(chaveProdutoEtiqueta(item.produto))}
                              onChange={() => {
                                const k = chaveProdutoEtiqueta(item.produto)
                                setEtiquetasListaSelecionadas((prev) =>
                                  prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]
                                )
                              }}
                            />
                          </td>
                          <td>{item.produto.codigo_barras}</td>
                          <td>{item.produto.nome}{item.produto.variacao ? ` (${item.produto.variacao})` : ''}</td>
                          <td>
                            <div className="modal-etiquetas-qtd">
                              <button type="button" onClick={() => alterarQuantidadeEtiqueta(idx, -1)}>−</button>
                              <input
                                type="number"
                                min={0}
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
            <div
              className="etiquetas-container"
              style={{
                gridTemplateColumns: `repeat(${configEtiquetas.colunas || 2}, minmax(0, 1fr))`,
              }}
            >
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
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                      <ul className="modal-variacoes-valores">
                        <li className="modal-variacoes-valor-add-item">
                          <form
                            onSubmit={(e) => handleCriarValorVariacaoPorTipo(e, tipo.id)}
                            className="modal-variacoes-form modal-variacoes-form-inline"
                          >
                            <input
                              type="text"
                              placeholder={`Adicionar valor em ${tipo.nome}`}
                              value={novoValorPorTipo[tipo.id] || ''}
                              onChange={(e) =>
                                setNovoValorPorTipo((prev) => ({ ...prev, [tipo.id]: e.target.value }))
                              }
                            />
                            <button type="submit" className="modal-variacoes-btn-add">Adicionar valor</button>
                          </form>
                        </li>
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
                                    onClick={() => iniciarEdicaoValor(v.valor, v.id)}
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
                                    onClick={() => abrirModalExcluirValorVariacao(tipo.id, v)}
                                  >
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      <line x1="10" y1="11" x2="10" y2="17" />
                                      <line x1="14" y1="11" x2="14" y2="17" />
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

      {valorVariacaoParaExcluir && (
        <div className="modal-overlay" onClick={fecharModalExcluirValorVariacao}>
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Excluir valor de variação</h3>
              <button
                type="button"
                className="modal-close"
                onClick={fecharModalExcluirValorVariacao}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <p>
              Tem certeza que deseja excluir o valor{' '}
              <strong>
                {valorVariacaoParaExcluir.valor}
                {valorVariacaoParaExcluir.tipoNome ? ` (${valorVariacaoParaExcluir.tipoNome})` : ''}
              </strong>
              ?
            </p>
            <div className="modal-confirm-acoes">
              <button
                type="button"
                className="modal-btn-cancelar"
                onClick={fecharModalExcluirValorVariacao}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="modal-btn-excluir"
                onClick={confirmarExclusaoValorVariacao}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
