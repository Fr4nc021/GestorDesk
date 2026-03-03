import { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'

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

function formatHora(dataStr) {
  if (!dataStr) return '--:--'
  const d = new Date(dataStr)
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ_BRASILIA,
  })
}

function hojeISO() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: TZ_BRASILIA })
}

export default function Caixa() {
  const [transacoes, setTransacoes] = useState([])
  const [filtroPagamento, setFiltroPagamento] = useState('todos')
  const [dataSelecionada, setDataSelecionada] = useState(hojeISO)
  const [modalExportarAberto, setModalExportarAberto] = useState(false)
  const [exportarDataDe, setExportarDataDe] = useState(hojeISO())
  const [exportarDataAte, setExportarDataAte] = useState(hojeISO())

  const hoje = hojeISO()
  const ehHoje = dataSelecionada === hoje

  useEffect(() => {
    async function carregar() {
      try {
        const vendas = await window.electronAPI.listarVendasPorData(dataSelecionada)
        setTransacoes(vendas)
      } catch (err) {
        console.error(err)
      }
    }
    carregar()
  }, [dataSelecionada])

  const transacoesFiltradas = filtroPagamento === 'todos'
    ? transacoes
    : transacoes.filter(t => t.forma_pagamento === filtroPagamento)

  const totalFiltrado = transacoesFiltradas.reduce((acc, t) => acc + (t.valor_total || 0), 0)

  const dataFormatada = new Date(dataSelecionada + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TZ_BRASILIA,
  })

  async function handleExcluirVenda(venda) {
    const msg = `Tem certeza que deseja excluir a venda #${String(venda.id).padStart(4, '0')} de ${formatBRL(venda.valor_total)}? O estoque dos produtos será devolvido.`
    if (!confirm(msg)) return
    try {
      await window.electronAPI.excluirVenda(venda.id)
      setTransacoes(prev => prev.filter(t => t.id !== venda.id))
    } catch (err) {
      console.error(err)
      alert('Erro ao excluir venda.')
    }
  }

  function abrirModalExportar() {
    setExportarDataDe(dataSelecionada)
    setExportarDataAte(dataSelecionada)
    setModalExportarAberto(true)
  }

  function formatarDataParaExibir(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: TZ_BRASILIA,
    })
  }

  async function handleExportarRelatorio() {
    const dataDe = exportarDataDe
    const dataAte = exportarDataAte
    if (dataDe > dataAte) {
      alert('A data "De" deve ser anterior ou igual à data "Até".')
      return
    }

    let vendas = []
    try {
      vendas = await window.electronAPI.listarVendasPorPeriodo(dataDe, dataAte)
    } catch (err) {
      console.error(err)
      alert('Erro ao carregar vendas.')
      return
    }

    const formas = ['dinheiro', 'pix', 'credito', 'debito']
    const totaisPorForma = {}
    let totalGeral = 0
    for (const fp of formas) {
      const porForma = vendas.filter(t => t.forma_pagamento === fp)
      const total = porForma.reduce((acc, t) => acc + (t.valor_total || 0), 0)
      totaisPorForma[fp] = { total, qtd: porForma.length }
      totalGeral += total
    }

    const doc = new jsPDF()
    const margin = 20
    let y = 20

    doc.setFontSize(18)
    doc.text('Relatório de Caixa', margin, y)
    y += 10

    doc.setFontSize(11)
    doc.setTextColor(80, 80, 80)
    const periodoTexto = dataDe === dataAte
      ? `Data: ${formatarDataParaExibir(dataDe)}`
      : `Período: ${formatarDataParaExibir(dataDe)} a ${formatarDataParaExibir(dataAte)}`
    doc.text(periodoTexto, margin, y)
    y += 15

    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    doc.text('Totais por forma de pagamento', margin, y)
    y += 10

    doc.setFontSize(10)
    for (const fp of formas) {
      const { total, qtd } = totaisPorForma[fp]
      const label = LABEL_PAGAMENTO[fp]
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
    doc.text(`Total de ${vendas.length} transação(ões)`, margin, y)

    const filename = dataDe === dataAte
      ? `relatorio-caixa-${dataDe}.pdf`
      : `relatorio-caixa-${dataDe}-a-${dataAte}.pdf`
    const base64 = doc.output('datauristring').split(',')[1]
    try {
      const result = await window.electronAPI.salvarRelatorioPDF(base64, filename)
      if (!result?.canceled && result?.ok) {
        setModalExportarAberto(false)
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="caixa">
      <div className="caixa-header">
        <div className="caixa-header-left">
          <h2 className="dashboard-heading">Caixa</h2>
          <p className="dashboard-subtitle">
            {ehHoje ? `Movimento de hoje — ${dataFormatada}` : `Movimento do dia ${dataFormatada}`}
          </p>
        </div>

        <div className="caixa-filtros">
          {!ehHoje && (
            <button
              type="button"
              className="caixa-btn-hoje"
              onClick={() => setDataSelecionada(hoje)}
            >
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
            <input
              type="date"
              className="caixa-input-data"
              value={dataSelecionada}
              max={hoje}
              onChange={e => setDataSelecionada(e.target.value)}
            />
          </div>
          <select
            className="caixa-select-pagamento"
            value={filtroPagamento}
            onChange={e => setFiltroPagamento(e.target.value)}
          >
            <option value="todos">Todos os pagamentos</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="pix">PIX</option>
            <option value="credito">Cartão de Crédito</option>
            <option value="debito">Cartão de Débito</option>
          </select>
        </div>

        <button type="button" className="caixa-export-btn" onClick={abrirModalExportar}>
          <svg className="caixa-export-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Exportar Relatório</span>
        </button>
      </div>

      <div className="caixa-cards">
        <div className="caixa-card caixa-card-total">
          <span className="caixa-card-label">
            {filtroPagamento === 'todos' ? 'Total do Dia' : `Total — ${LABEL_PAGAMENTO[filtroPagamento]}`}
          </span>
          <span className="caixa-card-value">{formatBRL(totalFiltrado)}</span>
        </div>
      </div>

      <section className="caixa-transacoes">
        <h3 className="caixa-transacoes-title">Transações</h3>
        <div className="caixa-table-wrapper">
          <table className="caixa-transacoes-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>ID Venda</th>
                <th>Itens</th>
                <th>Pagamento</th>
                <th>Total</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {transacoesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="caixa-empty">Nenhuma transação encontrada</td>
                </tr>
              ) : (
                transacoesFiltradas.map((t) => (
                  <tr key={t.id}>
                    <td>{formatHora(t.data)}</td>
                    <td>#{String(t.id).padStart(4, '0')}</td>
                    <td>{t.qtd_itens ?? 0} itens</td>
                    <td>
                      <span className="caixa-pagamento-badge">
                        {t.forma_pagamento === 'credito' && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                            <line x1="1" y1="10" x2="23" y2="10" />
                          </svg>
                        )}
                        {t.forma_pagamento === 'debito' && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                            <line x1="1" y1="10" x2="23" y2="10" />
                          </svg>
                        )}
                        {t.forma_pagamento === 'pix' && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                          </svg>
                        )}
                        {t.forma_pagamento === 'dinheiro' && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        )}
                        {LABEL_PAGAMENTO[t.forma_pagamento] ?? t.forma_pagamento}
                      </span>
                    </td>
                    <td>{formatBRL(t.valor_total)}</td>
                    <td>
                      <button
                        type="button"
                        className="caixa-btn-excluir"
                        onClick={() => handleExcluirVenda(t)}
                        title="Excluir venda"
                        aria-label="Excluir venda"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {modalExportarAberto && (
        <div className="modal-overlay" onClick={() => setModalExportarAberto(false)}>
          <div className="modal-content modal-exportar-relatorio" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Exportar Relatório</h3>
              <button type="button" className="modal-close" onClick={() => setModalExportarAberto(false)} aria-label="Fechar">×</button>
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
                    onChange={e => setExportarDataDe(e.target.value)}
                  />
                </div>
                <div className="modal-exportar-field">
                  <label htmlFor="exportar-ate">Até</label>
                  <input
                    id="exportar-ate"
                    type="date"
                    value={exportarDataAte}
                    max={hoje}
                    onChange={e => setExportarDataAte(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="modal-exportar-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setModalExportarAberto(false)}>Cancelar</button>
              <button type="button" className="modal-submit" onClick={handleExportarRelatorio}>Exportar PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
