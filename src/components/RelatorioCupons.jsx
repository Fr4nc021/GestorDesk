import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import { formatarMoeda } from '../utils/formacaoPreco'
import { mensagemErro } from '../utils/erros'
import { formatarCnpj } from '../utils/fiscal'

const FORMAS = [
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'credito', label: 'Cartão de crédito' },
  { id: 'debito', label: 'Cartão de débito' },
  { id: 'pix', label: 'Pix' },
]

const nomeForma = (id) => FORMAS.find((f) => f.id === id)?.label || id

/** "AAAA-MM-DD HH:MM:SS" (hora local) para "DD/MM/AAAA HH:MM". */
function formatarEmissao(texto) {
  const m = String(texto || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : texto || '—'
}

function formaDeRecebimento(pagamentos) {
  if (pagamentos.length === 0) return '—'
  if (pagamentos.length === 1) return nomeForma(pagamentos[0].forma)
  return pagamentos.map((p) => `${nomeForma(p.forma)} ${formatarMoeda(p.valor)}`).join(' + ')
}

/** "AAAA-MM-DD" para "DD/MM/AAAA". */
function formatarDataIso(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || ''
}

/**
 * Monta o PDF com a relação de cupons do período: título, loja, período, tabela (com quebra de página e
 * cabeçalho repetido) e, ao final, total autorizado, quantidade e total por forma de recebimento.
 */
function montarPdfCupons({ cupons, autorizados, total, totalPorForma, dataInicio, dataFim, loja }) {
  const doc = new jsPDF()
  const margin = 20
  const larguraPagina = doc.internal.pageSize.getWidth()
  const alturaPagina = doc.internal.pageSize.getHeight()
  const fimLinha = larguraPagina - margin
  const limiteY = alturaPagina - 20
  const alturaLinha = 5
  const col = { numero: margin, emissao: 52, valorDir: 112, forma: 117, situacao: 168 }
  const larguraForma = col.situacao - col.forma - 3
  let y = 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(18)
  doc.setTextColor(0, 0, 0)
  doc.text('Relação de cupons fiscais', margin, y)
  y += 9

  doc.setFontSize(11)
  doc.setTextColor(80, 80, 80)
  const nomeLoja = (loja?.razao_social || loja?.nome_fantasia || '').trim()
  if (nomeLoja || loja?.cnpj) {
    const partes = [nomeLoja, loja?.cnpj ? `CNPJ ${formatarCnpj(loja.cnpj)}` : ''].filter(Boolean)
    doc.text(partes.join(' - '), margin, y)
    y += 6
  }
  doc.text(`Período: ${formatarDataIso(dataInicio)} a ${formatarDataIso(dataFim)}`, margin, y)
  y += 12

  function desenharCabecalhoTabela() {
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Cupom nº', col.numero, y)
    doc.text('Data de emissão', col.emissao, y)
    doc.text('Valor', col.valorDir, y, { align: 'right' })
    doc.text('Forma de recebimento', col.forma, y)
    doc.text('Situação', col.situacao, y)
    y += 2
    doc.setDrawColor(180, 180, 180)
    doc.line(margin, y, fimLinha, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
  }

  desenharCabecalhoTabela()

  for (const c of cupons) {
    const cancelado = c.status === 'cancelado'
    doc.setFontSize(9)
    const linhasForma = doc.splitTextToSize(formaDeRecebimento(c.pagamentos || []), larguraForma)
    const alturaRegistro = Math.max(1, linhasForma.length) * alturaLinha + 1
    if (y + alturaRegistro - alturaLinha > limiteY) {
      doc.addPage()
      y = 20
      desenharCabecalhoTabela()
    }
    if (cancelado) doc.setTextColor(150, 150, 150)
    else doc.setTextColor(0, 0, 0)
    doc.text(`${c.numero}${c.serie ? ` / ${c.serie}` : ''}`, col.numero, y)
    doc.text(formatarEmissao(c.emitido_em), col.emissao, y)
    doc.text(formatarMoeda(c.valor_total), col.valorDir, y, { align: 'right' })
    doc.text(linhasForma, col.forma, y)
    doc.text(cancelado ? 'Cancelado' : 'Autorizado', col.situacao, y)
    y += alturaRegistro
  }

  const alturaResumo = 24 + totalPorForma.length * 6 + (totalPorForma.length ? 6 : 0)
  if (y + alturaResumo > limiteY) {
    doc.addPage()
    y = 24
  }
  doc.setTextColor(0, 0, 0)
  doc.setDrawColor(180, 180, 180)
  doc.line(margin, y - 3, fimLinha, y - 3)
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Total autorizado:', margin, y)
  doc.text(formatarMoeda(total), col.valorDir, y, { align: 'right' })
  y += 6
  doc.setFont('helvetica', 'normal')
  const qtdCancelados = cupons.length - autorizados.length
  doc.text(
    `Quantidade de cupons: ${cupons.length} (${autorizados.length} autorizado(s)` +
      `${qtdCancelados ? `, ${qtdCancelados} cancelado(s) não somado(s)` : ''})`,
    margin,
    y
  )
  y += 9
  if (totalPorForma.length) {
    doc.setFont('helvetica', 'bold')
    doc.text('Total por forma de recebimento', margin, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    for (const f of totalPorForma) {
      doc.text(f.label, margin, y)
      doc.text(formatarMoeda(f.valor), col.valorDir, y, { align: 'right' })
      y += 6
    }
  }

  const totalPaginas = doc.getNumberOfPages()
  const geradoEm = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(120, 120, 120)
    doc.text(`Gerado em ${geradoEm}`, margin, alturaPagina - 10)
    doc.text(`Página ${i} de ${totalPaginas}`, fimLinha, alturaPagina - 10, { align: 'right' })
  }

  const filename =
    dataInicio === dataFim ? `relacao-cupons-${dataInicio}.pdf` : `relacao-cupons-${dataInicio}-a-${dataFim}.pdf`
  return { doc, filename }
}

/** Aba Fiscal > Cupons: relação dos cupons (NFC-e) do período, com exportação para planilha. */
export default function RelatorioCupons({ dataInicio, dataFim }) {
  const [cupons, setCupons] = useState(null)
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' })
  const [exportando, setExportando] = useState(false)
  const [gerandoPdf, setGerandoPdf] = useState(false)

  useEffect(() => {
    let cancelado = false
    setCupons(null)
    setMensagem({ tipo: '', texto: '' })
    if (dataInicio > dataFim) {
      setCupons([])
      return undefined
    }
    window.electronAPI
      .listarCuponsPeriodo(dataInicio, dataFim)
      .then((lista) => !cancelado && setCupons(lista || []))
      .catch((err) => {
        if (cancelado) return
        setCupons([])
        setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao carregar os cupons.') })
      })
    return () => {
      cancelado = true
    }
  }, [dataInicio, dataFim])

  async function exportar() {
    setExportando(true)
    setMensagem({ tipo: '', texto: '' })
    try {
      const r = await window.electronAPI.exportarCuponsPlanilha(dataInicio, dataFim)
      if (r) setMensagem({ tipo: 'success', texto: `${r.total} cupom(ns) salvos em ${r.caminho}.` })
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao gerar a planilha.') })
    } finally {
      setExportando(false)
    }
  }

  async function baixarPdf() {
    if (!cupons || cupons.length === 0) return
    setGerandoPdf(true)
    setMensagem({ tipo: '', texto: '' })
    try {
      const loja = await Promise.resolve(window.electronAPI.obterConfigFiscal?.()).catch(() => null)
      const { doc, filename } = montarPdfCupons({
        cupons,
        autorizados,
        total,
        totalPorForma,
        dataInicio,
        dataFim,
        loja,
      })
      const base64 = doc.output('datauristring').split(',')[1]
      const r = await window.electronAPI.salvarRelatorioPDF(base64, filename)
      if (r?.canceled) return
      if (!r?.ok) throw new Error('Erro ao salvar o PDF.')
      setMensagem({ tipo: 'success', texto: `PDF com ${cupons.length} cupom(ns) salvo em ${r.path}.` })
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao gerar o PDF.') })
    } finally {
      setGerandoPdf(false)
    }
  }

  const autorizados = (cupons || []).filter((c) => c.status === 'autorizado')
  const cancelados = (cupons || []).length - autorizados.length
  const total = autorizados.reduce((s, c) => s + c.valor_total, 0)
  const totalPorForma = FORMAS.map((f) => ({
    ...f,
    valor: autorizados.reduce(
      (s, c) => s + c.pagamentos.filter((p) => p.forma === f.id).reduce((x, p) => x + p.valor, 0),
      0
    ),
  })).filter((f) => f.valor > 0)

  return (
    <section className="relatorios-mais-vendidos relatorio-fiscal">
      {mensagem.texto && <p className={`config-feedback ${mensagem.tipo}`}>{mensagem.texto}</p>}

      <div className="relatorio-cupons-topo">
        <div>
          <h3>Relação de cupons fiscais</h3>
          <p className="modal-field-hint">
            Cupons (NFC-e) emitidos no período, com a data de emissão, o valor e a forma de recebimento. Cancelados
            aparecem na lista, mas não entram no total.
          </p>
        </div>
        <div className="relatorios-field-export-actions">
          <button
            type="button"
            className="relatorios-btn-exportar relatorios-btn-exportar-secundario"
            onClick={baixarPdf}
            disabled={gerandoPdf || !cupons || cupons.length === 0}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <polyline points="9 15 12 18 15 15" />
            </svg>
            {gerandoPdf ? 'Gerando...' : 'Baixar PDF'}
          </button>
          <button
            type="button"
            className="relatorios-btn-exportar"
            onClick={exportar}
            disabled={exportando || !cupons || cupons.length === 0}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {exportando ? 'Gerando...' : 'Baixar planilha (.xlsx)'}
          </button>
        </div>
      </div>

      {cupons === null ? (
        <p className="modal-field-hint">Carregando...</p>
      ) : cupons.length === 0 ? (
        <div className="relatorios-empty">
          <p>Nenhum cupom emitido no período</p>
          <span>Escolha outras datas no filtro acima</span>
        </div>
      ) : (
        <>
          <div className="relatorios-cards">
            <div className="rel-card">
              <div className="rel-card-content">
                <span className="rel-card-label">Total em cupons</span>
                <span className="rel-card-value">{formatarMoeda(total)}</span>
                <span className="rel-card-sub">
                  {autorizados.length} autorizado(s){cancelados ? ` · ${cancelados} cancelado(s)` : ''}
                </span>
              </div>
            </div>
            {totalPorForma.map((f) => (
              <div className="rel-card" key={f.id}>
                <div className="rel-card-content">
                  <span className="rel-card-label">{f.label}</span>
                  <span className="rel-card-value">{formatarMoeda(f.valor)}</span>
                  <span className="rel-card-sub">{total > 0 ? `${Math.round((f.valor / total) * 100)}% do total` : ''}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="relatorios-table-wrapper">
            <table className="relatorios-table relatorio-cupons-tabela">
              <thead>
                <tr>
                  <th>Cupom nº</th>
                  <th>Data de emissão</th>
                  <th className="relatorio-cupons-valor">Valor</th>
                  <th>Forma de recebimento</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {cupons.map((c) => (
                  <tr key={c.id} className={c.status === 'cancelado' ? 'relatorio-cupons-cancelado' : ''}>
                    <td>
                      {c.numero}
                      {c.serie ? <span className="relatorio-cupons-serie"> / série {c.serie}</span> : null}
                    </td>
                    <td>{formatarEmissao(c.emitido_em)}</td>
                    <td className="relatorio-cupons-valor">{formatarMoeda(c.valor_total)}</td>
                    <td>{formaDeRecebimento(c.pagamentos)}</td>
                    <td>
                      <span className={`notas-emitidas-situacao ${c.status === 'cancelado' ? 'erro' : 'ok'}`}>
                        {c.status === 'cancelado' ? 'Cancelado' : 'Autorizado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}>
                    <strong>Total ({autorizados.length} autorizado(s))</strong>
                  </td>
                  <td className="relatorio-cupons-valor">
                    <strong>{formatarMoeda(total)}</strong>
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
