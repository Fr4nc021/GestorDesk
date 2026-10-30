import { useCallback, useEffect, useState } from 'react'
import { formatarMoeda } from '../utils/formacaoPreco'
import { mensagemErro } from '../utils/erros'

const CATEGORIAS = {
  normal: { titulo: 'Revenda normal', detalhe: 'Produto próprio sem ST (CFOP 5102)' },
  st: { titulo: 'Revenda com ICMS-ST', detalhe: 'Produto próprio com ST já retido (CFOP 5405)' },
  consignado: { titulo: 'Consignado', detalhe: 'Peça de artesão vendida em consignação (CFOP 5115)' },
}

const MODELOS = { 65: 'NFC-e', 55: 'NF-e' }

/** Aba Fiscal de Relatórios: resumo para o PGDAS, XMLs do período e inutilização de numeração. */
export default function RelatorioFiscal({ dataInicio, dataFim }) {
  const [resumo, setResumo] = useState(null)
  const [buracos, setBuracos] = useState([])
  const [inutilizacoes, setInutilizacoes] = useState([])
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' })
  const [exportando, setExportando] = useState(false)
  const [inutilizando, setInutilizando] = useState(null)

  const carregar = useCallback(async () => {
    try {
      const [r, b, i] = await Promise.all([
        window.electronAPI.resumoFiscalPeriodo(dataInicio, dataFim),
        window.electronAPI.buracosNumeracao(),
        window.electronAPI.listarInutilizacoes(),
      ])
      setResumo(r)
      setBuracos(b || [])
      setInutilizacoes(i || [])
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao carregar o relatório fiscal.') })
    }
  }, [dataInicio, dataFim])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function exportar() {
    setExportando(true)
    setMensagem({ tipo: '', texto: '' })
    try {
      const r = await window.electronAPI.exportarXmlsPeriodo(dataInicio, dataFim)
      if (r) {
        setMensagem({
          tipo: 'success',
          texto: `${r.total} XML(s) salvos em ${r.caminho}.${r.faltando ? ` ${r.faltando} nota(s) sem XML disponível.` : ''}`,
        })
      }
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao exportar os XMLs.') })
    } finally {
      setExportando(false)
    }
  }

  async function confirmarInutilizacao() {
    const texto = inutilizando.justificativa.trim()
    if (texto.length < 15) {
      setInutilizando((p) => ({ ...p, erro: 'A justificativa precisa ter pelo menos 15 caracteres.' }))
      return
    }
    setInutilizando((p) => ({ ...p, salvando: true, erro: '' }))
    try {
      await window.electronAPI.inutilizarNumeracao({ ...inutilizando.faixa, justificativa: texto })
      setMensagem({ tipo: 'success', texto: 'Numeração inutilizada na SEFAZ.' })
      setInutilizando(null)
      carregar()
    } catch (err) {
      setInutilizando((p) => ({ ...p, salvando: false, erro: mensagemErro(err, 'Erro ao inutilizar.') }))
    }
  }

  const totalLiquido = resumo?.linhas.reduce((s, l) => s + l.liquido, 0) || 0

  return (
    <section className="relatorios-mais-vendidos relatorio-fiscal">
      {mensagem.texto && <p className={`config-feedback ${mensagem.tipo}`}>{mensagem.texto}</p>}

      <h3>Resumo para o PGDAS (Simples Nacional)</h3>
      <p className="modal-field-hint">
        Receita do período separada por tipo de operação. Descontos da venda já rateados; devoluções de cliente
        descontadas.
      </p>
      {resumo && (
        <>
          <table className="pdv-products-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Vendas</th>
                <th>Devoluções</th>
                <th>Receita líquida</th>
              </tr>
            </thead>
            <tbody>
              {resumo.linhas.map((l) => (
                <tr key={l.categoria}>
                  <td>
                    <strong>{CATEGORIAS[l.categoria].titulo}</strong>
                    <span className="notas-entrada-cfop">{CATEGORIAS[l.categoria].detalhe}</span>
                  </td>
                  <td>{formatarMoeda(l.vendas)}</td>
                  <td>{l.devolucoes ? `- ${formatarMoeda(l.devolucoes)}` : '—'}</td>
                  <td>{formatarMoeda(l.liquido)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td />
                <td />
                <td>
                  <strong>{formatarMoeda(totalLiquido)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="modal-field-hint">
            {resumo.cupons.vendas} venda(s) no período · {resumo.cupons.autorizados || 0} com cupom autorizado (
            {formatarMoeda(resumo.cupons.valor_autorizado || 0)}) · {resumo.cupons.cancelados || 0} cancelado(s) ·{' '}
            {resumo.cupons.sem_cupom || 0} sem cupom.
          </p>
        </>
      )}

      <h3>XMLs para a contadora</h3>
      <p className="modal-field-hint">
        Gera um .zip com os XMLs do período, separados por pasta: cupons, NF-e de devolução ao artesão, devolução
        simbólica, devolução de cliente e notas de entrada dos fornecedores. Guarde por 5 anos.
      </p>
      <button type="button" className="btn-sync-manual" onClick={exportar} disabled={exportando}>
        {exportando ? 'Gerando...' : 'Baixar XMLs do período (.zip)'}
      </button>

      <h3>Inutilização de numeração</h3>
      <p className="modal-field-hint">
        Números pulados na sequência (por rejeição ou erro) precisam ser inutilizados na SEFAZ.
      </p>
      {buracos.length === 0 ? (
        <p className="modal-field-hint">Nenhum número pulado.</p>
      ) : (
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Série</th>
              <th>Números</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {buracos.map((b) => (
              <tr key={`${b.modelo}-${b.serie}-${b.numero_inicial}`}>
                <td>{MODELOS[b.modelo] || b.modelo}</td>
                <td>{b.serie}</td>
                <td>{b.numero_inicial === b.numero_final ? b.numero_inicial : `${b.numero_inicial} a ${b.numero_final}`}</td>
                <td>
                  <button
                    type="button"
                    className="caixa-btn-excluir"
                    onClick={() => setInutilizando({ faixa: b, justificativa: '', erro: '', salvando: false })}
                  >
                    Inutilizar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button
        type="button"
        className="fiscal-mostrar-csc"
        onClick={() =>
          setInutilizando({
            faixa: { modelo: '65', serie: '1', numero_inicial: '', numero_final: '' },
            manual: true,
            justificativa: '',
            erro: '',
            salvando: false,
          })
        }
      >
        Inutilizar outra faixa manualmente
      </button>
      {inutilizacoes.length > 0 && (
        <p className="modal-field-hint">
          Já inutilizadas:{' '}
          {inutilizacoes
            .map((i) => `${MODELOS[i.modelo] || i.modelo} série ${i.serie} nº ${i.numero_inicial}${i.numero_final !== i.numero_inicial ? `–${i.numero_final}` : ''}`)
            .join(' · ')}
        </p>
      )}

      {inutilizando && (
        <div className="modal-overlay" onClick={() => !inutilizando.salvando && setInutilizando(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Inutilizar numeração</h3>
              <button type="button" className="modal-close" onClick={() => setInutilizando(null)} aria-label="Fechar">
                ×
              </button>
            </div>
            {inutilizando.manual ? (
              <div className="fiscal-grid">
                <div className="modal-field">
                  <label htmlFor="inut-modelo">Modelo</label>
                  <select
                    id="inut-modelo"
                    value={inutilizando.faixa.modelo}
                    onChange={(e) => setInutilizando((p) => ({ ...p, faixa: { ...p.faixa, modelo: e.target.value } }))}
                  >
                    <option value="65">NFC-e (65)</option>
                    <option value="55">NF-e (55)</option>
                  </select>
                </div>
                {[
                  ['serie', 'Série'],
                  ['numero_inicial', 'Número inicial'],
                  ['numero_final', 'Número final'],
                ].map(([campo, rotulo]) => (
                  <div className="modal-field" key={campo}>
                    <label htmlFor={`inut-${campo}`}>{rotulo}</label>
                    <input
                      id={`inut-${campo}`}
                      inputMode="numeric"
                      value={inutilizando.faixa[campo]}
                      onChange={(e) =>
                        setInutilizando((p) => ({ ...p, faixa: { ...p.faixa, [campo]: e.target.value.replace(/\D/g, '') } }))
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="modal-field-hint">
                {MODELOS[inutilizando.faixa.modelo]} série {inutilizando.faixa.serie}, números{' '}
                {inutilizando.faixa.numero_inicial} a {inutilizando.faixa.numero_final}. Não pode ser desfeito.
              </p>
            )}
            <div className="modal-field">
              <label htmlFor="inut-just">Justificativa</label>
              <input
                id="inut-just"
                type="text"
                maxLength={255}
                value={inutilizando.justificativa}
                onChange={(e) => setInutilizando((p) => ({ ...p, justificativa: e.target.value, erro: '' }))}
                placeholder="Ex.: numeração pulada por rejeição da SEFAZ"
              />
            </div>
            {inutilizando.erro && <p className="config-feedback error">{inutilizando.erro}</p>}
            <div className="estoque-modal-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setInutilizando(null)}>
                Voltar
              </button>
              <button
                type="button"
                className="modal-submit"
                onClick={confirmarInutilizacao}
                disabled={inutilizando.salvando}
              >
                {inutilizando.salvando ? 'Enviando...' : 'Inutilizar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
