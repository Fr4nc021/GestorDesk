import loupeIcon from '../assets/complements/loupe.png'
import filterIcon from '../assets/complements/filter.png'
import { useState, useEffect, useMemo, useRef } from 'react'
import { recoverInputFocus } from '../utils/focusRecovery'
import { rotuloNomeFantasia, textoInclui } from '../utils/artesao'
import {
  FORMACAO_PADRAO,
  MULTIPLICADOR_FOLGA,
  calcularFormacao,
  camposDeFormacao,
  composicaoEmReais,
  formatarMoeda,
  formatarMultiplicador,
  formatarPercentual,
  precoSugerido,
  arredondarPrecoVenda,
} from '../utils/formacaoPreco'
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
  const [modalRefazerCodigoAberto, setModalRefazerCodigoAberto] = useState(false)
  const [refazendoCodigo, setRefazendoCodigo] = useState(false)
  const [nome, setNome] = useState('')
  const [adicionarVariacao, setAdicionarVariacao] = useState(false)
  const [painelVariacoesAberto, setPainelVariacoesAberto] = useState(false)
  const [variacoesComQuantidade, setVariacoesComQuantidade] = useState({ P: 0, M: 0, G: 0, GG: 0 })
  /** Variações ativas do produto (independe do estoque; permite estoque 0). */
  const [variacoesIncluidas, setVariacoesIncluidas] = useState({})
  const [precoCusto, setPrecoCusto] = useState('')
  const [lucroEsperado, setLucroEsperado] = useState('')
  const [precoVenda, setPrecoVenda] = useState('')
  const [estoque, setEstoque] = useState('')
  const [artesaoId, setArtesaoId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [duplicandoId, setDuplicandoId] = useState(null)
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
    exibirCodigoBarras: true,
  })

  const [formacao, setFormacao] = useState(FORMACAO_PADRAO)
  const [modalFormacaoAberto, setModalFormacaoAberto] = useState(false)
  const [formacaoRascunho, setFormacaoRascunho] = useState(() => camposDeFormacao(FORMACAO_PADRAO))
  const [salvandoFormacao, setSalvandoFormacao] = useState(false)
  const [aplicandoEmTodos, setAplicandoEmTodos] = useState(false)
  const [abaProduto, setAbaProduto] = useState('dados')
  const formacaoCalc = useMemo(() => calcularFormacao(formacao), [formacao])
  const formacaoRascunhoCalc = useMemo(() => calcularFormacao(formacaoRascunho), [formacaoRascunho])

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
    modalRefazerCodigoAberto ||
    modalEtiquetasAberto ||
    modalVisualizarEtiquetasAberto ||
    modalFormacaoAberto ||
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
    carregarFormacao()
  }, [])

  function abrirModal() {
    setProdutoEmEdicao(null)
    setNome('')
    setAdicionarVariacao(false)
    setPainelVariacoesAberto(false)
    const quantidadesIniciais = {}
    const incluidasIniciais = {}
    valoresVariacao.forEach((v) => {
      quantidadesIniciais[v] = 0
      incluidasIniciais[v] = false
    })
    setVariacoesComQuantidade(quantidadesIniciais)
    setVariacoesIncluidas(incluidasIniciais)
    setPrecoCusto('')
    setLucroEsperado('')
    setPrecoVenda('')
    setEstoque('')
    setArtesaoId('')
    setTipoVariacaoProdutoId('')
    setErroTipoVariacaoProduto('')
    setAbaProduto('dados')
    setModalAberto(true)
  }

  function abrirModalEdicao(produto) {
    setProdutoEmEdicao(produto)
    setNome(produto.nome)
    setAdicionarVariacao(!!produto.variacao)
    setPainelVariacoesAberto(false)
    const tipoDoProduto = produto.variacao
      ? tiposVariacao.find((tipo) => (tipo.valores || []).some((valor) => valor.valor === produto.variacao))
      : null
    const irmaos =
      produto.variacao
        ? produtos.filter(
            (p) =>
              p.nome.trim() === produto.nome.trim() &&
              p.artesao_id === produto.artesao_id &&
              p.variacao,
          )
        : []
    const variacoes = {}
    const incluidas = {}
    if (tipoDoProduto) {
      ;(tipoDoProduto.valores || []).forEach((valor) => {
        variacoes[valor.valor] = 0
        incluidas[valor.valor] = false
      })
      for (const p of irmaos) {
        if (Object.prototype.hasOwnProperty.call(variacoes, p.variacao)) {
          variacoes[p.variacao] = Number(p.estoque) || 0
          incluidas[p.variacao] = true
        }
      }
    } else {
      valoresVariacao.forEach((v) => {
        variacoes[v] = 0
        incluidas[v] = false
      })
      if (produto.variacao) {
        variacoes[produto.variacao] = Number(produto.estoque) || 0
        incluidas[produto.variacao] = true
      }
    }
    setVariacoesComQuantidade(variacoes)
    setVariacoesIncluidas(incluidas)
    setPrecoCusto(String(produto.preco_custo ?? ''))
    setLucroEsperado(lucroPercentualDePrecos(produto.preco_custo, produto.preco_venda))
    setPrecoVenda(String(produto.preco_venda ?? ''))
    setEstoque(String(produto.estoque ?? ''))
    setArtesaoId(String(produto.artesao_id ?? ''))
    setTipoVariacaoProdutoId(tipoDoProduto ? String(tipoDoProduto.id) : '')
    setErroTipoVariacaoProduto('')
    setAbaProduto('dados')
    setModalAberto(true)
  }

  function abrirModalExcluir(produto) {
    setProdutoParaExcluir(produto)
    setModalExcluirAberto(true)
  }

  async function handleDuplicarProduto(produto) {
    if (!produto || duplicandoId) return
    if (!window.electronAPI?.criarProduto) {
      alert('Execute o app pelo Electron (npm start). O banco de dados não está disponível no navegador.')
      return
    }
    const artesaoVal = parseInt(produto.artesao_id, 10)
    if (!artesaoVal || artesaoVal < 1) {
      mostrarToast('Não foi possível duplicar: o produto não tem fornecedor.', 'error')
      return
    }
    setDuplicandoId(produto.id)
    try {
      await window.electronAPI.criarProduto({
        nome: `${String(produto.nome || '').trim()} (cópia)`,
        variacao: produto.variacao || null,
        preco_custo: Number(produto.preco_custo) || 0,
        preco_venda: Number(produto.preco_venda) || 0,
        estoque: Number(produto.estoque) || 0,
        artesao_id: artesaoVal,
      })
      await carregarProdutos()
      mostrarToast('Produto duplicado com sucesso!', 'success')
    } catch (err) {
      console.error('[Produtos] Erro ao duplicar produto:', err)
      mostrarToast(`Erro ao duplicar produto: ${err?.message || err}`, 'error')
    } finally {
      setDuplicandoId(null)
    }
  }

  async function handleRefazerCodigoBarras() {
    if (!produtoEmEdicao || refazendoCodigo) return
    setRefazendoCodigo(true)
    try {
      const resultado = await window.electronAPI.refazerCodigoBarras(produtoEmEdicao.id)
      setProdutoEmEdicao((prev) =>
        prev ? { ...prev, codigo_barras: resultado.codigo_barras } : prev,
      )
      await carregarProdutos()
      setModalRefazerCodigoAberto(false)
      mostrarToast('Novo código de barras gerado com sucesso!', 'success')
    } catch (err) {
      console.error('[Produtos] Erro ao refazer código de barras:', err)
      mostrarToast(err?.message || 'Erro ao refazer código de barras.', 'error')
    } finally {
      setRefazendoCodigo(false)
    }
  }

  function handleVariacaoQuantidade(variacao, valor) {
    const qtd = parseInt(String(valor).replace(/\D/g, ''), 10) || 0
    setVariacoesComQuantidade((prev) => ({ ...prev, [variacao]: qtd }))
    if (qtd > 0) {
      setVariacoesIncluidas((prev) => ({ ...prev, [variacao]: true }))
    }
  }

  function handleVariacaoIncluidaToggle(valorVariacao, marcado) {
    setVariacoesIncluidas((prev) => ({ ...prev, [valorVariacao]: marcado }))
    if (marcado) {
      setVariacoesComQuantidade((prev) => ({
        ...prev,
        [valorVariacao]: prev[valorVariacao] ?? 0,
      }))
    } else {
      setVariacoesComQuantidade((prev) => ({ ...prev, [valorVariacao]: 0 }))
    }
  }

  function fecharModalProduto() {
    if (salvando) return
    setModalAberto(false)
    setAbaProduto('dados')
  }

  function handleSelecionarTipoVariacaoProduto(tipoId) {
    setTipoVariacaoProdutoId(tipoId)
    setErroTipoVariacaoProduto('')
    const tipo = tiposVariacao.find((t) => String(t.id) === String(tipoId))
    const valores = (tipo?.valores || []).map((v) => v.valor)
    const quantidadesPorValor = {}
    const incluidasPorValor = {}
    valores.forEach((v) => {
      quantidadesPorValor[v] = 0
      incluidasPorValor[v] = false
    })
    setVariacoesComQuantidade(quantidadesPorValor)
    setVariacoesIncluidas(incluidasPorValor)
  }

  function obterVariacoesSelecionadas(valoresDoTipo) {
    return valoresDoTipo.filter((v) => variacoesIncluidas[v])
  }

  function parsePrecoInput(valor) {
    return parseFloat(String(valor).replace(',', '.')) || 0
  }

  function parsePrecoOpcional(valor) {
    const texto = String(valor ?? '').trim()
    if (!texto) return null
    const n = parseFloat(texto.replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }

  function formatPrecoInput(valor) {
    return valor.toFixed(2).replace('.', ',')
  }

  function lucroPercentualDePrecos(custo, venda) {
    const c = Number(custo)
    const v = Number(venda)
    if (!Number.isFinite(c) || c <= 0 || !Number.isFinite(v)) return ''
    const pct = Math.round((((v - c) / c) * 100) * 100) / 100
    return String(pct).replace('.', ',')
  }

  function aplicarPrecoVendaCalculado(custoTexto, lucroTexto) {
    const custo = parsePrecoOpcional(custoTexto)
    const lucro = parsePrecoOpcional(lucroTexto)
    if (custo == null || lucro == null || custo < 0) return
    const venda = arredondarPrecoVenda(custo * (1 + lucro / 100))
    setPrecoVenda(formatPrecoInput(venda))
  }

  function handlePrecoCustoChange(valor, preservarVenda = false) {
    setPrecoCusto(valor)
    if (preservarVenda && produtoEmEdicao) return
    if (!produtoEmEdicao && formacaoCalc.ok) {
      const custo = parsePrecoOpcional(valor)
      if (custo != null && custo >= 0) {
        const venda = precoSugerido(custo, formacaoCalc.multiplicador)
        if (venda != null) {
          setPrecoVenda(formatPrecoInput(venda))
          setLucroEsperado(lucroPercentualDePrecos(custo, venda))
          return
        }
      }
    }
    aplicarPrecoVendaCalculado(valor, lucroEsperado)
  }

  function aplicarPrecoFormacao() {
    if (!formacaoCalc.ok) return
    const custo = parsePrecoOpcional(precoCusto)
    if (custo == null || custo < 0) return
    const venda = precoSugerido(custo, formacaoCalc.multiplicador)
    if (venda == null) return
    setPrecoVenda(formatPrecoInput(venda))
    setLucroEsperado(lucroPercentualDePrecos(custo, venda))
  }

  async function carregarFormacao() {
    try {
      if (!window.electronAPI?.obterFormacaoPreco) return
      const dados = await window.electronAPI.obterFormacaoPreco()
      setFormacao(dados)
    } catch (err) {
      console.error('[Produtos] Erro ao carregar formação de preço:', err)
    }
  }

  function abrirModalFormacao() {
    setFormacaoRascunho(camposDeFormacao(formacao))
    setModalFormacaoAberto(true)
  }

  function atualizarRascunhoFormacao(campo, valor) {
    setFormacaoRascunho((prev) => ({ ...prev, [campo]: valor }))
  }

  function montarPayloadFormacao() {
    return {
      faturamento_medio: parsePrecoOpcional(formacaoRascunho.faturamento_medio),
      despesas_fixas_mensais: parsePrecoOpcional(formacaoRascunho.despesas_fixas_mensais),
      imposto: parsePrecoOpcional(formacaoRascunho.imposto),
      investimento: parsePrecoOpcional(formacaoRascunho.investimento),
      lucro: parsePrecoOpcional(formacaoRascunho.lucro),
      usar_folga: Boolean(formacaoRascunho.usar_folga),
    }
  }

  async function handleSalvarFormacao(e) {
    e.preventDefault()
    const payload = montarPayloadFormacao()
    const calc = calcularFormacao(payload)
    if (!calc.ok) {
      mostrarToast(
        calc.motivo === 'soma'
          ? 'A soma dos percentuais chega a 100% ou mais. Ajuste os valores.'
          : 'Informe o faturamento médio e as despesas fixas.',
        'error',
      )
      return
    }
    setSalvandoFormacao(true)
    try {
      if (window.electronAPI?.salvarFormacaoPreco) {
        const salvo = await window.electronAPI.salvarFormacaoPreco(payload)
        setFormacao(salvo)
      } else {
        setFormacao(payload)
      }
      setModalFormacaoAberto(false)
      mostrarToast('Formação de preço salva.', 'success')
    } catch (err) {
      mostrarToast(err?.message || 'Erro ao salvar a formação de preço.', 'error')
    } finally {
      setSalvandoFormacao(false)
    }
  }

  async function aplicarFormacaoEmTodos() {
    const payload = montarPayloadFormacao()
    const calc = calcularFormacao(payload)
    if (!calc.ok) {
      mostrarToast(
        calc.motivo === 'soma'
          ? 'A soma dos percentuais chega a 100% ou mais. Ajuste os valores.'
          : 'Informe o faturamento médio e as despesas fixas.',
        'error',
      )
      return
    }
    const multiplicador = formatarMultiplicador(calc.multiplicador)
    const confirmar = window.confirm(
      `Substituir o preço de venda de todos os produtos com custo? Cada preço passa a ser o custo × ${multiplicador}. Produtos sem custo ficam como estão.`,
    )
    if (!confirmar) return
    if (!window.electronAPI?.aplicarPrecoFormacaoEmTodos) {
      mostrarToast('Execute o app pelo Electron para aplicar nos produtos.', 'error')
      return
    }
    setAplicandoEmTodos(true)
    try {
      if (window.electronAPI.salvarFormacaoPreco) {
        const salvo = await window.electronAPI.salvarFormacaoPreco(payload)
        setFormacao(salvo)
      }
      const resultado = await window.electronAPI.aplicarPrecoFormacaoEmTodos(calc.multiplicador)
      await carregarProdutos()
      const qtd = resultado?.atualizados ?? 0
      mostrarToast(
        qtd === 1
          ? 'Preço atualizado em 1 produto.'
          : `Preço atualizado em ${qtd} produtos.`,
        'success',
      )
    } catch (err) {
      mostrarToast(err?.message || 'Erro ao aplicar o preço nos produtos.', 'error')
    } finally {
      setAplicandoEmTodos(false)
    }
  }

  function handleLucroEsperadoChange(valor) {
    setLucroEsperado(valor)
    aplicarPrecoVendaCalculado(precoCusto, valor)
  }

  function handlePrecoVendaChange(valor) {
    setPrecoVenda(valor)
    const custo = parsePrecoOpcional(precoCusto)
    const venda = parsePrecoOpcional(valor)
    if (custo == null || custo <= 0 || venda == null) return
    setLucroEsperado(lucroPercentualDePrecos(custo, venda))
  }

  function parseEstoqueInput(valor) {
    return parseInt(String(valor).replace(/\D/g, ''), 10) || 0
  }

  async function salvarProdutoEmEdicaoComVariacao(custo, venda, artesaoVal) {
    const tipoSelecionado = tiposVariacao.find((t) => String(t.id) === String(tipoVariacaoProdutoId))
    if (!tipoSelecionado) {
      setErroTipoVariacaoProduto('Selecione um tipo de variação.')
      setAbaProduto('dados')
      setPainelVariacoesAberto(true)
      setSalvando(false)
      return false
    }
    const valoresDoTipo = (tipoSelecionado.valores || []).map((v) => v.valor)
    const variacoesSelecionadas = obterVariacoesSelecionadas(valoresDoTipo)
    if (variacoesSelecionadas.length === 0) {
      setAbaProduto('dados')
      setPainelVariacoesAberto(true)
      alert('Marque pelo menos uma variação e informe o estoque de cada uma.')
      setSalvando(false)
      return false
    }
    const variacaoPrincipal =
      produtoEmEdicao.variacao && variacoesSelecionadas.includes(produtoEmEdicao.variacao)
        ? produtoEmEdicao.variacao
        : variacoesSelecionadas[0]
    const nomeTrim = nome.trim()
    const qtdPrincipal = variacoesComQuantidade[variacaoPrincipal] ?? 0
    await window.electronAPI.atualizarProduto(produtoEmEdicao.id, {
      nome: nomeTrim,
      variacao: variacaoPrincipal,
      preco_custo: custo,
      preco_venda: venda,
      estoque: qtdPrincipal,
      artesao_id: artesaoVal,
    })
    for (const variacao of variacoesSelecionadas) {
      if (variacao === variacaoPrincipal) continue
      const qtd = variacoesComQuantidade[variacao] ?? 0
      const existente = produtos.find(
        (p) =>
          p.nome.trim() === nomeTrim &&
          p.artesao_id === artesaoVal &&
          p.variacao === variacao,
      )
      if (existente) {
        await window.electronAPI.atualizarProduto(existente.id, {
          nome: nomeTrim,
          variacao,
          preco_custo: custo,
          preco_venda: venda,
          estoque: qtd,
          artesao_id: artesaoVal,
        })
      } else {
        await window.electronAPI.criarProduto({
          nome: nomeTrim,
          variacao,
          preco_custo: custo,
          preco_venda: venda,
          estoque: qtd,
          artesao_id: artesaoVal,
        })
      }
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
      setAbaProduto('dados')
      setPainelVariacoesAberto(true)
      setSalvando(false)
      return false
    }
    const valoresDoTipo = (tipoSelecionado.valores || []).map((v) => v.valor)
    const variacoesSelecionadas = obterVariacoesSelecionadas(valoresDoTipo)
    if (variacoesSelecionadas.length === 0) {
      setAbaProduto('dados')
      setPainelVariacoesAberto(true)
      alert('Marque pelo menos uma variação e informe o estoque de cada uma.')
      setSalvando(false)
      return false
    }
    for (const variacao of variacoesSelecionadas) {
      const qtd = variacoesComQuantidade[variacao] ?? 0
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
      setAbaProduto('dados')
      alert('Informe o nome do produto.')
      return
    }

    const artesaoVal = parseInt(artesaoId, 10)
    if (!artesaoVal || artesaoVal < 1) {
      setAbaProduto('dados')
      alert('Selecione um fornecedor.')
      return
    }

    const custo = parsePrecoInput(precoCusto)
    const venda = arredondarPrecoVenda(parsePrecoInput(precoVenda))

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
          mostrarToast('Este produto não corresponde ao filtro de fornecedor.', 'error')
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
        (textoInclui(termoLower, p.nome, p.artesao_nome, p.artesao_razao_social, p.artesao_nome_fantasia) ||
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
      const codigo = String(p.codigo_barras || '')
      return (
        textoInclui(termo, p.nome, p.artesao_nome, p.artesao_razao_social, p.artesao_nome_fantasia) ||
        codigo.includes(buscaEtiqueta.trim())
      )
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

  function calcularLayoutEtiquetaProporcional(labelWidthMm, labelHeightMm, exibirCodigoBarras = true) {
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

    if (!exibirCodigoBarras) {
      barcodeHeightMm = 0
      nomeFonteMm = clamp(labelHeightMm * 0.14, base * 0.07, labelHeightMm * 0.22)
      codigoFonteMm = clamp(labelHeightMm * 0.1, base * 0.055, labelHeightMm * 0.16)
      precoFonteMm = 4
      gapVerticalMm = clamp(labelHeightMm * 0.04, labelHeightMm * 0.015, labelHeightMm * 0.08)
    }

    const alturaSeguraMm = labelHeightMm * 0.98
    const gaps = exibirCodigoBarras ? 3 : 2
    const alturaBlocoTextoMm = nomeFonteMm * 2.3 + codigoFonteMm * 1.3 + precoFonteMm * 1.3
    const alturaTotalMm = paddingMm * 2 + gapVerticalMm * gaps + barcodeHeightMm + alturaBlocoTextoMm
    if (alturaTotalMm > alturaSeguraMm) {
      const escala = alturaSeguraMm / alturaTotalMm
      paddingMm *= escala
      gapVerticalMm *= escala
      nomeFonteMm *= escala
      codigoFonteMm *= escala
      if (exibirCodigoBarras) precoFonteMm *= escala
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
      exibirCodigoBarras,
    }
  }

  function htmlEtiquetaProdutoParaImpressao(produto, idx, layout) {
    const nome =
      escapeHtmlEtiqueta(produto.nome) +
      (produto.variacao ? ` (${escapeHtmlEtiqueta(produto.variacao)})` : '')
    const code = String(produto.codigo_barras || '').trim()
    const comBarras = layout.exibirCodigoBarras !== false
    let barcodeHtml = ''
    if (comBarras) {
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
          svg.style.width = '95%'
          svg.style.height = `${layout.barcodeHeightMm}mm`
          svg.style.maxWidth = '95%'
          svg.style.display = 'block'
          barcodeInner = svg.outerHTML
        } catch {
          barcodeInner = `<span class="etiqueta-codigo-fallback">${escapeHtmlEtiqueta(code)}</span>`
        }
      }
      barcodeHtml = `<div class="etiqueta-barcode">${barcodeInner}</div>`
    }
    const preco =
      produto.preco_venda != null
        ? `R$ ${Number(produto.preco_venda).toFixed(2).replace('.', ',')}`
        : '-'
    const classeItem = comBarras ? 'etiqueta-item' : 'etiqueta-item etiqueta-item--sem-barras'
    return `<div class="${classeItem}" data-idx="${idx}">
  <div class="etiqueta-nome">${nome}</div>
  ${barcodeHtml}
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
      .etiquetas-container--dupla-20 {
        width: 40mm;
        height: 40mm;
        min-height: 40mm;
        justify-content: center;
        align-content: center;
        align-items: center;
      }
      .print-page--dupla-20 {
        width: 40mm;
        height: 40mm;
        overflow: hidden;
      }
      .etiqueta-item {
        border: none;
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
      .etiqueta-item--sem-barras {
        grid-template-rows: auto auto auto;
        align-content: center;
        width: 20mm;
        height: 20mm;
        max-width: 20mm;
        max-height: 20mm;
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
        width: 95%;
        max-width: 95%;
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
      .etiqueta-item--sem-barras .etiqueta-preco {
        font-weight: 800;
        letter-spacing: -0.02em;
      }
      @media print {
        body { margin: 0; }
        .print-page { page-break-after: always; }
        .print-page:last-child { page-break-after: auto; }
      }
    `
  }

  function geometriaImpressaoEtiquetas(exibirCodigoBarras) {
    if (!exibirCodigoBarras) {
      return {
        labelWidthMm: 20,
        labelHeightMm: 20,
        paperWidthMm: 40,
        paperHeightMm: 40,
        columns: 1,
        rows: 2,
      }
    }
    return {
      labelWidthMm: Number(configEtiquetas.larguraEtiqueta) || 28,
      labelHeightMm: Number(configEtiquetas.alturaEtiqueta) || 18,
      paperWidthMm: Number(configEtiquetas.larguraPapel) || 60,
      paperHeightMm: Number(configEtiquetas.alturaPapel) || 40,
      columns: Math.max(1, parseInt(configEtiquetas.colunas, 10) || 1),
      rows: Math.max(1, parseInt(configEtiquetas.linhas, 10) || 1),
    }
  }

  function imprimirEtiquetasEmJanelaDedicada(listaProdutos) {
    if (!listaProdutos || listaProdutos.length === 0) return false

    const exibirCodigoBarras = configEtiquetas.exibirCodigoBarras !== false
    const {
      labelWidthMm,
      labelHeightMm,
      paperWidthMm,
      paperHeightMm,
      columns,
      rows,
    } = geometriaImpressaoEtiquetas(exibirCodigoBarras)
    const labelsPerPage = columns * rows
    const layout = calcularLayoutEtiquetaProporcional(
      labelWidthMm,
      labelHeightMm,
      exibirCodigoBarras
    )

    const labelHtmls = listaProdutos.map((produto, i) =>
      htmlEtiquetaProdutoParaImpressao(produto, i, layout)
    )

    const pageChunks = []
    for (let i = 0; i < labelHtmls.length; i += labelsPerPage) {
      pageChunks.push(labelHtmls.slice(i, i + labelsPerPage))
    }

    const classePagina = exibirCodigoBarras ? 'print-page' : 'print-page print-page--dupla-20'
    const classeContainer = exibirCodigoBarras
      ? 'etiquetas-container'
      : 'etiquetas-container etiquetas-container--dupla-20'
    const pageHtml = pageChunks
      .map(
        (chunk) =>
          `<div class="${classePagina}">
  <div class="${classeContainer}">
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
      const codigoOk = produto.codigo_barras && String(produto.codigo_barras).includes(termo)
      return textoInclui(termo, produto.nome, produto.artesao_nome, produto.artesao_razao_social, produto.artesao_nome_fantasia) || codigoOk
    })
  }, [produtos, busca])

  const resumoCatalogo = useMemo(() => {
    const cadastrados = produtos.length
    const estoqueTotal = produtos.reduce((acc, p) => acc + (Number(p.estoque) || 0), 0)
    return { cadastrados, estoqueTotal }
  }, [produtos])

  const valoresTipoProduto = useMemo(() => {
    if (!tipoVariacaoProdutoId) return []
    const tipo = tiposVariacao.find((t) => String(t.id) === String(tipoVariacaoProdutoId))
    return tipo?.valores || []
  }, [tiposVariacao, tipoVariacaoProdutoId])

  const variacoesAtivasCount = useMemo(
    () => valoresTipoProduto.filter((vo) => variacoesIncluidas[vo.valor]).length,
    [valoresTipoProduto, variacoesIncluidas],
  )

  const variacoesAtivasLista = useMemo(
    () => valoresTipoProduto.filter((vo) => variacoesIncluidas[vo.valor]),
    [valoresTipoProduto, variacoesIncluidas],
  )

  const variacoesDisponiveisLista = useMemo(
    () => valoresTipoProduto.filter((vo) => !variacoesIncluidas[vo.valor]),
    [valoresTipoProduto, variacoesIncluidas],
  )

  function alternarPainelVariacoes() {
    if (painelVariacoesAberto) {
      setPainelVariacoesAberto(false)
      const produtoJaTemVariacao = Boolean(produtoEmEdicao?.variacao)
      if (variacoesAtivasCount === 0 && !produtoJaTemVariacao) {
        setAdicionarVariacao(false)
        setErroTipoVariacaoProduto('')
        setTipoVariacaoProdutoId('')
      }
      return
    }
    setAdicionarVariacao(true)
    setPainelVariacoesAberto(true)
  }

  function desativarVariacoesProduto() {
    setAdicionarVariacao(false)
    setPainelVariacoesAberto(false)
    setErroTipoVariacaoProduto('')
    setTipoVariacaoProdutoId('')
  }

  function renderLinhaVariacaoEstoque(valorObj) {
    const v = valorObj.valor
    const incluida = Boolean(variacoesIncluidas[v])
    return (
      <tr
        key={`${tipoVariacaoProdutoId}-${valorObj.id}`}
        className={incluida ? 'modal-variacoes-estoque-row--ativa' : ''}
      >
        <td className="modal-variacoes-estoque-col-check">
          <input
            type="checkbox"
            checked={incluida}
            onChange={(e) => handleVariacaoIncluidaToggle(v, e.target.checked)}
            aria-label={`Incluir variação ${v}`}
          />
        </td>
        <td className="modal-variacoes-estoque-col-nome">{v}</td>
        <td className="modal-variacoes-estoque-col-qtd">
          <input
            id={`qtd-var-${valorObj.id}`}
            type="number"
            min={0}
            placeholder="0"
            value={incluida ? (variacoesComQuantidade[v] ?? 0) : ''}
            onChange={(e) => {
              if (!incluida) handleVariacaoIncluidaToggle(v, true)
              handleVariacaoQuantidade(v, e.target.value)
            }}
            className="modal-variacao-qtd"
          />
        </td>
      </tr>
    )
  }

  function renderTabelaVariacoesEstoque(linhas, classeWrapper = '') {
    if (linhas.length === 0) return null
    return (
      <div className={`modal-variacoes-estoque-tabela-wrapper ${classeWrapper}`.trim()}>
        <table className="modal-variacoes-estoque-tabela">
          <thead>
            <tr>
              <th className="modal-variacoes-estoque-col-check" aria-label="Incluir" />
              <th>Variação</th>
              <th>Estoque</th>
            </tr>
          </thead>
          <tbody>{linhas.map(renderLinhaVariacaoEstoque)}</tbody>
        </table>
      </div>
    )
  }

  const custoInformado = parsePrecoOpcional(precoCusto)
  const vendaInformada = parsePrecoOpcional(precoVenda)
  const lucroEmReais =
    custoInformado != null && vendaInformada != null
      ? Math.round((vendaInformada - custoInformado) * 100) / 100
      : null
  const vendaSugerida =
    formacaoCalc.ok && custoInformado != null
      ? precoSugerido(custoInformado, formacaoCalc.multiplicador)
      : null
  const partesReais =
    vendaSugerida != null && custoInformado != null
      ? composicaoEmReais(custoInformado, vendaSugerida, formacaoCalc)
      : null

  function renderAvisoFormacao(calc) {
    if (!calc?.ok && calc?.motivo === 'soma') {
      return (
        <p className="formacao-aviso">
          A soma de imposto, custos, investimento e lucro chega a 100% ou mais. Não há preço possível.
        </p>
      )
    }
    if (!calc?.ok) {
      return <p className="formacao-aviso">Informe o faturamento médio e as despesas fixas.</p>
    }
    if (calc.abaixoDeDois && !calc.usarFolga) {
      return (
        <p className="formacao-aviso">
          Multiplicador abaixo de 2. Com esta carga de despesas, um índice menor que o calculado não gera o lucro informado. A planilha sugere {formatarMultiplicador(MULTIPLICADOR_FOLGA)} como folga.
        </p>
      )
    }
    return null
  }

  function renderLinhasComposicao(calc) {
    if (!calc?.ok) return null
    return (
      <dl className="formacao-composicao">
        <div><dt>Imposto</dt><dd>{formatarPercentual(calc.imposto)}</dd></div>
        <div><dt>Custos</dt><dd>{formatarPercentual(calc.custosPct)}</dd></div>
        <div><dt>Investimento</dt><dd>{formatarPercentual(calc.investimento)}</dd></div>
        <div><dt>Lucro</dt><dd>{formatarPercentual(calc.lucro)}</dd></div>
        <div><dt>CMV que sobra</dt><dd>{formatarPercentual(calc.cmvPct)}</dd></div>
        <div className="formacao-composicao-total">
          <dt>Multiplicador</dt>
          <dd>{formatarMultiplicador(calc.multiplicadorCalculado)}</dd>
        </div>
        {calc.usarFolga && (
          <div>
            <dt>Multiplicador usado</dt>
            <dd>{formatarMultiplicador(calc.multiplicador)}</dd>
          </div>
        )}
      </dl>
    )
  }

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
                placeholder="Buscar por nome, nome fantasia ou código..."
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
          <button type="button" className="produtos-btn-quiet" onClick={abrirModalVariacoes}>
            Variações
          </button>
          <button type="button" className="produtos-btn-quiet" onClick={abrirModalFormacao}>
            Formação de Preço
          </button>
          <button type="button" className="produtos-btn-primary" onClick={abrirModal}>
            <span>+</span> Novo Produto
          </button>
        </div>
      </div>

      <div className="produtos-resumo" aria-live="polite">
        <div className="produtos-resumo-card">
          <span className="produtos-resumo-label">Produtos cadastrados</span>
          <strong className="produtos-resumo-value">
            {loading ? '—' : resumoCatalogo.cadastrados}
          </strong>
        </div>
        <div className="produtos-resumo-card">
          <span className="produtos-resumo-label">Estoque total</span>
          <strong className="produtos-resumo-value">
            {loading ? '—' : resumoCatalogo.estoqueTotal.toLocaleString('pt-BR')}
          </strong>
        </div>
      </div>

      <div className="produtos-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Produto</th>
              <th>Fornecedor</th>
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
                  <td>{rotuloNomeFantasia(p.artesao_nome_fantasia, p.artesao_razao_social, p.artesao_nome, '-')}</td>
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
                        className="artesaos-btn-edit"
                        title="Duplicar"
                        aria-label="Duplicar produto"
                        disabled={duplicandoId === p.id}
                        onClick={() => handleDuplicarProduto(p)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
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
        <div className="modal-overlay" onClick={() => !salvando && fecharModalProduto()}>
          <div className="modal-content modal-produto" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{produtoEmEdicao ? 'Editar Produto' : 'Cadastrar Novo Produto'}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !salvando && fecharModalProduto()}
                aria-label="Fechar"
                disabled={salvando}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSalvarProduto}>
              <div className="modal-produto-body">
                <div className="formacao-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={abaProduto === 'dados'}
                    className={`formacao-tab ${abaProduto === 'dados' ? 'active' : ''}`}
                    onClick={() => setAbaProduto('dados')}
                  >
                    Dados
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={abaProduto === 'formacao'}
                    className={`formacao-tab ${abaProduto === 'formacao' ? 'active' : ''}`}
                    onClick={() => setAbaProduto('formacao')}
                  >
                    Formação de Preço
                  </button>
                </div>
                {abaProduto === 'dados' && (
                <>
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

                {produtoEmEdicao && (
                  <div className="modal-field">
                    <label>Código de barras</label>
                    <div className="modal-codigo-barras-row">
                      <span className="modal-codigo-barras-valor">
                        {produtoEmEdicao.codigo_barras || '—'}
                      </span>
                      <button
                        type="button"
                        className="produtos-btn-secondary"
                        onClick={() => setModalRefazerCodigoAberto(true)}
                        disabled={salvando || refazendoCodigo}
                      >
                        Gerar novo código
                      </button>
                    </div>
                  </div>
                )}

                <div className="modal-produto-variacao">
                  <div className="modal-variacao-toggle-row">
                    <button
                      type="button"
                      className="produtos-btn-secondary modal-variacao-toggle"
                      onClick={alternarPainelVariacoes}
                      aria-expanded={painelVariacoesAberto}
                    >
                      {painelVariacoesAberto
                        ? 'Ocultar variações'
                        : variacoesAtivasCount > 0
                          ? `Variações (${variacoesAtivasCount})`
                          : adicionarVariacao
                            ? 'Variações'
                            : 'Cadastrar variações'}
                    </button>
                    {painelVariacoesAberto ? (
                      <button
                        type="button"
                        className="modal-variacao-desativar"
                        onClick={desativarVariacoesProduto}
                      >
                        Sem variação
                      </button>
                    ) : (
                      adicionarVariacao && (
                        <span className="modal-variacao-resumo">
                          {variacoesAtivasCount > 0
                            ? variacoesAtivasLista.map((vo) => vo.valor).join(', ')
                            : produtoEmEdicao?.variacao || 'Estoque definido por variação'}
                        </span>
                      )
                    )}
                  </div>
                  {painelVariacoesAberto && (
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
                      <div className="modal-variacoes-estoque">
                        {valoresTipoProduto.length === 0 ? (
                          <p className="modal-variacoes-empty">
                            Nenhum valor neste tipo. Cadastre em &quot;Variações&quot; no menu de produtos.
                          </p>
                        ) : (
                          <>
                            <div className="modal-variacoes-estoque-secao modal-variacoes-estoque-secao--ativas">
                              <div className="modal-variacoes-estoque-secao-head">
                                <h4 className="modal-variacoes-estoque-secao-titulo">Variações do produto</h4>
                                {variacoesAtivasCount > 0 && (
                                  <span className="modal-variacoes-estoque-badge">{variacoesAtivasCount}</span>
                                )}
                              </div>
                              {variacoesAtivasLista.length === 0 ? (
                                <p className="modal-variacoes-estoque-empty">
                                  Nenhuma variação selecionada. Clique abaixo para adicionar.
                                </p>
                              ) : (
                                renderTabelaVariacoesEstoque(
                                  variacoesAtivasLista,
                                  'modal-variacoes-estoque-tabela-wrapper--ativas',
                                )
                              )}
                            </div>

                            {variacoesDisponiveisLista.length > 0 && (
                              <details className="modal-variacoes-estoque-disponiveis">
                                <summary className="modal-variacoes-estoque-disponiveis-summary">
                                  Adicionar variações
                                  <span className="modal-variacoes-estoque-disponiveis-count">
                                    ({variacoesDisponiveisLista.length} disponíveis)
                                  </span>
                                </summary>
                                <div className="modal-variacoes-estoque-disponiveis-body">
                                  {renderTabelaVariacoesEstoque(variacoesDisponiveisLista)}
                                </div>
                              </details>
                            )}
                          </>
                        )}
                      </div>
                    ) : (
                      <p className="modal-variacoes-empty">Selecione um tipo de variação para exibir os valores.</p>
                    )}
                  </>
                  )}
                </div>

                <div className="modal-produto-row modal-produto-row-3 modal-produto-precos">
                  <div className="modal-produto-precos-stack">
                    <div className="modal-field">
                      <label htmlFor="precoCusto">Preço Custo</label>
                      <input
                        id="precoCusto"
                        type="text"
                        inputMode="decimal"
                        value={precoCusto}
                        onChange={(e) => handlePrecoCustoChange(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="modal-field">
                      <label htmlFor="lucroEsperado">Lucro esperado (%)</label>
                      <input
                        id="lucroEsperado"
                        type="text"
                        inputMode="decimal"
                        value={lucroEsperado}
                        onChange={(e) => handleLucroEsperadoChange(e.target.value)}
                        placeholder="0"
                      />
                      {lucroEmReais != null && (
                        <small className="modal-field-hint">Lucro: R$ {formatPrecoInput(lucroEmReais)}</small>
                      )}
                    </div>
                  </div>
                  <div className="modal-field">
                    <label htmlFor="precoVenda">Preço Venda</label>
                    <input
                      id="precoVenda"
                      type="text"
                      inputMode="decimal"
                      value={precoVenda}
                      onChange={(e) => handlePrecoVendaChange(e.target.value)}
                      onBlur={() => {
                        const venda = parsePrecoOpcional(precoVenda)
                        if (venda == null) return
                        const arredondado = arredondarPrecoVenda(venda)
                        setPrecoVenda(formatPrecoInput(arredondado))
                        const custo = parsePrecoOpcional(precoCusto)
                        if (custo != null && custo > 0) {
                          setLucroEsperado(lucroPercentualDePrecos(custo, arredondado))
                        }
                      }}
                      placeholder="0,00"
                    />
                    <small className="modal-field-hint">
                      Ajustado para o mais próximo entre ,00 e ,50. Pode ser alterado.
                    </small>
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
                  <label htmlFor="artesao">Fornecedor</label>
                  <select
                    id="artesao"
                    value={artesaoId}
                    onChange={(e) => setArtesaoId(e.target.value)}
                    required
                  >
                    <option value="">Selecione um fornecedor...</option>
                    {artesoes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {rotuloNomeFantasia(a.nome_fantasia, a.razao_social, a.nome)}
                      </option>
                    ))}
                  </select>
                </div>
                </>
                )}
                {abaProduto === 'formacao' && (
                  <div className="formacao-produto">
                    <div className="modal-field">
                      <label htmlFor="precoCustoFormacao">Preço de custo</label>
                      <input
                        id="precoCustoFormacao"
                        type="text"
                        inputMode="decimal"
                        value={precoCusto}
                        onChange={(e) => handlePrecoCustoChange(e.target.value, true)}
                        placeholder="0,00"
                      />
                    </div>
                    {renderAvisoFormacao(formacaoCalc)}
                    {formacaoCalc.ok && (
                      <>
                        {renderLinhasComposicao(formacaoCalc)}
                        <p className="formacao-multiplicador">
                          Multiplicador usado: <strong>{formatarMultiplicador(formacaoCalc.multiplicador)}</strong>
                        </p>
                        {custoInformado == null || partesReais == null ? (
                          <p className="modal-field-hint">Informe o custo para ver o preço de venda.</p>
                        ) : (
                          <>
                            <ul className="formacao-reais">
                              <li><span>CMV</span><strong>{formatarMoeda(partesReais.custo)}</strong></li>
                              <li><span>Imposto</span><strong>{formatarMoeda(partesReais.imposto)}</strong></li>
                              <li><span>Custos</span><strong>{formatarMoeda(partesReais.custos)}</strong></li>
                              <li><span>Investimento</span><strong>{formatarMoeda(partesReais.investimento)}</strong></li>
                              <li><span>Lucro</span><strong>{formatarMoeda(partesReais.lucro)}</strong></li>
                              {partesReais.folga > 0 && (
                                <li><span>Folga</span><strong>{formatarMoeda(partesReais.folga)}</strong></li>
                              )}
                            </ul>
                            <p className="formacao-sugerido">
                              Preço sugerido <strong>{formatarMoeda(vendaSugerida)}</strong>
                            </p>
                            <p className="modal-field-hint">
                              Preço de venda atual: {vendaInformada == null ? '—' : formatarMoeda(vendaInformada)}
                            </p>
                            <button type="button" className="produtos-btn-secondary" onClick={aplicarPrecoFormacao}>
                              Aplicar preço calculado
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
              <button type="submit" className="modal-submit" disabled={salvando}>
                {salvando ? 'Salvando...' : produtoEmEdicao ? 'Salvar Alterações' : 'Salvar Produto'}
              </button>
            </form>
          </div>
        </div>
      )}

      {modalFormacaoAberto && (
        <div className="modal-overlay" onClick={() => !salvandoFormacao && !aplicandoEmTodos && setModalFormacaoAberto(false)}>
          <div className="modal-content modal-formacao" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Formação de Preço</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !salvandoFormacao && !aplicandoEmTodos && setModalFormacaoAberto(false)}
                aria-label="Fechar"
                disabled={salvandoFormacao || aplicandoEmTodos}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSalvarFormacao}>
              <div className="formacao-modal-body">
                <div className="modal-field">
                  <label htmlFor="faturamentoMedio">Faturamento médio mensal</label>
                  <input
                    id="faturamentoMedio"
                    type="text"
                    inputMode="decimal"
                    value={formacaoRascunho.faturamento_medio}
                    onChange={(e) => atualizarRascunhoFormacao('faturamento_medio', e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="despesasFixas">Despesas fixas mensais</label>
                  <input
                    id="despesasFixas"
                    type="text"
                    inputMode="decimal"
                    value={formacaoRascunho.despesas_fixas_mensais}
                    onChange={(e) => atualizarRascunhoFormacao('despesas_fixas_mensais', e.target.value)}
                  />
                </div>
                <div className="formacao-percentuais">
                  <div className="modal-field">
                    <label htmlFor="impostoSimples">Imposto do Simples Nacional (%)</label>
                    <input
                      id="impostoSimples"
                      type="text"
                      inputMode="decimal"
                      value={formacaoRascunho.imposto}
                      onChange={(e) => atualizarRascunhoFormacao('imposto', e.target.value)}
                    />
                  </div>
                  <div className="modal-field">
                    <label htmlFor="investimentoPct">Investimento (%)</label>
                    <input
                      id="investimentoPct"
                      type="text"
                      inputMode="decimal"
                      value={formacaoRascunho.investimento}
                      onChange={(e) => atualizarRascunhoFormacao('investimento', e.target.value)}
                    />
                  </div>
                  <div className="modal-field">
                    <label htmlFor="lucroDesejado">Margem de lucro desejada (%)</label>
                    <input
                      id="lucroDesejado"
                      type="text"
                      inputMode="decimal"
                      value={formacaoRascunho.lucro}
                      onChange={(e) => atualizarRascunhoFormacao('lucro', e.target.value)}
                    />
                  </div>
                </div>
                <label className="formacao-check">
                  <input
                    type="checkbox"
                    checked={formacaoRascunho.usar_folga}
                    onChange={(e) => atualizarRascunhoFormacao('usar_folga', e.target.checked)}
                  />
                  Usar multiplicador {formatarMultiplicador(MULTIPLICADOR_FOLGA)} (folga para despesas eventuais)
                </label>
                {renderAvisoFormacao(formacaoRascunhoCalc)}
                {renderLinhasComposicao(formacaoRascunhoCalc)}
              </div>
              <button
                type="button"
                className="formacao-btn-aplicar"
                onClick={aplicarFormacaoEmTodos}
                disabled={salvandoFormacao || aplicandoEmTodos || !formacaoRascunhoCalc.ok}
              >
                {aplicandoEmTodos ? 'Aplicando...' : 'Aplicar em todos os produtos'}
              </button>
              <button type="submit" className="modal-submit" disabled={salvandoFormacao || aplicandoEmTodos || !formacaoRascunhoCalc.ok}>
                {salvandoFormacao ? 'Salvando...' : 'Salvar'}
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
                <label className="modal-etiquetas-opcao-barras">
                  <input
                    type="checkbox"
                    checked={configEtiquetas.exibirCodigoBarras !== false}
                    onChange={(e) => atualizarConfigEtiquetas({ exibirCodigoBarras: e.target.checked })}
                  />
                  <span>Incluir código de barras</span>
                </label>
                {configEtiquetas.exibirCodigoBarras === false && (
                  <p className="modal-etiquetas-aviso-sem-barras">
                    Sem código de barras: papel 40×40 mm, 2 produtos um acima do outro (20×20 mm cada).
                  </p>
                )}
                <div className="modal-etiquetas-filtros-linha">
                  <label className="modal-etiquetas-filtro-artesao">
                    <span>Fornecedor</span>
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
                          {rotuloNomeFantasia(a.nome_fantasia, a.razao_social, a.nome)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="modal-etiquetas-input-wrapper">
                  <input
                    type="text"
                    placeholder="Nome, nome fantasia ou código de barras"
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
                            <th>Fornecedor</th>
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
                                  <td>{rotuloNomeFantasia(p.artesao_nome_fantasia, p.artesao_razao_social, p.artesao_nome, '—')}</td>
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
            {configEtiquetas.exibirCodigoBarras === false ? (
              <div className="etiquetas-folhas-sem-barras">
                {(() => {
                  const lista = gerarListaEtiquetasParaImpressao()
                  const paginas = []
                  for (let i = 0; i < lista.length; i += 2) paginas.push(lista.slice(i, i + 2))
                  return paginas.map((pagina, pi) => (
                    <div key={`folha-${pi}`} className="etiqueta-papel-40">
                      {pagina.map((produto, i) => (
                        <div
                          key={`${produto.id}-${produto.variacao || ''}-${pi}-${i}`}
                          className="etiqueta-item etiqueta-item--sem-barras"
                        >
                          <div className="etiqueta-nome">{produto.nome}{produto.variacao ? ` (${produto.variacao})` : ''}</div>
                          <div className="etiqueta-codigo-numero">{produto.codigo_barras}</div>
                          <div className="etiqueta-preco">
                            {produto.preco_venda != null
                              ? `R$ ${Number(produto.preco_venda).toFixed(2).replace('.', ',')}`
                              : '-'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                })()}
              </div>
            ) : (
            <div
              className="etiquetas-container"
              style={{
                gridTemplateColumns: `repeat(${configEtiquetas.colunas || 2}, minmax(0, 1fr))`,
              }}
            >
              {gerarListaEtiquetasParaImpressao().map((produto, i) => (
                <div
                  key={`${produto.id}-${produto.variacao || ''}-${i}`}
                  className="etiqueta-item"
                >
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
            )}
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

      {modalRefazerCodigoAberto && produtoEmEdicao && (
        <div
          className="modal-overlay"
          onClick={() => !refazendoCodigo && setModalRefazerCodigoAberto(false)}
        >
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Gerar novo código de barras</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalRefazerCodigoAberto(false)}
                aria-label="Fechar"
                disabled={refazendoCodigo}
              >
                ×
              </button>
            </div>
            <p>
              Será gerado um novo código de barras para{' '}
              <strong>
                {produtoEmEdicao.nome}
                {produtoEmEdicao.variacao ? ` (${produtoEmEdicao.variacao})` : ''}
              </strong>
              . O código atual (<strong>{produtoEmEdicao.codigo_barras}</strong>) deixará de
              funcionar e as etiquetas já impressas precisarão ser refeitas.
            </p>
            <div className="modal-confirm-acoes">
              <button
                type="button"
                className="modal-btn-cancelar"
                onClick={() => setModalRefazerCodigoAberto(false)}
                disabled={refazendoCodigo}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="produtos-btn-primary"
                onClick={handleRefazerCodigoBarras}
                disabled={refazendoCodigo}
              >
                {refazendoCodigo ? 'Gerando...' : 'Gerar novo código'}
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
