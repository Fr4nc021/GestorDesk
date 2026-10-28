import { useMemo, useState } from 'react'
import { rotuloNomeFantasia, textoInclui } from '../utils/artesao'
import { TIPOS_POSSE, formatarNcm, somenteDigitos } from '../utils/fiscal'
import { mensagemErro } from '../utils/erros'

/** Preenche NCM (e, se quiser, o tipo do produto) em vários produtos de uma vez. */
export default function ModalNcmLote({ produtos, artesoes, onFechar, onAplicado }) {
  const [filtroArtesao, setFiltroArtesao] = useState('')
  const [soSemNcm, setSoSemNcm] = useState(true)
  const [busca, setBusca] = useState('')
  const [selecionados, setSelecionados] = useState(() => new Set())
  const [ncm, setNcm] = useState('')
  const [tipoPosse, setTipoPosse] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const nomeArtesao = useMemo(() => {
    const mapa = new Map()
    for (const a of artesoes) mapa.set(a.id, rotuloNomeFantasia(a.nome_fantasia, a.razao_social, a.nome))
    return mapa
  }, [artesoes])

  const lista = useMemo(
    () =>
      produtos.filter((p) => {
        if (filtroArtesao && String(p.artesao_id) !== filtroArtesao) return false
        if (soSemNcm && somenteDigitos(p.ncm).length === 8) return false
        if (busca && !textoInclui([p.nome, p.variacao, p.codigo_barras].filter(Boolean).join(' '), busca)) return false
        return true
      }),
    [produtos, filtroArtesao, soSemNcm, busca],
  )

  const todosMarcados = lista.length > 0 && lista.every((p) => selecionados.has(p.id))

  function alternar(id) {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarTodos() {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      for (const p of lista) {
        if (todosMarcados) novo.delete(p.id)
        else novo.add(p.id)
      }
      return novo
    })
  }

  async function aplicar() {
    const digitos = somenteDigitos(ncm)
    if (digitos.length !== 8) {
      setErro('O NCM precisa ter 8 números.')
      return
    }
    if (selecionados.size === 0) {
      setErro('Marque pelo menos um produto.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const total = await window.electronAPI.atualizarFiscalEmLote([...selecionados], {
        ncm: digitos,
        tipo_posse: tipoPosse || null,
      })
      onAplicado(total)
    } catch (err) {
      setErro(mensagemErro(err, 'Não foi possível salvar o NCM.'))
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !salvando && onFechar()}>
      <div className="modal-content modal-etiquetas" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>NCM em lote</h3>
          <button type="button" className="modal-close" onClick={() => !salvando && onFechar()} aria-label="Fechar">
            ×
          </button>
        </div>
        <div className="modal-etiquetas-body">
          <p className="modal-field-hint">
            Marque os produtos e informe o NCM. Use o mesmo NCM da nota do artesão; na dúvida, confirme com a contadora.
          </p>
          <div className="ncm-lote-filtros">
            <select value={filtroArtesao} onChange={(e) => setFiltroArtesao(e.target.value)} aria-label="Fornecedor">
              <option value="">Todos os fornecedores</option>
              {artesoes.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {nomeArtesao.get(a.id)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar produto..."
              aria-label="Buscar produto"
            />
            <label className="ncm-lote-check">
              <input type="checkbox" checked={soSemNcm} onChange={(e) => setSoSemNcm(e.target.checked)} />
              Só os sem NCM
            </label>
          </div>

          <div className="ncm-lote-lista">
            <label className="ncm-lote-item ncm-lote-todos">
              <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} disabled={lista.length === 0} />
              <span>Marcar todos ({lista.length})</span>
            </label>
            {lista.length === 0 ? (
              <p className="modal-field-hint">Nenhum produto com esses filtros.</p>
            ) : (
              lista.map((p) => (
                <label key={p.id} className="ncm-lote-item">
                  <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternar(p.id)} />
                  <span className="ncm-lote-nome">
                    {[p.nome, p.variacao].filter(Boolean).join(' - ')}
                    <small>{nomeArtesao.get(p.artesao_id) || 'Sem fornecedor'}</small>
                  </span>
                  <span className="ncm-lote-atual">{p.ncm ? formatarNcm(p.ncm) : 'sem NCM'}</span>
                </label>
              ))
            )}
          </div>

          <div className="ncm-lote-aplicar">
            <div className="modal-field">
              <label htmlFor="ncmLote">NCM</label>
              <input
                id="ncmLote"
                type="text"
                inputMode="numeric"
                value={formatarNcm(ncm)}
                onChange={(e) => {
                  setNcm(somenteDigitos(e.target.value).slice(0, 8))
                  setErro('')
                }}
                placeholder="0000.00.00"
              />
            </div>
            <div className="modal-field">
              <label htmlFor="tipoLote">Tipo do produto</label>
              <select id="tipoLote" value={tipoPosse} onChange={(e) => setTipoPosse(e.target.value)}>
                <option value="">Manter como está</option>
                {TIPOS_POSSE.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {erro && <p className="config-feedback error">{erro}</p>}
        </div>
        <div className="estoque-modal-acoes">
          <button type="button" className="modal-btn-cancelar" onClick={onFechar} disabled={salvando}>
            Cancelar
          </button>
          <button type="button" className="modal-submit" onClick={aplicar} disabled={salvando}>
            {salvando ? 'Salvando...' : `Aplicar em ${selecionados.size} produto(s)`}
          </button>
        </div>
      </div>
    </div>
  )
}
