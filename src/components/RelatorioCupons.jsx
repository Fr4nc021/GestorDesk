import { useEffect, useState } from 'react'
import { formatarMoeda } from '../utils/formacaoPreco'
import { mensagemErro } from '../utils/erros'

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

/** Aba Fiscal > Cupons: relação dos cupons (NFC-e) do período, com exportação para planilha. */
export default function RelatorioCupons({ dataInicio, dataFim }) {
  const [cupons, setCupons] = useState(null)
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' })
  const [exportando, setExportando] = useState(false)

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
