import { useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts'

const TZ_BRASILIA = 'America/Sao_Paulo'

function formatBRL(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val ?? 0)
}

function hojeISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ_BRASILIA })
}

function formatarDataCurta(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    timeZone: TZ_BRASILIA,
  })
}

function formatarDataParaExibir(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TZ_BRASILIA,
  })
}

function textoPeriodoRelatorioPdf(dataInicioStr, dataFimStr) {
  if (dataInicioStr === dataFimStr) {
    return `Data: ${formatarDataParaExibir(dataInicioStr)}`
  }
  return `Período: ${formatarDataParaExibir(dataInicioStr)} a ${formatarDataParaExibir(dataFimStr)}`
}

function formatDataHoraVendaLista(dataStr) {
  if (!dataStr) return '—'
  const d = new Date(dataStr)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    timeZone: TZ_BRASILIA,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function nomeProdutoRelatorio(p) {
  const n = (p?.nome || '').trim()
  const v = (p?.variacao || '').trim()
  return v ? `${n} (${v})` : n
}

const TAB_GERAL = 'geral'
const TAB_ARTESAO = 'artesao'
const TAB_LUCRO = 'lucro'
const TAB_MAIS_VENDIDOS = 'mais_vendidos'
const TAB_PRODUTOS = 'produtos'

const PREVIEW_TITULOS_PDF = {
  geral: 'Relatório de Vendas — Visão geral',
  lucro: 'Relatório de Lucro',
  mais_vendidos: 'Produtos mais vendidos',
  artesao: 'Vendas e custos por artesão',
  produtos: 'Produtos — estoque e custo',
}

const SESSION_RELATORIOS_RESTORE = 'gestordesk_relatorios_restore'

function obterScrollLayoutMain() {
  if (typeof document === 'undefined') return 0
  const el = document.querySelector('.layout-main')
  return el ? el.scrollTop : window.scrollY
}

function restaurarScrollLayoutMain(y) {
  if (typeof y !== 'number') return
  const el = typeof document !== 'undefined' ? document.querySelector('.layout-main') : null
  if (el) el.scrollTop = y
  else window.scrollTo(0, y)
}

function CardMetrica({ label, value, subtext, icon }) {
  return (
    <div className="rel-card">
      {icon && <span className="rel-card-icon">{icon}</span>}
      <div className="rel-card-content">
        <span className="rel-card-value">{value}</span>
        <span className="rel-card-label">{label}</span>
        {subtext && <span className="rel-card-sub">{subtext}</span>}
      </div>
    </div>
  )
}

function GraficoVendasPorDiaRelatorio({ dadosGrafico, gradientId }) {
  return (
    <div className="relatorios-chart">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={dadosGrafico} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#212121" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#212121" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="data" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={v => `R$${v}`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={val => [formatBRL(val), 'Vendas']} labelFormatter={l => `Data: ${l}`} />
          <Area
            type="monotone"
            dataKey="valor"
            stroke="#212121"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Relatorios() {
  const navigate = useNavigate()
  const hoje = hojeISO()
  const [aba, setAba] = useState(TAB_GERAL)
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toLocaleDateString('sv-SE', { timeZone: TZ_BRASILIA })
  })
  const [dataFim, setDataFim] = useState(hoje)
  const [artesaoId, setArtesaoId] = useState(null)

  const [artesoes, setArtesoes] = useState([])
  const [resumo, setResumo] = useState(null)
  const [vendasPorDia, setVendasPorDia] = useState([])
  const [totalHoje, setTotalHoje] = useState(null)
  const [lucro, setLucro] = useState(null)
  const [maisVendidos, setMaisVendidos] = useState([])
  const [produtosCadastrados, setProdutosCadastrados] = useState(0)
  const [produtosRelatorio, setProdutosRelatorio] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [previewPdf, setPreviewPdf] = useState(null)
  const [previewGerando, setPreviewGerando] = useState(false)

  const [modalVendasArtesaoAberto, setModalVendasArtesaoAberto] = useState(false)
  const [vendasArtesaoLista, setVendasArtesaoLista] = useState([])
  const [vendasArtesaoCarregando, setVendasArtesaoCarregando] = useState(false)

  const carregarListaVendasModalArtesao = useCallback(async (inicioPeriodo, fimPeriodo, idArtesao) => {
    if (!window.electronAPI?.listarVendasPorPeriodoEArtesao) return
    setVendasArtesaoCarregando(true)
    setVendasArtesaoLista([])
    try {
      const lista = await window.electronAPI.listarVendasPorPeriodoEArtesao(
        inicioPeriodo,
        fimPeriodo,
        idArtesao
      )
      setVendasArtesaoLista(lista || [])
    } catch (err) {
      console.error(err)
      alert('Erro ao carregar vendas.')
    } finally {
      setVendasArtesaoCarregando(false)
    }
  }, [])

  useLayoutEffect(() => {
    let raw
    try {
      raw = sessionStorage.getItem(SESSION_RELATORIOS_RESTORE)
    } catch {
      return
    }
    if (!raw) return
    let data
    try {
      data = JSON.parse(raw)
    } catch {
      try {
        sessionStorage.removeItem(SESSION_RELATORIOS_RESTORE)
      } catch {
        void 0
      }
      return
    }
    try {
      sessionStorage.removeItem(SESSION_RELATORIOS_RESTORE)
    } catch {
      void 0
    }
    if (data.aba) setAba(data.aba)
    if (data.dataInicio) setDataInicio(data.dataInicio)
    if (data.dataFim) setDataFim(data.dataFim)
    if ('artesaoId' in data) setArtesaoId(data.artesaoId ?? null)
    if (data.reabrirModalVendas) {
      setModalVendasArtesaoAberto(true)
      void carregarListaVendasModalArtesao(data.dataInicio, data.dataFim, data.artesaoId ?? null)
    }
    const sy = data.scrollY
    if (typeof sy === 'number') {
      requestAnimationFrame(() => restaurarScrollLayoutMain(sy))
    }
  }, [carregarListaVendasModalArtesao])

  async function abrirModalVendasArtesao() {
    if (dataInicio > dataFim) {
      alert('A data início deve ser anterior ou igual à data fim.')
      return
    }
    if (!window.electronAPI?.listarVendasPorPeriodoEArtesao) return
    setModalVendasArtesaoAberto(true)
    await carregarListaVendasModalArtesao(dataInicio, dataFim, artesaoId)
  }

  function fecharModalVendasArtesao() {
    setModalVendasArtesaoAberto(false)
  }

  function localizarVendaNoPdv(vendaId) {
    const payload = {
      aba,
      dataInicio,
      dataFim,
      artesaoId,
      reabrirModalVendas: true,
      scrollY: obterScrollLayoutMain(),
    }
    try {
      sessionStorage.setItem(SESSION_RELATORIOS_RESTORE, JSON.stringify(payload))
    } catch {
      void 0
    }
    navigate('/app/pdv', {
      state: { editarVendaId: vendaId, relatoriosRestore: payload },
    })
  }

  useEffect(() => {
    async function carregarArtesoes() {
      try {
        const lista = await window.electronAPI.listarArtesoes()
        setArtesoes(lista || [])
      } catch (err) {
        console.error(err)
      }
    }
    carregarArtesoes()
  }, [])

  useEffect(() => {
    if (aba !== TAB_PRODUTOS && dataInicio > dataFim) return

    async function carregarDadosDaAba() {
      setCarregando(true)
      const api = window.electronAPI
      if (!api) {
        setCarregando(false)
        return
      }

      const promessasCarregamento = []

      if (aba === TAB_GERAL || aba === TAB_ARTESAO) {
        const filtroArtesao = aba === TAB_ARTESAO ? artesaoId : null
        promessasCarregamento.push(
          api.obterResumoVendasPeriodo(dataInicio, dataFim, filtroArtesao).then(setResumo),
          api.obterVendasPorDia(dataInicio, dataFim, filtroArtesao).then(vendasDia => {
            setVendasPorDia(vendasDia || [])
          }),
          api.obterResumoVendasPeriodo(hoje, hoje, filtroArtesao).then(setTotalHoje)
        )
        if (aba === TAB_ARTESAO && artesaoId) {
          promessasCarregamento.push(api.contarProdutosPorArtesao(artesaoId).then(setProdutosCadastrados))
        } else {
          setProdutosCadastrados(0)
        }
      } else if (aba === TAB_LUCRO) {
        promessasCarregamento.push(api.obterLucroPeriodo(dataInicio, dataFim).then(setLucro))
      } else if (aba === TAB_MAIS_VENDIDOS) {
        promessasCarregamento.push(
          api.listarProdutosMaisVendidosPorPeriodoEArtesao(dataInicio, dataFim, artesaoId || null).then(
            ranking => {
              setMaisVendidos(ranking || [])
            }
          )
        )
      } else if (aba === TAB_PRODUTOS) {
        promessasCarregamento.push(
          api.listarProdutos().then(lista => {
            const todos = lista || []
            setProdutosRelatorio(
              artesaoId ? todos.filter(p => p.artesao_id === artesaoId) : todos
            )
          })
        )
      }

      try {
        await Promise.all(promessasCarregamento)
      } catch (err) {
        console.error(err)
      } finally {
        setCarregando(false)
      }
    }

    void carregarDadosDaAba()
  }, [aba, dataInicio, dataFim, artesaoId, hoje])

  const dadosGrafico = vendasPorDia.map(d => ({
    data: formatarDataCurta(d.data),
    valor: d.valor_total ?? 0,
  }))

  function buildRelatorioGeralDoc() {
    const doc = new jsPDF()
    const margin = 20
    let y = 20

    doc.setFontSize(18)
    doc.text('Relatório de Vendas - Visão Geral', margin, y)
    y += 10

    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text(textoPeriodoRelatorioPdf(dataInicio, dataFim), margin, y)
    y += 15

    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Resumo do Período', margin, y)
    y += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`Total em vendas: ${formatBRL(resumo?.totalVendas)}`, margin, y)
    y += 6
    doc.text(`Quantidade de vendas: ${resumo?.qtdVendas ?? 0}`, margin, y)
    y += 6
    doc.text(`Itens vendidos: ${resumo?.qtdItens ?? 0}`, margin, y)
    y += 6
    doc.text(`Ticket médio: ${formatBRL(resumo?.ticketMedio)}`, margin, y)
    y += 10

    doc.setFont('helvetica', 'bold')
    doc.text('Vendas de Hoje', margin, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.text(`Total em vendas hoje: ${formatBRL(totalHoje?.totalVendas)}`, margin, y)
    y += 6
    doc.text(`Quantidade de vendas hoje: ${totalHoje?.qtdVendas ?? 0}`, margin, y)
    y += 12

    doc.setFont('helvetica', 'bold')
    doc.text('Vendas por Dia', margin, y)
    y += 8

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Data', margin, y)
    doc.text('Total vendido', 80, y)
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setDrawColor(220, 220, 220)
    doc.line(margin, y - 2, 190, y - 2)
    y += 2

    if (dadosGrafico.length === 0) {
      doc.setFontSize(10)
      doc.text('Nenhuma venda no período.', margin, y)
    } else {
      for (const d of dadosGrafico) {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        doc.setFontSize(9)
        doc.text(d.data, margin, y)
        doc.text(formatBRL(d.valor), 80, y)
        y += 6
      }
    }

    const filename =
      dataInicio === dataFim
        ? `relatorio-vendas-geral-${dataInicio}.pdf`
        : `relatorio-vendas-geral-${dataInicio}-a-${dataFim}.pdf`
    return { doc, filename }
  }

  async function buildRelatorioLucroDoc() {
    const rel = await window.electronAPI.obterRelatorioCustoVendasPeriodo(dataInicio, dataFim, null)
    const produtos = rel?.produtos ?? []

    const doc = new jsPDF()
    const margin = 20
    let y = 20

    doc.setFontSize(18)
    doc.text('Relatório de Lucro', margin, y)
    y += 10

    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text(textoPeriodoRelatorioPdf(dataInicio, dataFim), margin, y)
    y += 15

    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Resumo do Lucro', margin, y)
    y += 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(`Lucro no período: ${formatBRL(lucro?.lucro)}`, margin, y)
    y += 6
    doc.text(`Total em vendas: ${formatBRL(lucro?.totalVendas)}`, margin, y)
    y += 6
    doc.text(`Total de custo: ${formatBRL(lucro?.totalCusto)}`, margin, y)
    y += 6
    doc.text(`Itens vendidos: ${lucro?.qtdItens ?? 0}`, margin, y)
    y += 12

    doc.setFont('helvetica', 'bold')
    doc.text('Fórmula utilizada', margin, y)
    y += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(
      'Lucro = (Preço venda - Preço custo) × quantidade, somado para todos os itens vendidos no período.',
      margin,
      y,
      { maxWidth: 170 }
    )
    y += 18

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Detalhamento por produto', margin, y)
    y += 10

    if (produtos.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text('Nenhum item vendido no período para detalhar.', margin, y)
    } else {
      const col = { produto: 20, custo: 90, venda: 120, lucro: 155 }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Produto', col.produto, y)
      doc.text('Custo total', col.custo, y)
      doc.text('Venda total', col.venda, y)
      doc.text('Lucro', col.lucro, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setDrawColor(220, 220, 220)
      doc.line(margin, y - 2, 190, y - 2)
      y += 2

      for (const p of produtos) {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        const totalCustoProduto = p.total_custo_produto ?? 0
        const totalVendaProduto = p.total_venda_produto ?? 0
        const lucroProduto = totalVendaProduto - totalCustoProduto

        doc.setFontSize(9)
        const nomeProduto = (p.nome || '').substring(0, 40)
        doc.text(nomeProduto, col.produto, y)
        doc.text(formatBRL(totalCustoProduto), col.custo, y)
        doc.text(formatBRL(totalVendaProduto), col.venda, y)
        doc.text(formatBRL(lucroProduto), col.lucro, y)
        y += 6
      }
    }

    const filename =
      dataInicio === dataFim
        ? `relatorio-lucro-${dataInicio}.pdf`
        : `relatorio-lucro-${dataInicio}-a-${dataFim}.pdf`
    return { doc, filename }
  }

  function buildRelatorioMaisVendidosDoc() {
    const doc = new jsPDF()
    const margin = 20
    let y = 20

    const artesaoNome = artesaoId ? artesoes.find(a => a.id === artesaoId)?.nome : 'Todos os artesãos'

    doc.setFontSize(18)
    doc.text('Relatório de Produtos Mais Vendidos', margin, y)
    y += 10

    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text(textoPeriodoRelatorioPdf(dataInicio, dataFim), margin, y)
    y += 6
    doc.text(`Filtro de artesão: ${artesaoNome}`, margin, y)
    y += 15

    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Ranking de Produtos', margin, y)
    y += 8

    if (maisVendidos.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text('Nenhuma venda no período para gerar o ranking.', margin, y)
    } else {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      const colStart = { pos: 20, produto: 30, variacao: 95, artesao: 120, qtd: 170 }
      doc.text('#', colStart.pos, y)
      doc.text('Produto', colStart.produto, y)
      doc.text('Var.', colStart.variacao, y)
      doc.text('Artesão', colStart.artesao, y)
      doc.text('Qtd', colStart.qtd, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setDrawColor(220, 220, 220)
      doc.line(margin, y - 2, 190, y - 2)
      y += 2

      for (const [idx, item] of maisVendidos.entries()) {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        doc.setFontSize(9)
        doc.text(String(idx + 1), colStart.pos, y)
        doc.text((item.nome || '').substring(0, 35), colStart.produto, y)
        doc.text(item.variacao || '—', colStart.variacao, y)
        doc.text((item.artesao_nome || '—').substring(0, 12), colStart.artesao, y)
        doc.text(String(item.total_vendido), colStart.qtd, y)
        y += 6
      }
    }

    const filename =
      dataInicio === dataFim
        ? `relatorio-mais-vendidos-${dataInicio}.pdf`
        : `relatorio-mais-vendidos-${dataInicio}-a-${dataFim}.pdf`
    return { doc, filename }
  }

  async function buildRelatorioArtesaoDoc() {
    const rel = await window.electronAPI.obterRelatorioCustoVendasPeriodo(
      dataInicio,
      dataFim,
      artesaoId ?? null
    )
    const { totalCusto, produtos } = rel
    const artesaoNome = artesaoId ? artesoes.find(a => a.id === artesaoId)?.nome : 'Todos os artesãos'

    const doc = new jsPDF()
    const margin = 20
    let y = 20

    doc.setFontSize(18)
    doc.text('Relatório de Vendas e Custos', margin, y)
    y += 10

    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text(textoPeriodoRelatorioPdf(dataInicio, dataFim), margin, y)
    y += 6
    doc.text(`Filtro: ${artesaoNome}`, margin, y)
    y += 15

    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.text('Totais do Período', margin, y)
    y += 10
    doc.text('Total vendido:', margin, y)
    doc.text(formatBRL(totalCusto), 80, y)
    y += 15

    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Produtos Vendidos', margin, y)
    y += 10

    if (produtos.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text('Nenhum produto vendido no período.', margin, y)
    } else {
      const colStart = { produto: 20, variacao: 75, artesao: 95, custoUnit: 125, qtd: 148, total: 165 }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Produto', colStart.produto, y)
      doc.text('Var.', colStart.variacao, y)
      doc.text('Artesão', colStart.artesao, y)
      doc.text('Custo un.', colStart.custoUnit, y)
      doc.text('Qtd', colStart.qtd, y)
      doc.text('Total', colStart.total, y)
      y += 7

      doc.setFont('helvetica', 'normal')
      doc.setDrawColor(220, 220, 220)
      doc.line(margin, y - 2, 190, y - 2)
      y += 2

      for (const p of produtos) {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        doc.setFontSize(9)
        const nome = (p.nome || '').substring(0, 22)
        doc.text(nome, colStart.produto, y)
        doc.text(p.variacao || '—', colStart.variacao, y)
        doc.text((p.artesao_nome || '').substring(0, 10), colStart.artesao, y)
        doc.text(formatBRL(p.preco_custo), colStart.custoUnit, y)
        doc.text(String(p.total_vendido), colStart.qtd, y)
        doc.text(formatBRL(p.total_custo_produto), colStart.total, y)
        y += 7
      }

      y += 4
      doc.setDrawColor(180, 180, 180)
      doc.line(margin, y, 190, y)
      y += 8
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text('Total a pagar ao Artesão:', margin, y)
      doc.text(formatBRL(totalCusto), colStart.total, y)
    }

    const filename =
      dataInicio === dataFim
        ? `relatorio-vendas-custo-${dataInicio}.pdf`
        : `relatorio-vendas-custo-${dataInicio}-a-${dataFim}.pdf`
    return { doc, filename }
  }

  function buildRelatorioProdutosDoc() {
    const doc = new jsPDF()
    const margin = 20
    let y = 20

    const artesaoNome = artesaoId ? artesoes.find(a => a.id === artesaoId)?.nome : 'Todos os artesãos'

    doc.setFontSize(18)
    doc.text('Relatório de Produtos — Estoque e custo', margin, y)
    y += 10

    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    doc.text(`Gerado em: ${formatarDataParaExibir(hoje)}`, margin, y)
    y += 6
    doc.text(`Filtro: ${artesaoNome}`, margin, y)
    y += 15

    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Estoque e preço de custo por produto', margin, y)
    y += 8

    if (produtosRelatorio.length === 0) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.text('Nenhum produto encontrado.', margin, y)
    } else {
      const col = { produto: 20, estoque: 140, custo: 165 }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.text('Produto', col.produto, y)
      doc.text('Estoque', col.estoque, y)
      doc.text('Preço custo', col.custo, y)
      y += 6

      doc.setFont('helvetica', 'normal')
      doc.setDrawColor(220, 220, 220)
      doc.line(margin, y - 2, 190, y - 2)
      y += 2

      for (const p of produtosRelatorio) {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        doc.setFontSize(9)
        doc.text(nomeProdutoRelatorio(p).substring(0, 85), col.produto, y)
        doc.text(String(p.estoque ?? 0), col.estoque, y)
        doc.text(formatBRL(p.preco_custo), col.custo, y)
        y += 6
      }
    }

    const sufixo = artesaoId ? `-artesao-${artesaoId}` : ''
    const filename = `relatorio-produtos${sufixo}-${hoje}.pdf`
    return { doc, filename }
  }

  const fecharPreviewPdf = useCallback(() => {
    setPreviewPdf(prev => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl)
      return null
    })
  }, [])

  async function gerarEAbrirPreview(tipo) {
    if (tipo !== 'produtos' && dataInicio > dataFim) {
      alert('A data início deve ser anterior ou igual à data fim.')
      return
    }
    if (!window.electronAPI) return

    setPreviewGerando(true)
    try {
      let doc
      let filename

      switch (tipo) {
        case 'geral': {
          ;({ doc, filename } = buildRelatorioGeralDoc())
          break
        }
        case 'lucro': {
          ;({ doc, filename } = await buildRelatorioLucroDoc())
          break
        }
        case 'mais_vendidos': {
          ;({ doc, filename } = buildRelatorioMaisVendidosDoc())
          break
        }
        case 'artesao': {
          ;({ doc, filename } = await buildRelatorioArtesaoDoc())
          break
        }
        case 'produtos': {
          ;({ doc, filename } = buildRelatorioProdutosDoc())
          break
        }
        default:
          return
      }

      const titulo = PREVIEW_TITULOS_PDF[tipo]

      const base64 = doc.output('datauristring').split(',')[1]
      const blob = doc.output('blob')
      const blobUrl = URL.createObjectURL(blob)

      setPreviewPdf(prev => {
        if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl)
        return { blobUrl, base64, filename, titulo }
      })
    } catch (err) {
      console.error(err)
      alert('Erro ao gerar relatório.')
    } finally {
      setPreviewGerando(false)
    }
  }

  async function handleSalvarPreviewPdf() {
    if (!previewPdf || !window.electronAPI) return
    try {
      const result = await window.electronAPI.salvarRelatorioPDF(previewPdf.base64, previewPdf.filename)
      if (result?.canceled) return
      if (!result?.ok) alert('Erro ao salvar PDF.')
      else fecharPreviewPdf()
    } catch (err) {
      console.error(err)
      alert('Erro ao salvar PDF.')
    }
  }

  useEffect(() => {
    return () => {
      if (previewPdf?.blobUrl) URL.revokeObjectURL(previewPdf.blobUrl)
    }
  }, [previewPdf?.blobUrl])

  const tabs = [
    { id: TAB_GERAL, label: 'Vendas Geral' },
    { id: TAB_ARTESAO, label: 'Por Artesão' },
    { id: TAB_LUCRO, label: 'Lucro' },
    { id: TAB_MAIS_VENDIDOS, label: 'Mais Vendidos' },
    { id: TAB_PRODUTOS, label: 'Produtos' },
  ]

  return (
    <div className="relatorios">
      <header className="relatorios-header">
        <div>
          <h2 className="dashboard-heading">Relatórios</h2>
          <p className="dashboard-subtitle">Análise completa de vendas, lucros e desempenho</p>
        </div>
      </header>

      <div className="relatorios-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            className={`relatorios-tab ${aba === t.id ? 'active' : ''}`}
            onClick={() => setAba(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="relatorios-filtros">
        <div className="relatorios-filtros-row">
          {aba !== TAB_PRODUTOS && (
            <>
              <div className="relatorios-field">
                <label htmlFor="rel-data-inicio">Data Início</label>
                <input
                  id="rel-data-inicio"
                  type="date"
                  value={dataInicio}
                  max={hoje}
                  onChange={e => setDataInicio(e.target.value)}
                />
              </div>
              <div className="relatorios-field">
                <label htmlFor="rel-data-fim">Data Fim</label>
                <input
                  id="rel-data-fim"
                  type="date"
                  value={dataFim}
                  max={hoje}
                  onChange={e => setDataFim(e.target.value)}
                />
              </div>
            </>
          )}
          {(aba === TAB_ARTESAO || aba === TAB_MAIS_VENDIDOS || aba === TAB_PRODUTOS) && (
            <div className="relatorios-field relatorios-field-wide">
              <label htmlFor="rel-artesao">Artesão</label>
              <select
                id="rel-artesao"
                value={artesaoId ?? ''}
                onChange={e => setArtesaoId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Todos os artesãos</option>
                {artesoes.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          {aba === TAB_GERAL && (
            <div className="relatorios-field relatorios-field-export">
              <label>&nbsp;</label>
              <button
                type="button"
                className="relatorios-btn-exportar"
                onClick={() => gerarEAbrirPreview('geral')}
                disabled={carregando || previewGerando}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Visualizar PDF
              </button>
            </div>
          )}
          {aba === TAB_LUCRO && (
            <div className="relatorios-field relatorios-field-export">
              <label>&nbsp;</label>
              <button
                type="button"
                className="relatorios-btn-exportar"
                onClick={() => gerarEAbrirPreview('lucro')}
                disabled={carregando || previewGerando}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Visualizar PDF
              </button>
            </div>
          )}
          {aba === TAB_MAIS_VENDIDOS && (
            <div className="relatorios-field relatorios-field-export">
              <label>&nbsp;</label>
              <button
                type="button"
                className="relatorios-btn-exportar"
                onClick={() => gerarEAbrirPreview('mais_vendidos')}
                disabled={carregando || previewGerando}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Visualizar PDF
              </button>
            </div>
          )}
          {aba === TAB_ARTESAO && (
            <div className="relatorios-field relatorios-field-export">
              <label>&nbsp;</label>
              <div className="relatorios-field-export-actions">
                <button
                  type="button"
                  className="relatorios-btn-exportar relatorios-btn-exportar-secundario"
                  onClick={abrirModalVendasArtesao}
                  disabled={carregando || previewGerando || vendasArtesaoCarregando}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Ver vendas
                </button>
                <button
                  type="button"
                  className="relatorios-btn-exportar"
                  onClick={() => gerarEAbrirPreview('artesao')}
                  disabled={carregando || previewGerando}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Visualizar PDF
                </button>
              </div>
            </div>
          )}
          {aba === TAB_PRODUTOS && (
            <div className="relatorios-field relatorios-field-export">
              <label>&nbsp;</label>
              <button
                type="button"
                className="relatorios-btn-exportar"
                onClick={() => gerarEAbrirPreview('produtos')}
                disabled={carregando || previewGerando}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Visualizar PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {carregando && (
        <div className="relatorios-loading">
          <span>Carregando...</span>
        </div>
      )}

      {!carregando && aba === TAB_GERAL && (
        <>
          <div className="relatorios-cards">
            <CardMetrica
              label="Total em Vendas"
              value={formatBRL(resumo?.totalVendas)}
              subtext={`${resumo?.qtdVendas ?? 0} venda(s) no período`}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />
            <CardMetrica
              label="Itens Vendidos"
              value={resumo?.qtdItens ?? 0}
              subtext="unidades no período"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
              }
            />
            <CardMetrica
              label="Ticket Médio"
              value={formatBRL(resumo?.ticketMedio)}
              subtext="por venda"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              }
            />
            <CardMetrica
              label="Vendas Hoje"
              value={formatBRL(totalHoje?.totalVendas)}
              subtext={`${totalHoje?.qtdVendas ?? 0} venda(s) hoje`}
            />
          </div>
          <section className="relatorios-grafico">
            <h3>Vendas por Dia</h3>
            {dadosGrafico.length === 0 ? (
              <div className="relatorios-grafico-empty">
                <div className="relatorios-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 3v18h18" />
                    <path d="M18 17V9" />
                    <path d="M13 17V5" />
                    <path d="M8 17v-3" />
                  </svg>
                </div>
                <p>Nenhuma venda no período</p>
                <span>O gráfico será exibido quando houver vendas</span>
              </div>
            ) : (
              <GraficoVendasPorDiaRelatorio dadosGrafico={dadosGrafico} gradientId="relGradGeral" />
            )}
          </section>
        </>
      )}

      {!carregando && aba === TAB_ARTESAO && (
        <>
          <div className="relatorios-cards">
            <CardMetrica
              label="Total em Vendas"
              value={formatBRL(resumo?.totalVendas)}
              subtext={artesaoId ? artesoes.find(a => a.id === artesaoId)?.nome : 'Todos os artesãos'}
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />
            <CardMetrica
              label="Itens Vendidos"
              value={resumo?.qtdItens ?? 0}
              subtext="unidades no período"
            />
            <CardMetrica
              label="Ticket Médio"
              value={formatBRL(resumo?.ticketMedio)}
              subtext="por venda"
            />
            {artesaoId && (
              <CardMetrica
                label="Produtos Cadastrados"
                value={produtosCadastrados}
                subtext="deste artesão"
              />
            )}
            <CardMetrica
              label="Vendas Hoje"
              value={formatBRL(totalHoje?.totalVendas)}
              subtext={`${totalHoje?.qtdVendas ?? 0} venda(s) hoje`}
            />
          </div>
          <section className="relatorios-grafico">
            <h3>Vendas por Dia</h3>
            {dadosGrafico.length === 0 ? (
              <div className="relatorios-grafico-empty">
                <div className="relatorios-empty-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M3 3v18h18" />
                    <path d="M18 17V9" />
                    <path d="M13 17V5" />
                    <path d="M8 17v-3" />
                  </svg>
                </div>
                <p>Nenhuma venda no período</p>
                <span>O gráfico será exibido quando houver vendas</span>
              </div>
            ) : (
              <GraficoVendasPorDiaRelatorio dadosGrafico={dadosGrafico} gradientId="relGradArtesao" />
            )}
          </section>
        </>
      )}

      {!carregando && aba === TAB_LUCRO && (
        <div className="relatorios-lucro">
          <div className="relatorios-cards relatorios-cards-lucro">
            <CardMetrica
              label="Lucro no Período"
              value={formatBRL(lucro?.lucro)}
              subtext="(Preço venda - Preço custo) × quantidade"
              icon={
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              }
            />
            <CardMetrica
              label="Total em Vendas"
              value={formatBRL(lucro?.totalVendas)}
              subtext="Faturamento do período"
            />
            <CardMetrica
              label="Total de Custo"
              value={formatBRL(lucro?.totalCusto)}
              subtext="Custo dos produtos vendidos"
            />
            <CardMetrica
              label="Itens Vendidos"
              value={lucro?.qtdItens ?? 0}
              subtext="unidades no período"
            />
          </div>
          <p className="relatorios-lucro-formula">
            Fórmula: Lucro = (Preço venda - Preço custo) × quantidade, somado para todos os itens vendidos no período.
          </p>
        </div>
      )}

      {!carregando && aba === TAB_MAIS_VENDIDOS && (
        <section className="relatorios-mais-vendidos">
          <h3>Ranking de Produtos</h3>
          {maisVendidos.length === 0 ? (
            <div className="relatorios-empty">
              <div className="relatorios-empty-icon relatorios-empty-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <p>Nenhuma venda no período</p>
              <span>Realize vendas para ver o ranking de produtos</span>
            </div>
          ) : (
            <div className="relatorios-table-wrapper">
              <table className="relatorios-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Produto</th>
                    <th>Variação</th>
                    <th>Artesão</th>
                    <th>Qtd. Vendida</th>
                  </tr>
                </thead>
                <tbody>
                  {maisVendidos.map((item, idx) => (
                    <tr key={item.id}>
                      <td>{idx + 1}</td>
                      <td>{item.nome}</td>
                      <td>{item.variacao || '—'}</td>
                      <td>{item.artesao_nome || '—'}</td>
                      <td>{item.total_vendido}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!carregando && aba === TAB_PRODUTOS && (
        <section className="relatorios-mais-vendidos">
          <h3>Produtos — estoque e preço de custo</h3>
          {produtosRelatorio.length === 0 ? (
            <div className="relatorios-empty">
              <div className="relatorios-empty-icon relatorios-empty-icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <p>Nenhum produto encontrado</p>
              <span>
                {artesaoId
                  ? 'Não há produtos cadastrados para o artesão selecionado.'
                  : 'Cadastre produtos para visualizar o relatório.'}
              </span>
            </div>
          ) : (
            <div className="relatorios-table-wrapper">
              <table className="relatorios-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Estoque</th>
                    <th>Preço de custo</th>
                  </tr>
                </thead>
                <tbody>
                  {produtosRelatorio.map((p) => (
                    <tr key={p.id}>
                      <td>{nomeProdutoRelatorio(p)}</td>
                      <td>{p.estoque ?? 0}</td>
                      <td>{formatBRL(p.preco_custo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {modalVendasArtesaoAberto && (
        <div className="modal-overlay" onClick={fecharModalVendasArtesao}>
          <div
            className="modal-content modal-relatorio-vendas-artesao"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="relatorio-vendas-artesao-titulo"
          >
            <div className="modal-header">
              <h3 id="relatorio-vendas-artesao-titulo">Vendas do período</h3>
              <button
                type="button"
                className="modal-close"
                onClick={fecharModalVendasArtesao}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <p className="relatorio-vendas-artesao-desc">
              {textoPeriodoRelatorioPdf(dataInicio, dataFim)}
              {' · '}
              Filtro:{' '}
              {artesaoId ? artesoes.find(a => a.id === artesaoId)?.nome || 'Artesão' : 'Todos os artesãos'}
            </p>
            {vendasArtesaoCarregando ? (
              <p className="relatorio-vendas-artesao-loading">Carregando...</p>
            ) : vendasArtesaoLista.length === 0 ? (
              <p className="relatorio-vendas-artesao-vazio">Nenhuma venda encontrada neste período.</p>
            ) : (
              <div className="relatorios-table-wrapper relatorio-vendas-artesao-tabela-wrap">
                <table className="relatorios-table">
                  <thead>
                    <tr>
                      <th>Venda</th>
                      <th>Data</th>
                      <th>Total</th>
                      <th>Itens</th>
                      <th aria-label="Ação" />
                    </tr>
                  </thead>
                  <tbody>
                    {vendasArtesaoLista.map(v => (
                      <tr key={v.id}>
                        <td>#{String(v.id).padStart(4, '0')}</td>
                        <td>{formatDataHoraVendaLista(v.data)}</td>
                        <td>{formatBRL(v.valor_total)}</td>
                        <td className="relatorio-vendas-artesao-itens" title={v.itens_resumo || ''}>
                          {v.itens_resumo || '—'}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="relatorio-vendas-artesao-localizar"
                            onClick={() => localizarVendaNoPdv(v.id)}
                          >
                            Localizar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="relatorio-vendas-artesao-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={fecharModalVendasArtesao}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {previewPdf && (
        <div className="modal-overlay" onClick={fecharPreviewPdf}>
          <div
            className="modal-content modal-relatorio-pdf-preview"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="relatorio-pdf-preview-title"
          >
            <div className="modal-header">
              <h3 id="relatorio-pdf-preview-title">{previewPdf.titulo}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={fecharPreviewPdf}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <p className="relatorio-pdf-preview-hint">
              Confira o conteúdo abaixo e use <strong>Salvar PDF</strong> para escolher onde exportar o arquivo.
            </p>
            <iframe
              title="Pré-visualização do relatório em PDF"
              src={previewPdf.blobUrl}
              className="relatorio-pdf-preview-frame"
            />
            <div className="relatorio-pdf-preview-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={fecharPreviewPdf}>
                Fechar
              </button>
              <button type="button" className="modal-submit" onClick={handleSalvarPreviewPdf}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Salvar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
