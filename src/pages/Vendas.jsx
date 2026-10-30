import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatarMoeda } from '../utils/formacaoPreco'
import { mensagemErro } from '../utils/erros'
import BotaoAcao from '../components/BotaoAcao'
import NotasEmitidas from './NotasEmitidas'
import DevolucaoSimbolica from '../components/DevolucaoSimbolica'
import ModalDevolucaoCliente from '../components/ModalDevolucaoCliente'

const SITUACOES = {
  sem_cupom: { label: 'Sem cupom', classe: 'neutro' },
  autorizado: { label: 'Autorizado', classe: 'ok' },
  cancelado: { label: 'Cancelado', classe: 'neutro' },
  enviando: { label: 'Enviando', classe: 'alerta' },
  processando_autorizacao: { label: 'Processando', classe: 'alerta' },
  erro_conexao: { label: 'Sem conexão', classe: 'erro' },
  erro_autorizacao: { label: 'Rejeitado', classe: 'erro' },
  erro_validacao: { label: 'Com erro', classe: 'erro' },
  denegado: { label: 'Denegado', classe: 'erro' },
}

const FILTROS_SITUACAO = [
  { valor: 'todas', label: 'Todas' },
  { valor: 'sem_cupom', label: 'Sem cupom' },
  { valor: 'autorizado', label: 'Autorizadas' },
  { valor: 'erro', label: 'Com erro' },
  { valor: 'cancelado', label: 'Canceladas' },
]

const STATUS_ERRO = ['erro_conexao', 'erro_autorizacao', 'erro_validacao', 'enviando', 'denegado']
/** Situações em que dá para (re)emitir o cupom. */
const PODE_EMITIR = ['sem_cupom', 'erro_conexao', 'erro_autorizacao', 'erro_validacao', 'enviando']

const FORMAS = { dinheiro: 'Dinheiro', credito: 'Crédito', debito: 'Débito', pix: 'Pix' }

function hojeIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inicioDoMesIso() {
  return `${hojeIso().slice(0, 8)}01`
}

function paraData(texto) {
  if (!texto) return null
  const s = String(texto)
  // ISO com fuso (gravado pelo app) ou 'YYYY-MM-DD HH:MM:SS' local (SQLite).
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Atalhos de período: [rótulo, início, fim]. */
function periodosRapidos() {
  const hoje = new Date()
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const inicioMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const fimMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0)
  return [
    ['Este mês', inicioDoMesIso(), hojeIso()],
    ['Mês passado', iso(inicioMesPassado), iso(fimMesPassado)],
    ['Tudo', '2000-01-01', hojeIso()],
  ]
}

/** A data da venda é hora local; as que vieram da nuvem trazem um "+00:00" que não é fuso de verdade. */
function formatarDataVenda(texto) {
  return formatarDataHora(String(texto || '').replace(/([zZ]|[+-]\d\d:?\d\d)$/, ''))
}

function formatarDataHora(texto) {
  const d = paraData(texto)
  if (!d) return '—'
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function situacaoDaVenda(venda) {
  return venda.nota_status || 'sem_cupom'
}

/** Momento em que o cupom deixa de poder ser cancelado (null se não se aplica). */
function limiteCancelamento(venda, prazoMin) {
  if (venda.nota_status !== 'autorizado') return null
  const autorizada = paraData(venda.nota_autorizada_em)
  if (!autorizada) return null
  return new Date(autorizada.getTime() + prazoMin * 60000)
}

function formatarRestante(ms) {
  const min = Math.ceil(ms / 60000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const resto = min % 60
  return resto ? `${h}h ${resto}min` : `${h}h`
}

function SeloPrazo({ limite, agora, prazoMin }) {
  if (!limite) return <span className="vendas-prazo-vazio">—</span>
  const restante = limite.getTime() - agora
  if (restante <= 0) return <span className="notas-emitidas-situacao neutro">Prazo encerrado</span>
  const alerta = restante <= Math.max(5, prazoMin * 0.2) * 60000
  const hora = limite.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return (
    <span className={`notas-emitidas-situacao ${alerta ? 'alerta' : 'ok'}`} title={`Cancela até ${limite.toLocaleString('pt-BR')}`}>
      Até {hora} · faltam {formatarRestante(restante)}
    </span>
  )
}

export default function Vendas() {
  const [aba, setAba] = useState('vendas')
  const [versaoDevolucoes, setVersaoDevolucoes] = useState(0)
  const [dataInicio, setDataInicio] = useState(inicioDoMesIso)
  const [dataFim, setDataFim] = useState(hojeIso)
  const [filtroSituacao, setFiltroSituacao] = useState('todas')
  const [busca, setBusca] = useState('')
  const [vendas, setVendas] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [selecionadas, setSelecionadas] = useState(() => new Set())
  const [prazoMin, setPrazoMin] = useState(30)
  const [agora, setAgora] = useState(() => Date.now())
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' })
  const [lote, setLote] = useState(null)
  const [resumoLote, setResumoLote] = useState(null)
  const [cancelamento, setCancelamento] = useState(null)
  const [processandoId, setProcessandoId] = useState(null)
  const [devolucaoVendaId, setDevolucaoVendaId] = useState(null)
  const [pendencias, setPendencias] = useState(null)
  const [detalhe, setDetalhe] = useState(null)

  const carregar = useCallback(async () => {
    if (!window.electronAPI?.listarVendasComCupom) {
      setCarregando(false)
      return
    }
    try {
      setVendas(await window.electronAPI.listarVendasComCupom({ dataInicio, dataFim }))
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao carregar as vendas.') })
    } finally {
      setCarregando(false)
    }
  }, [dataInicio, dataFim])

  useEffect(() => {
    carregar()
  }, [carregar])

  useEffect(() => {
    window.electronAPI?.obterConfigFiscal?.().then((c) => {
      const n = parseInt(c?.prazo_cancelamento_nfce, 10)
      if (n > 0) setPrazoMin(n)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return vendas.filter((v) => {
      const s = situacaoDaVenda(v)
      if (filtroSituacao === 'erro' ? !STATUS_ERRO.includes(s) : filtroSituacao !== 'todas' && s !== filtroSituacao) {
        return false
      }
      if (!termo) return true
      return String(v.id) === termo.replace('#', '') || String(v.itens_resumo || '').toLowerCase().includes(termo)
    })
  }, [vendas, filtroSituacao, busca])

  const podeCancelar = useCallback(
    (v) => {
      const limite = limiteCancelamento(v, prazoMin)
      return Boolean(limite && limite.getTime() > agora)
    },
    [prazoMin, agora],
  )

  const marcadas = visiveis.filter((v) => selecionadas.has(v.id))
  const totalMarcado = marcadas.reduce((s, v) => s + (Number(v.valor_total) || 0), 0)
  const paraEmitir = marcadas.filter((v) => PODE_EMITIR.includes(situacaoDaVenda(v)))
  const paraCancelar = marcadas.filter(podeCancelar)
  const todasMarcadas = visiveis.length > 0 && visiveis.every((v) => selecionadas.has(v.id))

  function alternar(id) {
    setSelecionadas((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarTodas() {
    setSelecionadas(todasMarcadas ? new Set() : new Set(visiveis.map((v) => v.id)))
  }

  /** Roda uma ação venda a venda, mostrando o progresso; um erro não interrompe o lote. */
  async function rodarLote(titulo, lista, acao) {
    const resultados = []
    setResumoLote(null)
    setMensagem({ tipo: '', texto: '' })
    for (let i = 0; i < lista.length; i += 1) {
      setLote({ titulo, feitos: i, total: lista.length })
      const venda = lista[i]
      try {
        const r = await acao(venda)
        resultados.push({ venda, ok: r.ok, texto: r.texto })
      } catch (err) {
        resultados.push({ venda, ok: false, texto: mensagemErro(err, 'Erro inesperado.') })
      }
    }
    setLote(null)
    setResumoLote({ titulo, resultados })
    setSelecionadas(new Set())
    await carregar()
  }

  async function emitirSelecionadas() {
    if (paraEmitir.length === 0) {
      setMensagem({ tipo: 'error', texto: 'Nenhuma das vendas marcadas está sem cupom ou com erro.' })
      return
    }
    // Antes de enviar, pede o NCM/CEST dos produtos que não têm (inclusive os já excluídos).
    try {
      const lista = (await window.electronAPI.pendenciasFiscaisVendas?.(paraEmitir.map((v) => v.id))) || []
      if (lista.length > 0) {
        const valores = Object.fromEntries(lista.map((p) => [p.id, { ncm: p.ncm || '', cest: p.cest || '' }]))
        setPendencias({ lista, valores, vendas: paraEmitir, salvando: false, erro: '' })
        return
      }
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao conferir os dados fiscais.') })
      return
    }
    iniciarEmissao(paraEmitir)
  }

  async function salvarPendenciasEEmitir() {
    const { lista, valores, vendas: vendasParaEmitir } = pendencias
    for (const p of lista) {
      const { ncm, cest } = valores[p.id]
      if (String(ncm).replace(/\D/g, '').length !== 8) {
        setPendencias((prev) => ({ ...prev, erro: `Preencha o NCM (8 números) de "${p.nome}".` }))
        return
      }
      if (p.precisa_cest && String(cest).replace(/\D/g, '').length !== 7) {
        setPendencias((prev) => ({ ...prev, erro: `Preencha o CEST (7 números) de "${p.nome}".` }))
        return
      }
    }
    setPendencias((prev) => ({ ...prev, salvando: true, erro: '' }))
    try {
      for (const p of lista) await window.electronAPI.definirFiscalProduto(p.id, valores[p.id])
    } catch (err) {
      setPendencias((prev) => ({ ...prev, salvando: false, erro: mensagemErro(err, 'Erro ao salvar o NCM.') }))
      return
    }
    setPendencias(null)
    iniciarEmissao(vendasParaEmitir)
  }

  async function abrirDetalhe(venda) {
    try {
      setDetalhe(await window.electronAPI.detalharVenda(venda.id))
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Não foi possível abrir a venda.') })
    }
  }

  function iniciarEmissao(lista) {
    const ignoradas = marcadas.length - lista.length
    const aviso = ignoradas > 0 ? `\n${ignoradas} venda(s) marcada(s) já têm cupom e serão ignoradas.` : ''
    if (!window.confirm(`Emitir cupom fiscal de ${lista.length} venda(s)?${aviso}`)) return
    rodarLote('Emitindo cupons', lista, async (v) => {
      const nota = await window.electronAPI.emitirNfceVenda(v.id, {})
      if (nota?.status === 'autorizado') return { ok: true, texto: `Cupom nº ${nota.numero} autorizado.` }
      if (nota?.status === 'processando_autorizacao') return { ok: true, texto: 'Em processamento na SEFAZ.' }
      return { ok: false, texto: nota?.mensagem || 'Não autorizado.' }
    })
  }

  function abrirCancelamento() {
    if (paraCancelar.length === 0) {
      setMensagem({ tipo: 'error', texto: 'Nenhuma das vendas marcadas tem cupom autorizado dentro do prazo de cancelamento.' })
      return
    }
    setCancelamento({ lista: paraCancelar, ignoradas: marcadas.length - paraCancelar.length, justificativa: '', erro: '' })
  }

  function confirmarCancelamento() {
    const texto = cancelamento.justificativa.trim()
    if (texto.length < 15) {
      setCancelamento((prev) => ({ ...prev, erro: 'A justificativa precisa ter pelo menos 15 caracteres.' }))
      return
    }
    const lista = cancelamento.lista
    setCancelamento(null)
    rodarLote('Cancelando cupons', lista, async (v) => {
      await window.electronAPI.cancelarNfce(v.nota_id, texto)
      return { ok: true, texto: `Cupom nº ${v.nota_numero} cancelado.` }
    })
  }

  async function imprimir(venda) {
    try {
      await window.electronAPI.imprimirNfce(venda.nota_id)
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Não foi possível abrir o cupom.') })
    }
  }

  async function visualizar(venda) {
    try {
      await window.electronAPI.visualizarNota(venda.nota_id)
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Não foi possível abrir o cupom.') })
    }
  }

  async function atualizarSituacao(venda) {
    setProcessandoId(venda.id)
    try {
      await window.electronAPI.atualizarSituacaoNota(venda.nota_id)
      await carregar()
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao consultar a nota.') })
    } finally {
      setProcessandoId(null)
    }
  }

  const ocupado = Boolean(lote)

  return (
    <div className="produtos notas-emitidas vendas-cupom">
      <div className="produtos-header">
        <div className="produtos-header-left">
          <h2 className="dashboard-heading">Vendas</h2>
          <p className="dashboard-subtitle">
            Todas as vendas com a situação do cupom fiscal (NFC-e). Marque as vendas para emitir ou cancelar em lote.
          </p>
        </div>
        <div className="vendas-abas">
          <button type="button" className={aba === 'vendas' ? 'ativa' : ''} onClick={() => setAba('vendas')}>
            Vendas
          </button>
          <button type="button" className={aba === 'devolucoes' ? 'ativa' : ''} onClick={() => setAba('devolucoes')}>
            NF-e de devolução
          </button>
        </div>
      </div>

      {aba === 'devolucoes' ? (
        <>
          <DevolucaoSimbolica onGerada={() => setVersaoDevolucoes((v) => v + 1)} />
          <NotasEmitidas key={versaoDevolucoes} somenteDevolucoes />
        </>
      ) : (
        <>
          <div className="vendas-barra">
            <div className="notas-emitidas-filtro">
              <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} aria-label="De" />
              <span>a</span>
              <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} aria-label="Até" />
              {periodosRapidos().map(([rotulo, inicio, fim]) => (
                <button
                  key={rotulo}
                  type="button"
                  className={`vendas-periodo ${dataInicio === inicio && dataFim === fim ? 'ativa' : ''}`}
                  onClick={() => {
                    setDataInicio(inicio)
                    setDataFim(fim)
                  }}
                >
                  {rotulo}
                </button>
              ))}
              <select value={filtroSituacao} onChange={(e) => setFiltroSituacao(e.target.value)} aria-label="Situação">
                {FILTROS_SITUACAO.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nº da venda ou produto"
                aria-label="Buscar"
              />
            </div>
            <div className="vendas-barra-acoes">
              <span className="vendas-resumo-selecao">
                {marcadas.length} venda(s) · {formatarMoeda(totalMarcado)}
              </span>
              <BotaoAcao icone="atualizar" onClick={emitirSelecionadas} disabled={ocupado || marcadas.length === 0}>
                Emitir cupom
              </BotaoAcao>
              <BotaoAcao icone="cancelar" perigo onClick={abrirCancelamento} disabled={ocupado || marcadas.length === 0}>
                Cancelar cupom
              </BotaoAcao>
            </div>
          </div>

          {lote && (
            <div className="vendas-progresso">
              <span>
                {lote.titulo}… {lote.feitos} de {lote.total}
              </span>
              <div className="vendas-progresso-barra">
                <div style={{ width: `${(lote.feitos / lote.total) * 100}%` }} />
              </div>
            </div>
          )}

          {resumoLote && (
            <div className="vendas-resumo-lote">
              <div className="vendas-resumo-lote-topo">
                <strong>
                  {resumoLote.titulo}: {resumoLote.resultados.filter((r) => r.ok).length} ok ·{' '}
                  {resumoLote.resultados.filter((r) => !r.ok).length} com erro
                </strong>
                <button type="button" className="modal-close" onClick={() => setResumoLote(null)} aria-label="Fechar">
                  ×
                </button>
              </div>
              <ul>
                {resumoLote.resultados
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.venda.id}>
                      Venda #{r.venda.id}: {r.texto}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {mensagem.texto && <p className={`config-feedback ${mensagem.tipo}`}>{mensagem.texto}</p>}

          <div className="produtos-table-wrapper">
            <table className="pdv-products-table">
              <thead>
                <tr>
                  <th>
                    <input type="checkbox" checked={todasMarcadas} onChange={alternarTodas} aria-label="Selecionar todas" />
                  </th>
                  <th>Venda</th>
                  <th>Data</th>
                  <th>Itens</th>
                  <th>Pagamento</th>
                  <th>Valor</th>
                  <th>Cupom</th>
                  <th>Cancelamento</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={9}>Carregando...</td>
                  </tr>
                ) : visiveis.length === 0 ? (
                  <tr>
                    <td colSpan={9}>Nenhuma venda no período.</td>
                  </tr>
                ) : (
                  visiveis.map((v) => {
                    const s = situacaoDaVenda(v)
                    const situacao = SITUACOES[s] || { label: s, classe: 'neutro' }
                    const limite = limiteCancelamento(v, prazoMin)
                    const vencido = limite && limite.getTime() <= agora
                    const formas = String(v.formas_pagamento || v.forma_pagamento || '')
                      .split(',')
                      .filter(Boolean)
                      .map((f) => FORMAS[f] || f)
                      .join(' + ')
                    return (
                      <tr key={v.id} className={selecionadas.has(v.id) ? 'vendas-linha-marcada' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selecionadas.has(v.id)}
                            onChange={() => alternar(v.id)}
                            aria-label={`Selecionar venda ${v.id}`}
                          />
                        </td>
                        <td>#{v.id}</td>
                        <td>{formatarDataVenda(v.data)}</td>
                        <td className="vendas-itens" title={v.itens_resumo || ''}>
                          {v.itens_resumo || '—'}
                        </td>
                        <td>{formas || '—'}</td>
                        <td>{formatarMoeda(v.valor_total)}</td>
                        <td>
                          <span className={`notas-emitidas-situacao ${situacao.classe}`}>{situacao.label}</span>
                          {v.nota_numero && s !== 'sem_cupom' && (
                            <span className="notas-entrada-cfop">
                              nº {v.nota_numero}
                              {v.nota_ambiente === '2' ? ' · Homologação' : ''}
                            </span>
                          )}
                          {STATUS_ERRO.includes(s) && v.nota_mensagem && (
                            <span className="notas-entrada-cfop">{v.nota_mensagem}</span>
                          )}
                        </td>
                        <td>
                          <SeloPrazo limite={limite} agora={agora} prazoMin={prazoMin} />
                        </td>
                        <td>
                          <div className="caixa-acoes-cell">
                            <BotaoAcao icone="imprimir" onClick={() => abrirDetalhe(v)}>
                              Ver venda
                            </BotaoAcao>
                            {(s === 'autorizado' || s === 'cancelado') && v.nota_caminho_danfe && (
                              <BotaoAcao icone="imprimir" onClick={() => visualizar(v)}>
                                Ver cupom
                              </BotaoAcao>
                            )}
                            {s === 'autorizado' && v.nota_caminho_danfe && (
                              <BotaoAcao icone="imprimir" onClick={() => imprimir(v)}>
                                Reimprimir
                              </BotaoAcao>
                            )}
                            {s === 'autorizado' && (
                              <BotaoAcao icone="atualizar" onClick={() => setDevolucaoVendaId(v.id)}>
                                Devolução do cliente
                              </BotaoAcao>
                            )}
                            {s === 'processando_autorizacao' && (
                              <BotaoAcao
                                icone="atualizar"
                                onClick={() => atualizarSituacao(v)}
                                disabled={processandoId === v.id}
                              >
                                Atualizar situação
                              </BotaoAcao>
                            )}
                            {vencido && (
                              <span className="notas-entrada-cfop" title="Passado o prazo, o estorno é feito por NF-e de devolução.">
                                Fora do prazo: use Devolução do cliente
                              </span>
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
        </>
      )}

      {devolucaoVendaId != null && (
        <ModalDevolucaoCliente
          vendaId={devolucaoVendaId}
          onFechar={() => setDevolucaoVendaId(null)}
          onConcluida={(msg) => {
            setDevolucaoVendaId(null)
            setMensagem(msg)
            carregar()
          }}
        />
      )}

      {pendencias && (
        <div className="modal-overlay" onClick={() => !pendencias.salvando && setPendencias(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Corrigir dados fiscais</h3>
              <button type="button" className="modal-close" onClick={() => setPendencias(null)} aria-label="Fechar">
                ×
              </button>
            </div>
            <p className="modal-field-hint">
              Estes produtos estão sem NCM{pendencias.lista.some((p) => p.precisa_cest) ? ' ou CEST' : ''} e a SEFAZ não
              aceita o cupom assim. O que você preencher fica salvo no cadastro do produto, e o cupom é emitido em seguida.
            </p>
            {pendencias.lista.map((p) => (
              <div className="modal-field" key={p.id}>
                <label htmlFor={`ncm-${p.id}`}>
                  {[p.nome, p.variacao].filter(Boolean).join(' - ')}
                  {p.artesao_nome ? ` · ${p.artesao_nome}` : ''}
                  {p.deleted_at ? ' (produto excluído)' : ''}
                </label>
                <input
                  id={`ncm-${p.id}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="NCM (8 números)"
                  value={pendencias.valores[p.id].ncm}
                  onChange={(e) => {
                    const ncm = e.target.value
                    setPendencias((prev) => ({
                      ...prev,
                      erro: '',
                      valores: { ...prev.valores, [p.id]: { ...prev.valores[p.id], ncm } },
                    }))
                  }}
                />
                {p.precisa_cest && (
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="CEST (7 números)"
                    value={pendencias.valores[p.id].cest}
                    onChange={(e) => {
                      const cest = e.target.value
                      setPendencias((prev) => ({
                        ...prev,
                        erro: '',
                        valores: { ...prev.valores, [p.id]: { ...prev.valores[p.id], cest } },
                      }))
                    }}
                  />
                )}
              </div>
            ))}
            {pendencias.erro && <p className="config-feedback error">{pendencias.erro}</p>}
            <div className="estoque-modal-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setPendencias(null)} disabled={pendencias.salvando}>
                Voltar
              </button>
              <button type="button" className="modal-submit" onClick={salvarPendenciasEEmitir} disabled={pendencias.salvando}>
                {pendencias.salvando ? 'Salvando…' : 'Salvar e emitir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {detalhe && (
        <div className="modal-overlay" onClick={() => setDetalhe(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                Venda #{detalhe.venda.id} · {formatarDataVenda(detalhe.venda.data)}
              </h3>
              <button type="button" className="modal-close" onClick={() => setDetalhe(null)} aria-label="Fechar">
                ×
              </button>
            </div>
            <table className="pdv-products-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Fornecedor</th>
                  <th>Qtd</th>
                  <th>Unitário</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.itens.map((i, idx) => (
                  <tr key={`${i.produto_id}-${idx}`}>
                    <td>
                      {[i.nome || `Produto ${i.produto_id}`, i.variacao].filter(Boolean).join(' - ')}
                      {i.produto_excluido_em && <span className="notas-entrada-cfop">produto excluído</span>}
                      {String(i.ncm || '').replace(/\D/g, '').length !== 8 && (
                        <span className="notas-entrada-cfop">sem NCM</span>
                      )}
                    </td>
                    <td>{i.artesao_nome || '—'}</td>
                    <td>{i.quantidade}</td>
                    <td>{formatarMoeda(i.preco_unitario)}</td>
                    <td>{formatarMoeda(i.quantidade * i.preco_unitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="modal-field-hint">
              {Number(detalhe.venda.desconto) > 0 && <>Desconto: {formatarMoeda(detalhe.venda.desconto)} · </>}
              Total: <strong>{formatarMoeda(detalhe.venda.valor_total)}</strong>
              {' · '}
              Pagamento:{' '}
              {(detalhe.pagamentos.length ? detalhe.pagamentos : [{ forma_pagamento: detalhe.venda.forma_pagamento, valor: detalhe.venda.valor_total }])
                .map((p) => `${FORMAS[p.forma_pagamento] || p.forma_pagamento} ${formatarMoeda(p.valor)}`)
                .join(' + ')}
              {Number(detalhe.venda.troco) > 0 && <> · Troco: {formatarMoeda(detalhe.venda.troco)}</>}
            </p>
            <p className="modal-field-hint">
              Cupom: {SITUACOES[detalhe.nota?.status || 'sem_cupom']?.label || detalhe.nota?.status}
              {detalhe.nota?.numero ? ` nº ${detalhe.nota.numero}` : ''}
            </p>
            <div className="estoque-modal-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setDetalhe(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelamento && (
        <div className="modal-overlay" onClick={() => setCancelamento(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Cancelar {cancelamento.lista.length} cupom(ns)</h3>
              <button type="button" className="modal-close" onClick={() => setCancelamento(null)} aria-label="Fechar">
                ×
              </button>
            </div>
            <p className="modal-field-hint">
              Vendas: {cancelamento.lista.map((v) => `#${v.id}`).join(', ')}.
              {cancelamento.ignoradas > 0 &&
                ` ${cancelamento.ignoradas} venda(s) marcada(s) sem cupom autorizado ou fora do prazo serão ignoradas.`}{' '}
              As vendas continuam registradas.
            </p>
            <div className="modal-field">
              <label htmlFor="justificativaLote">Motivo do cancelamento (vale para todos)</label>
              <input
                id="justificativaLote"
                type="text"
                maxLength={255}
                value={cancelamento.justificativa}
                onChange={(e) => setCancelamento((prev) => ({ ...prev, justificativa: e.target.value, erro: '' }))}
                placeholder="Ex.: venda lançada com produto errado"
              />
            </div>
            {cancelamento.erro && <p className="config-feedback error">{cancelamento.erro}</p>}
            <div className="estoque-modal-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setCancelamento(null)}>
                Voltar
              </button>
              <button type="button" className="modal-submit" onClick={confirmarCancelamento}>
                Cancelar cupons
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
