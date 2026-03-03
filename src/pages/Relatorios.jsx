import { useState, useEffect } from 'react'
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

const TAB_GERAL = 'geral'
const TAB_ARTESAO = 'artesao'
const TAB_LUCRO = 'lucro'
const TAB_MAIS_VENDIDOS = 'mais_vendidos'

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

export default function Relatorios() {
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
  const [carregando, setCarregando] = useState(false)

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
    if (dataInicio > dataFim) return
    setCarregando(true)
    const api = window.electronAPI
    if (!api) {
      setCarregando(false)
      return
    }

    const promessas = []

    if (aba === TAB_GERAL || aba === TAB_ARTESAO) {
      promessas.push(
        api.obterResumoVendasPeriodo(dataInicio, dataFim, aba === TAB_ARTESAO ? artesaoId : null).then(setResumo),
        api.obterVendasPorDia(dataInicio, dataFim, aba === TAB_ARTESAO ? artesaoId : null).then(r => {
          setVendasPorDia(r || [])
        }),
        api.obterResumoVendasPeriodo(hoje, hoje, aba === TAB_ARTESAO ? artesaoId : null).then(setTotalHoje)
      )
      if (aba === TAB_ARTESAO && artesaoId) {
        promessas.push(api.contarProdutosPorArtesao(artesaoId).then(setProdutosCadastrados))
      } else {
        setProdutosCadastrados(0)
      }
    } else if (aba === TAB_LUCRO) {
      promessas.push(api.obterLucroPeriodo(dataInicio, dataFim).then(setLucro))
    } else if (aba === TAB_MAIS_VENDIDOS) {
      promessas.push(
        api.listarProdutosMaisVendidosPorPeriodoEArtesao(dataInicio, dataFim, artesaoId || null).then(r => {
          setMaisVendidos(r || [])
        })
      )
    }

    Promise.all(promessas)
      .catch(err => console.error(err))
      .finally(() => setCarregando(false))
  }, [aba, dataInicio, dataFim, artesaoId, hoje])

  const dadosGrafico = vendasPorDia.map(d => ({
    data: formatarDataCurta(d.data),
    valor: d.valor_total ?? 0,
    fullData: d.data,
  }))

  async function handleExportarRelatorioArtesao() {
    if (dataInicio > dataFim) {
      alert('A data início deve ser anterior ou igual à data fim.')
      return
    }
    try {
      const rel = await window.electronAPI.obterRelatorioCustoVendasPeriodo(
        dataInicio,
        dataFim,
        artesaoId ?? null
      )
      const { totalVendas, totalCusto, produtos } = rel
      const artesaoNome = artesaoId ? artesoes.find(a => a.id === artesaoId)?.nome : 'Todos os artesãos'

      const doc = new jsPDF()
      const margin = 20
      let y = 20

      doc.setFontSize(18)
      doc.text('Relatório de Vendas e Custos', margin, y)
      y += 10

      doc.setFontSize(11)
      doc.setTextColor(80, 80, 80)
      const periodoTexto =
        dataInicio === dataFim
          ? `Data: ${formatarDataParaExibir(dataInicio)}`
          : `Período: ${formatarDataParaExibir(dataInicio)} a ${formatarDataParaExibir(dataFim)}`
      doc.text(periodoTexto, margin, y)
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
      const base64 = doc.output('datauristring').split(',')[1]
      const result = await window.electronAPI.salvarRelatorioPDF(base64, filename)
      if (result?.canceled) return
      if (!result?.ok) alert('Erro ao salvar PDF.')
    } catch (err) {
      console.error(err)
      alert('Erro ao gerar relatório.')
    }
  }

  const tabs = [
    { id: TAB_GERAL, label: 'Vendas Geral' },
    { id: TAB_ARTESAO, label: 'Por Artesão' },
    { id: TAB_LUCRO, label: 'Lucro' },
    { id: TAB_MAIS_VENDIDOS, label: 'Mais Vendidos' },
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
          {(aba === TAB_ARTESAO || aba === TAB_MAIS_VENDIDOS) && (
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
          {aba === TAB_ARTESAO && (
            <div className="relatorios-field relatorios-field-export">
              <label>&nbsp;</label>
              <button
                type="button"
                className="relatorios-btn-exportar"
                onClick={handleExportarRelatorioArtesao}
                disabled={carregando}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Exportar PDF
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
              <div className="relatorios-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dadosGrafico} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="relGradGeral" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#212121" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#212121" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={v => `R$${v}`} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val) => [formatBRL(val), 'Vendas']}
                      labelFormatter={l => `Data: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="valor"
                      stroke="#212121"
                      strokeWidth={2}
                      fill="url(#relGradGeral)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
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
              <div className="relatorios-chart">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={dadosGrafico} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="relGradArtesao" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#212121" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#212121" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                    <YAxis tickFormatter={v => `R$${v}`} tick={{ fontSize: 12 }} />
                    <Tooltip
                      formatter={(val) => [formatBRL(val), 'Vendas']}
                      labelFormatter={l => `Data: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="valor"
                      stroke="#212121"
                      strokeWidth={2}
                      fill="url(#relGradArtesao)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
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
    </div>
  )
}
