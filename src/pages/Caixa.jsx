import { useState, useEffect, useMemo, useRef } from 'react'
import { recoverInputFocus } from '../utils/focusRecovery'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import ProdutoSearchModal from '../components/ProdutoSearchModal'

function formatBRL(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val ?? 0)
}

const TZ_BRASILIA = 'America/Sao_Paulo'

const LABEL_PAGAMENTO = {
  credito: 'Cartão de Crédito',
  debito: 'Cartão de Débito',
  pix: 'PIX',
  dinheiro: 'Dinheiro',
}

const FORMAS_PAGAMENTO_ORDEM = ['dinheiro', 'pix', 'credito', 'debito']

const CAIXA_FILTROS_STORAGE_KEY = 'gestordesk-caixa-filtros-v1'

function formatHora(dataStr) {
  if (!dataStr) return '--:--'
  const d = new Date(dataStr)
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ_BRASILIA,
  })
}

function formatDataHoraCaixa(dataStr) {
  if (!dataStr) return '--'
  const d = new Date(dataStr)
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ_BRASILIA,
  })
}

function hojeISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ_BRASILIA })
}

function formatarDataParaExibir(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TZ_BRASILIA,
  })
}

function nomeProdutoRotulo(produto) {
  const n = (produto?.nome || '').trim()
  const v = (produto?.variacao || '').trim()
  return v ? `${n} (${v})` : n
}

function filtrosCaixaPadrao(dataIso) {
  return {
    periodoDe: dataIso,
    periodoAte: dataIso,
    formaPagamentoFiltro: '',
    modoBuscaProduto: null,
  }
}

function montarTotaisPorForma(totaisDb) {
  const totaisPorForma = {}
  for (const forma of FORMAS_PAGAMENTO_ORDEM) {
    const row = totaisDb.find((r) => r.forma_pagamento === forma) || { total: 0, qtd_transacoes: 0 }
    totaisPorForma[forma] = {
      total: row.total || 0,
      qtd: row.qtd_transacoes || 0,
    }
  }
  return totaisPorForma
}

function readInitialCaixaFiltros() {
  const hoje = hojeISO()
  try {
    const raw = sessionStorage.getItem(CAIXA_FILTROS_STORAGE_KEY)
    if (!raw) {
      return filtrosCaixaPadrao(hoje)
    }
    const o = JSON.parse(raw)
    if (!o || typeof o !== 'object') {
      return filtrosCaixaPadrao(hoje)
    }
    let periodoDe = o.periodoDe
    let periodoAte = o.periodoAte
    const formaPagamentoFiltro =
      typeof o.formaPagamentoFiltro === 'string' ? o.formaPagamentoFiltro : ''
    let modoBuscaProduto = null
    if (
      o.modoBuscaProduto &&
      typeof o.modoBuscaProduto.produtoId === 'number' &&
      typeof o.modoBuscaProduto.label === 'string'
    ) {
      modoBuscaProduto = {
        produtoId: o.modoBuscaProduto.produtoId,
        label: o.modoBuscaProduto.label,
      }
    }
    const iso = /^\d{4}-\d{2}-\d{2}$/
    if (!iso.test(periodoDe)) periodoDe = hoje
    if (!iso.test(periodoAte)) periodoAte = hoje
    if (periodoDe > hoje) periodoDe = hoje
    if (periodoAte > hoje) periodoAte = hoje
    if (periodoDe > periodoAte) periodoAte = periodoDe
    const formaOk =
      !formaPagamentoFiltro || FORMAS_PAGAMENTO_ORDEM.includes(formaPagamentoFiltro)
        ? formaPagamentoFiltro
        : ''
    return { periodoDe, periodoAte, formaPagamentoFiltro: formaOk, modoBuscaProduto }
  } catch {
    return filtrosCaixaPadrao(hoje)
  }
}

function IconeFormaPagamentoCaixa({ forma }) {
  if (forma === 'credito' || forma === 'debito') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
        <line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    )
  }
  if (forma === 'pix') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
      </svg>
    )
  }
  if (forma === 'dinheiro') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    )
  }
  return null
}

export default function Caixa() {
  const navigate = useNavigate()
  const hoje = hojeISO()

  const [filtrosIniciais] = useState(() => readInitialCaixaFiltros())

  const [transacoes, setTransacoes] = useState([])
  const [periodoDe, setPeriodoDe] = useState(filtrosIniciais.periodoDe)
  const [periodoAte, setPeriodoAte] = useState(filtrosIniciais.periodoAte)

  const [modalFiltroPeriodoAberto, setModalFiltroPeriodoAberto] = useState(false)
  const [filtroDraftDe, setFiltroDraftDe] = useState(filtrosIniciais.periodoDe)
  const [filtroDraftAte, setFiltroDraftAte] = useState(filtrosIniciais.periodoAte)

  const [formaPagamentoFiltro, setFormaPagamentoFiltro] = useState(filtrosIniciais.formaPagamentoFiltro)

  const [modalExportarAberto, setModalExportarAberto] = useState(false)
  const [exportarDataDe, setExportarDataDe] = useState(hoje)
  const [exportarDataAte, setExportarDataAte] = useState(hoje)
  const [previewPdf, setPreviewPdf] = useState(null)
  const [previewGerando, setPreviewGerando] = useState(false)

  const [modalLocalizarVendaAberto, setModalLocalizarVendaAberto] = useState(false)
  const [modoBuscaProduto, setModoBuscaProduto] = useState(filtrosIniciais.modoBuscaProduto)

  useEffect(() => {
    try {
      sessionStorage.setItem(
        CAIXA_FILTROS_STORAGE_KEY,
        JSON.stringify({
          periodoDe,
          periodoAte,
          formaPagamentoFiltro,
          modoBuscaProduto,
        })
      )
    } catch (err) {
      console.error(err)
    }
  }, [periodoDe, periodoAte, formaPagamentoFiltro, modoBuscaProduto])

  const periodoUmDia = periodoDe === periodoAte
  const colunasTabela = modoBuscaProduto ? 7 : 6
  const mostrarBotaoHoje = periodoDe !== hoje || periodoAte !== hoje
  const rotuloPeriodoFiltro = periodoUmDia
    ? formatarDataParaExibir(periodoDe)
    : `${formatarDataParaExibir(periodoDe)} a ${formatarDataParaExibir(periodoAte)}`

  useEffect(() => {
    let cancelled = false
    async function carregar() {
      try {
        const api = window.electronAPI
        if (!api) {
          if (!cancelled) setTransacoes([])
          return
        }
        const pagamentos = modoBuscaProduto?.produtoId
          ? await api.listarPagamentosCaixaPorPeriodoEProduto(
              periodoDe,
              periodoAte,
              modoBuscaProduto.produtoId
            )
          : await api.listarPagamentosCaixaPorPeriodo(periodoDe, periodoAte)
        if (!cancelled) setTransacoes(pagamentos ?? [])
      } catch (err) {
        console.error(err)
        if (!cancelled) setTransacoes([])
      }
    }
    carregar()
    return () => {
      cancelled = true
    }
  }, [periodoDe, periodoAte, modoBuscaProduto?.produtoId])

  useEffect(() => {
    return () => {
      if (previewPdf?.blobUrl) URL.revokeObjectURL(previewPdf.blobUrl)
    }
  }, [previewPdf?.blobUrl])

  const anyCaixaModalOpen =
    modalFiltroPeriodoAberto ||
    modalExportarAberto ||
    modalLocalizarVendaAberto ||
    Boolean(previewPdf)
  const prevCaixaModal = useRef(false)
  useEffect(() => {
    if (prevCaixaModal.current && !anyCaixaModalOpen) {
      queueMicrotask(() => recoverInputFocus())
    }
    prevCaixaModal.current = anyCaixaModalOpen
  }, [anyCaixaModalOpen])

  const transacoesVisiveis = useMemo(() => {
    if (!formaPagamentoFiltro || !FORMAS_PAGAMENTO_ORDEM.includes(formaPagamentoFiltro)) {
      return transacoes
    }
    return transacoes.filter((transacao) => transacao.forma_pagamento === formaPagamentoFiltro)
  }, [transacoes, formaPagamentoFiltro])

  const totalFiltrado = transacoesVisiveis.reduce((acc, transacao) => acc + (transacao.valor || 0), 0)

  function irParaHoje() {
    setPeriodoDe(hoje)
    setPeriodoAte(hoje)
  }

  function abrirModalFiltroPeriodo() {
    setFiltroDraftDe(periodoDe)
    setFiltroDraftAte(periodoAte)
    setModalFiltroPeriodoAberto(true)
  }

  function aplicarFiltroPeriodo() {
    if (filtroDraftDe > filtroDraftAte) {
      alert('A data "De" deve ser anterior ou igual à data "Até".')
      return
    }
    setPeriodoDe(filtroDraftDe)
    setPeriodoAte(filtroDraftAte)
    setModalFiltroPeriodoAberto(false)
  }

  function abrirVendaNoPdvParaEdicao(vendaId) {
    navigate('/app/pdv', { state: { editarVendaId: vendaId } })
  }

  async function handleExcluirVenda(pagamento) {
    const msg = `Tem certeza que deseja excluir a venda #${String(pagamento.venda_id).padStart(4, '0')} de ${formatBRL(pagamento.valor_total)}? O estoque dos produtos será devolvido.`
    if (!confirm(msg)) return
    try {
      await window.electronAPI.excluirVenda(pagamento.venda_id)
      setTransacoes((prev) => prev.filter((transacao) => transacao.venda_id !== pagamento.venda_id))
    } catch (err) {
      console.error(err)
      alert('Erro ao excluir venda.')
    }
  }

  function abrirModalExportar() {
    setExportarDataDe(periodoDe)
    setExportarDataAte(periodoAte)
    setModalExportarAberto(true)
  }

  function limparBuscaPorProduto() {
    setModoBuscaProduto(null)
  }

  function aoSelecionarProdutoLocalizar(produto) {
    setModoBuscaProduto({ produtoId: produto.id, label: nomeProdutoRotulo(produto) })
    setModalLocalizarVendaAberto(false)
  }

  async function montarDocumentoRelatorioCaixa(dataDe, dataAte, filtroFormaPagamento = null) {
    if (!window.electronAPI) return null
    if (dataDe > dataAte) {
      alert('A data "De" deve ser anterior ou igual à data "Até".')
      return null
    }

    const filtroForma =
      filtroFormaPagamento && FORMAS_PAGAMENTO_ORDEM.includes(filtroFormaPagamento)
        ? filtroFormaPagamento
        : null
    const formasNoRelatorio = filtroForma ? [filtroForma] : FORMAS_PAGAMENTO_ORDEM

    let vendas = []
    let totaisDb = []
    try {
      vendas = await window.electronAPI.listarVendasPorPeriodo(dataDe, dataAte)
      totaisDb = await window.electronAPI.obterTotaisPagamentosPorPeriodo(dataDe, dataAte)
    } catch (err) {
      console.error(err)
      alert('Erro ao carregar vendas.')
      return null
    }

    const totaisPorForma = montarTotaisPorForma(totaisDb)
    let totalGeral = 0
    for (const forma of formasNoRelatorio) {
      totalGeral += totaisPorForma[forma].total
    }

    const doc = new jsPDF()
    const margin = 20
    let y = 20

    doc.setFontSize(18)
    doc.text('Relatório de Caixa', margin, y)
    y += 10

    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    const periodoTexto =
      dataDe === dataAte
        ? `Data: ${formatarDataParaExibir(dataDe)}`
        : `Período: ${formatarDataParaExibir(dataDe)} a ${formatarDataParaExibir(dataAte)}`
    doc.text(periodoTexto, margin, y)
    y += 8
    if (filtroForma) {
      doc.text(`Forma de pagamento: ${LABEL_PAGAMENTO[filtroForma]}`, margin, y)
      y += 8
    }
    y += 7

    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    doc.text(
      filtroForma ? 'Resumo da forma de pagamento' : 'Totais por forma de pagamento',
      margin,
      y
    )
    y += 10

    doc.setFontSize(10)
    for (const forma of formasNoRelatorio) {
      const { total, qtd } = totaisPorForma[forma]
      const label = LABEL_PAGAMENTO[forma]
      doc.text(`${label}:`, margin, y)
      doc.text(formatBRL(total), 120, y)
      doc.text(`(${qtd} transações)`, 160, y)
      y += 8
    }

    y += 5
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Total geral:', margin, y)
    doc.text(formatBRL(totalGeral), 120, y)
    doc.setFont('helvetica', 'normal')
    y += 8
    doc.setFontSize(10)
    const qtdTransacoesRodape = filtroForma ? totaisPorForma[filtroForma].qtd : vendas.length
    doc.text(`Total de ${qtdTransacoesRodape} transação(ões)`, margin, y)

    const sufixoForma = filtroForma ? `-${filtroForma}` : ''
    const filename =
      dataDe === dataAte
        ? `relatorio-caixa${sufixoForma}-${dataDe}.pdf`
        : `relatorio-caixa${sufixoForma}-${dataDe}-a-${dataAte}.pdf`
    return { doc, filename }
  }

  async function handleExportarRelatorio() {
    const built = await montarDocumentoRelatorioCaixa(
      exportarDataDe,
      exportarDataAte,
      formaPagamentoFiltro || null
    )
    if (!built) return

    const { doc, filename } = built
    const base64 = doc.output('datauristring').split(',')[1]
    try {
      const result = await window.electronAPI.salvarRelatorioPDF(base64, filename)
      if (!result?.canceled && result?.ok) {
        setModalExportarAberto(false)
      }
    } catch (err) {
      console.error('[Caixa] Erro ao exportar relatório PDF:', err)
    } finally {
      queueMicrotask(() => recoverInputFocus())
    }
  }

  function fecharPreviewPdf() {
    setPreviewPdf((prev) => {
      if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl)
      return null
    })
    queueMicrotask(() => recoverInputFocus())
  }

  async function handleVisualizarRelatorio() {
    if (!window.electronAPI) return

    setPreviewGerando(true)
    try {
      const built = await montarDocumentoRelatorioCaixa(
        exportarDataDe,
        exportarDataAte,
        formaPagamentoFiltro || null
      )
      if (!built) return

      const { doc, filename } = built
      const base64 = doc.output('datauristring').split(',')[1]
      const blob = doc.output('blob')
      const blobUrl = URL.createObjectURL(blob)

      setPreviewPdf((prev) => {
        if (prev?.blobUrl) URL.revokeObjectURL(prev.blobUrl)
        return {
          blobUrl,
          base64,
          filename,
          titulo: 'Relatório de Caixa',
        }
      })
      setModalExportarAberto(false)
    } catch (err) {
      console.error('[Caixa] Erro ao visualizar relatório PDF:', err)
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
      console.error('[Caixa] Erro ao salvar PDF (preview):', err)
      alert('Erro ao salvar PDF.')
    } finally {
      queueMicrotask(() => recoverInputFocus())
    }
  }

  return (
    <div className="caixa">
      <div className="caixa-header">
        <div className="caixa-header-left">
          <h2 className="dashboard-heading">Caixa</h2>
        </div>

        <div className="caixa-filtros caixa-filtros-principal">
          {mostrarBotaoHoje && (
            <button type="button" className="caixa-btn-hoje" onClick={irParaHoje}>
              Hoje
            </button>
          )}
          <div className="caixa-input-data-wrapper">
            <svg className="caixa-input-data-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <button
              type="button"
              className="caixa-input-data caixa-btn-filtro-periodo"
              onClick={abrirModalFiltroPeriodo}
              aria-haspopup="dialog"
            >
              Filtrar por período
            </button>
          </div>
          <div className="caixa-field-forma-pagamento">
            <label htmlFor="caixa-forma-pagamento" className="caixa-filtro-label">
              Forma de pagamento
            </label>
            <select
              id="caixa-forma-pagamento"
              className="caixa-select-pagamento"
              value={formaPagamentoFiltro}
              onChange={(e) => setFormaPagamentoFiltro(e.target.value)}
            >
              <option value="">Todas</option>
              {FORMAS_PAGAMENTO_ORDEM.map((forma) => (
                <option key={forma} value={forma}>
                  {LABEL_PAGAMENTO[forma]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="caixa-header-acoes">
          <button
            type="button"
            className="caixa-export-btn"
            onClick={() => setModalLocalizarVendaAberto(true)}
          >
            <svg className="caixa-export-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>Localizar venda</span>
          </button>
          <button type="button" className="caixa-export-btn" onClick={abrirModalExportar}>
            <svg className="caixa-export-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Exportar Relatório</span>
          </button>
        </div>
      </div>

      {modoBuscaProduto && (
        <div className="caixa-alerta-produto">
          <span className="caixa-alerta-produto-texto">
            Vendas que incluem <strong>{modoBuscaProduto.label}</strong>
            {' · '}
            Período: <strong>{rotuloPeriodoFiltro}</strong>
            <span className="caixa-alerta-produto-hint"> (mesmo de Filtrar por período)</span>
          </span>
          <button type="button" className="caixa-alerta-produto-limpar" onClick={limparBuscaPorProduto}>
            Limpar
          </button>
        </div>
      )}

      <div className="caixa-cards">
        <div className="caixa-card caixa-card-total">
          <span className="caixa-card-label">{periodoUmDia ? 'Total do dia' : 'Total do período'}</span>
          <span className="caixa-card-value">{formatBRL(totalFiltrado)}</span>
        </div>
      </div>

      <section className="caixa-transacoes">
        <h3 className="caixa-transacoes-title">Transações</h3>
        <div className="caixa-table-wrapper">
          <table className="caixa-transacoes-table">
            <thead>
              <tr>
                <th>{periodoUmDia ? 'Hora' : 'Data e hora'}</th>
                <th>ID Venda</th>
                <th>Itens</th>
                {modoBuscaProduto && <th>Qtd. produto</th>}
                <th>Pagamento</th>
                <th>Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {transacoes.length === 0 ? (
                <tr>
                  <td colSpan={colunasTabela} className="caixa-empty">
                    {modoBuscaProduto
                      ? 'Nenhuma venda com este produto no período selecionado.'
                      : 'Nenhuma transação encontrada'}
                  </td>
                </tr>
              ) : transacoesVisiveis.length === 0 ? (
                <tr>
                  <td colSpan={colunasTabela} className="caixa-empty">
                    Nenhuma transação com esta forma de pagamento no período
                  </td>
                </tr>
              ) : (
                transacoesVisiveis.map((transacao) => (
                  <tr key={`${transacao.venda_id}-${transacao.sequencia}`}>
                    <td>{periodoUmDia ? formatHora(transacao.data) : formatDataHoraCaixa(transacao.data)}</td>
                    <td>#{String(transacao.venda_id).padStart(4, '0')}/{transacao.sequencia}</td>
                    <td title={transacao.itens_resumo || undefined}>{transacao.qtd_itens ?? 0} itens</td>
                    {modoBuscaProduto && (
                      <td>{transacao.qtd_produto_filtrado != null ? transacao.qtd_produto_filtrado : '—'}</td>
                    )}
                    <td>
                      <span className="caixa-pagamento-badge">
                        <IconeFormaPagamentoCaixa forma={transacao.forma_pagamento} />
                        {LABEL_PAGAMENTO[transacao.forma_pagamento] ?? transacao.forma_pagamento}
                      </span>
                    </td>
                    <td>{formatBRL(transacao.valor)}</td>
                    <td>
                      <div className="caixa-acoes-cell">
                        {transacao.sequencia === 1 && (
                          <button
                            type="button"
                            className="caixa-btn-editar"
                            onClick={() => abrirVendaNoPdvParaEdicao(transacao.venda_id)}
                            title="Editar venda no PDV"
                            aria-label="Editar venda no PDV"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Editar
                          </button>
                        )}
                        <button
                          type="button"
                          className="caixa-btn-excluir"
                          onClick={() => handleExcluirVenda(transacao)}
                          title="Excluir venda"
                          aria-label="Excluir venda"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalFiltroPeriodoAberto && (
        <div className="modal-overlay" onClick={() => setModalFiltroPeriodoAberto(false)}>
          <div className="modal-content modal-exportar-relatorio" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Filtrar por período</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setModalFiltroPeriodoAberto(false)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-exportar-desc">Escolha o período das transações:</p>
              <div className="modal-exportar-dates">
                <div className="modal-exportar-field">
                  <label htmlFor="caixa-filtro-de">De</label>
                  <input
                    id="caixa-filtro-de"
                    type="date"
                    value={filtroDraftDe}
                    max={hoje}
                    onChange={(e) => setFiltroDraftDe(e.target.value)}
                  />
                </div>
                <div className="modal-exportar-field">
                  <label htmlFor="caixa-filtro-ate">Até</label>
                  <input
                    id="caixa-filtro-ate"
                    type="date"
                    value={filtroDraftAte}
                    max={hoje}
                    onChange={(e) => setFiltroDraftAte(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-exportar-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setModalFiltroPeriodoAberto(false)}>
                Cancelar
              </button>
              <button type="button" className="modal-submit" onClick={aplicarFiltroPeriodo}>
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalExportarAberto && (
        <div className="modal-overlay" onClick={() => setModalExportarAberto(false)}>
          <div className="modal-content modal-exportar-relatorio" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Exportar Relatório</h3>
              <button type="button" className="modal-close" onClick={() => setModalExportarAberto(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-exportar-desc">Escolha o período para o relatório:</p>
              <div className="modal-exportar-dates">
                <div className="modal-exportar-field">
                  <label htmlFor="exportar-de">De</label>
                  <input
                    id="exportar-de"
                    type="date"
                    value={exportarDataDe}
                    max={hoje}
                    onChange={(e) => setExportarDataDe(e.target.value)}
                  />
                </div>
                <div className="modal-exportar-field">
                  <label htmlFor="exportar-ate">Até</label>
                  <input
                    id="exportar-ate"
                    type="date"
                    value={exportarDataAte}
                    max={hoje}
                    onChange={(e) => setExportarDataAte(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-exportar-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setModalExportarAberto(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="modal-btn-cancelar modal-btn-visualizar-pdf"
                onClick={handleVisualizarRelatorio}
                disabled={previewGerando}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Visualizar PDF
              </button>
              <button
                type="button"
                className="modal-submit"
                onClick={handleExportarRelatorio}
                disabled={previewGerando}
              >
                Exportar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      <ProdutoSearchModal
        open={modalLocalizarVendaAberto}
        onClose={() => {
          setModalLocalizarVendaAberto(false)
          queueMicrotask(() => recoverInputFocus())
        }}
        onSelect={aoSelecionarProdutoLocalizar}
        apenasComEstoque={false}
        titulo="Localizar venda por produto"
      />

      {previewPdf && (
        <div className="modal-overlay" onClick={fecharPreviewPdf}>
          <div
            className="modal-content modal-relatorio-pdf-preview"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="caixa-pdf-preview-title"
          >
            <div className="modal-header">
              <h3 id="caixa-pdf-preview-title">{previewPdf.titulo}</h3>
              <button type="button" className="modal-close" onClick={fecharPreviewPdf} aria-label="Fechar">
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
