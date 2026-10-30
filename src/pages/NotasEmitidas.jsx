import { useCallback, useEffect, useState } from 'react'
import { formatarMoeda } from '../utils/formacaoPreco'
import { mensagemErro } from '../utils/erros'
import BotaoAcao from '../components/BotaoAcao'

const SITUACOES = {
  autorizado: { label: 'Autorizado', classe: 'ok' },
  cancelado: { label: 'Cancelado', classe: 'neutro' },
  enviando: { label: 'Enviando', classe: 'alerta' },
  processando_autorizacao: { label: 'Processando', classe: 'alerta' },
  erro_conexao: { label: 'Sem conexão', classe: 'erro' },
  erro_autorizacao: { label: 'Rejeitado', classe: 'erro' },
  erro_validacao: { label: 'Com erro', classe: 'erro' },
  denegado: { label: 'Denegado', classe: 'erro' },
}

const STATUS_REENVIAR = ['erro_conexao', 'erro_autorizacao', 'erro_validacao', 'enviando']

function rotuloOrigem(nota) {
  if (nota.devolucao_cliente_id) {
    return `Devolução de cliente · venda #${nota.devolucao_cliente_venda_id}${nota.cliente_nome ? ` · ${nota.cliente_nome}` : ''}`
  }
  if (nota.devolucao_id) {
    const artesao = nota.artesao_nome_fantasia || nota.artesao_razao_social || nota.artesao_nome
    const tipo = nota.devolucao_tipo === 'simbolica' ? `Devolução simbólica ${nota.devolucao_cfop || '5919'}` : 'Devolução 5918'
    return `${tipo}${artesao ? ` · ${artesao}` : ''}`
  }
  return `Venda #${nota.venda_id}`
}

function hojeIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inicioDoMesIso() {
  return `${hojeIso().slice(0, 8)}01`
}

function formatarDataHora(texto) {
  if (!texto) return '—'
  const d = new Date(String(texto).replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Lista de notas emitidas. Dentro de Vendas, mostra só as NF-e de devolução ao artesão. */
export default function NotasEmitidas({ somenteDevolucoes = false }) {
  const [dataInicio, setDataInicio] = useState(inicioDoMesIso)
  const [dataFim, setDataFim] = useState(hojeIso)
  const [notas, setNotas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [processandoId, setProcessandoId] = useState(null)
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' })
  const [cancelamento, setCancelamento] = useState(null)

  const carregar = useCallback(async () => {
    if (!window.electronAPI?.listarNotasFiscais) {
      setCarregando(false)
      return
    }
    try {
      const lista = await window.electronAPI.listarNotasFiscais({ dataInicio, dataFim })
      setNotas(somenteDevolucoes ? lista.filter((n) => n.devolucao_id || n.devolucao_cliente_id) : lista)
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao carregar as notas.') })
    } finally {
      setCarregando(false)
    }
  }, [dataInicio, dataFim, somenteDevolucoes])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function reenviar(nota) {
    setProcessandoId(nota.id)
    setMensagem({ tipo: '', texto: '' })
    try {
      const resultado = nota.devolucao_cliente_id
        ? await window.electronAPI.emitirNfeDevolucaoCliente(nota.devolucao_cliente_id)
        : nota.devolucao_id
          ? await window.electronAPI.emitirNfeDevolucao(nota.devolucao_id)
          : await window.electronAPI.emitirNfceVenda(nota.venda_id, {})
      const nome = nota.modelo === '55' ? 'NF-e' : 'Cupom'
      setMensagem(
        resultado?.status === 'autorizado'
          ? { tipo: 'success', texto: `${nome} nº ${resultado.numero} autorizado.` }
          : resultado?.status === 'processando_autorizacao'
            ? { tipo: 'success', texto: 'Nota em processamento na SEFAZ. Atualize a situação em instantes.' }
            : { tipo: 'error', texto: resultado?.mensagem || 'A nota não foi autorizada.' },
      )
      await carregar()
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao emitir o cupom.') })
    } finally {
      setProcessandoId(null)
    }
  }

  async function atualizarSituacao(nota) {
    setProcessandoId(nota.id)
    try {
      await window.electronAPI.atualizarSituacaoNota(nota.id)
      await carregar()
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao consultar a nota.') })
    } finally {
      setProcessandoId(null)
    }
  }

  async function imprimir(nota) {
    try {
      await window.electronAPI.imprimirNfce(nota.id)
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Não foi possível abrir o cupom.') })
    }
  }

  async function confirmarCancelamento() {
    if (!cancelamento) return
    if (cancelamento.justificativa.trim().length < 15) {
      setCancelamento((prev) => ({ ...prev, erro: 'A justificativa precisa ter pelo menos 15 caracteres.' }))
      return
    }
    setCancelamento((prev) => ({ ...prev, salvando: true, erro: '' }))
    try {
      await window.electronAPI.cancelarNfce(cancelamento.nota.id, cancelamento.justificativa)
      setMensagem({ tipo: 'success', texto: `Nota nº ${cancelamento.nota.numero} cancelada.` })
      setCancelamento(null)
      await carregar()
    } catch (err) {
      setCancelamento((prev) => ({ ...prev, salvando: false, erro: mensagemErro(err, 'Erro ao cancelar o cupom.') }))
    }
  }

  return (
    <div className="produtos notas-emitidas">
      <div className="produtos-header">
        {!somenteDevolucoes && (
          <div className="produtos-header-left">
            <h2 className="dashboard-heading">Notas emitidas</h2>
            <p className="dashboard-subtitle">
              Cupons fiscais (NFC-e) das vendas e NF-e de devolução ao artesão. Reenvie as que deram erro, reimprima
              ou cancele.
            </p>
          </div>
        )}
        <div className="notas-emitidas-filtro">
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} aria-label="De" />
          <span>a</span>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} aria-label="Até" />
        </div>
      </div>

      {mensagem.texto && <p className={`config-feedback ${mensagem.tipo}`}>{mensagem.texto}</p>}

      <div className="produtos-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Origem</th>
              <th>Nota</th>
              <th>Valor</th>
              <th>Situação</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={6}>Carregando...</td>
              </tr>
            ) : notas.length === 0 ? (
              <tr>
                <td colSpan={6}>Nenhuma nota no período.</td>
              </tr>
            ) : (
              notas.map((nota) => {
                const situacao = SITUACOES[nota.status] || { label: nota.status, classe: 'neutro' }
                return (
                  <tr key={nota.id}>
                    <td>{formatarDataHora(nota.venda_data || nota.created_at)}</td>
                    <td>{rotuloOrigem(nota)}</td>
                    <td>
                      {nota.modelo === '55' ? 'NF-e ' : 'NFC-e '}
                      {nota.numero ? `${nota.numero} / ${nota.serie}` : ''}
                      {nota.ambiente === '2' && <span className="notas-entrada-cfop">Homologação</span>}
                    </td>
                    <td>{formatarMoeda(nota.valor_total)}</td>
                    <td>
                      <span className={`notas-emitidas-situacao ${situacao.classe}`}>{situacao.label}</span>
                      {nota.status !== 'autorizado' && nota.status !== 'cancelado' && nota.mensagem && (
                        <span className="notas-entrada-cfop">{nota.mensagem}</span>
                      )}
                    </td>
                    <td>
                      <div className="caixa-acoes-cell">
                        {nota.status === 'autorizado' && (
                          <>
                            <BotaoAcao icone="imprimir" onClick={() => imprimir(nota)}>
                              Imprimir
                            </BotaoAcao>
                            <BotaoAcao
                              icone="cancelar"
                              perigo
                              onClick={() => setCancelamento({ nota, justificativa: '', erro: '', salvando: false })}
                            >
                              Cancelar
                            </BotaoAcao>
                          </>
                        )}
                        {nota.status === 'processando_autorizacao' && (
                          <BotaoAcao
                            icone="atualizar"
                            onClick={() => atualizarSituacao(nota)}
                            disabled={processandoId === nota.id}
                          >
                            Atualizar situação
                          </BotaoAcao>
                        )}
                        {STATUS_REENVIAR.includes(nota.status) && !nota.venda_excluida_em && !nota.devolucao_excluida_em && !nota.devolucao_cliente_excluida_em && (
                          <BotaoAcao icone="atualizar" onClick={() => reenviar(nota)} disabled={processandoId === nota.id}>
                            {processandoId === nota.id ? 'Enviando...' : 'Tentar de novo'}
                          </BotaoAcao>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {cancelamento && (
        <div className="modal-overlay" onClick={() => !cancelamento.salvando && setCancelamento(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                Cancelar {cancelamento.nota.modelo === '55' ? 'NF-e' : 'cupom'} nº {cancelamento.nota.numero}
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !cancelamento.salvando && setCancelamento(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <p className="modal-field-hint">
              A SEFAZ só aceita o cancelamento pouco tempo depois da emissão. A venda continua registrada; se precisar,
              exclua ou altere a venda depois de cancelar o cupom.
            </p>
            <div className="modal-field">
              <label htmlFor="justificativaCancelamento">Motivo do cancelamento</label>
              <input
                id="justificativaCancelamento"
                type="text"
                maxLength={255}
                value={cancelamento.justificativa}
                onChange={(e) => setCancelamento((prev) => ({ ...prev, justificativa: e.target.value, erro: '' }))}
                placeholder="Ex.: venda lançada com produto errado"
              />
            </div>
            {cancelamento.erro && <p className="config-feedback error">{cancelamento.erro}</p>}
            <div className="estoque-modal-acoes">
              <button
                type="button"
                className="modal-btn-cancelar"
                onClick={() => setCancelamento(null)}
                disabled={cancelamento.salvando}
              >
                Voltar
              </button>
              <button
                type="button"
                className="modal-submit"
                onClick={confirmarCancelamento}
                disabled={cancelamento.salvando}
              >
                {cancelamento.salvando ? 'Cancelando...' : 'Cancelar cupom'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
