import { useEffect, useState } from 'react'
import { formatarMoeda } from '../utils/formacaoPreco'
import { mensagemErro } from '../utils/erros'
import { rotuloNomeFantasia } from '../utils/artesao'

const CFOPS = [
  { value: '5919', label: '5919 - Fornecedor do RS' },
  { value: '6919', label: '6919 - Fornecedor de outro estado' },
]

function mesPassado() {
  const hoje = new Date()
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return [iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0))]
}

/**
 * Devolução simbólica (NF-e 5919/6919) das peças consignadas vendidas no período.
 * Gera uma devolução por nota de remessa; a NF-e é emitida na lista logo abaixo.
 */
export default function DevolucaoSimbolica({ onGerada }) {
  const [artesoes, setArtesoes] = useState([])
  const [artesaoId, setArtesaoId] = useState('')
  const [[dataInicio, dataFim], setPeriodo] = useState(mesPassado)
  const [base, setBase] = useState('remessa')
  const [cfop, setCfop] = useState('5919')
  const [previa, setPrevia] = useState(null)
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' })
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    window.electronAPI?.listarArtesoes?.().then((l) => setArtesoes(l || [])).catch(() => {})
  }, [])

  useEffect(() => {
    const artesao = artesoes.find((a) => String(a.id) === String(artesaoId))
    if (artesao?.uf) setCfop(String(artesao.uf).toUpperCase() === 'RS' ? '5919' : '6919')
  }, [artesaoId, artesoes])

  useEffect(() => {
    setPrevia(null)
    if (!artesaoId) return
    window.electronAPI
      .calcularDevolucaoSimbolica({ artesao_id: Number(artesaoId), dataInicio, dataFim, base })
      .then(setPrevia)
      .catch((err) => setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao calcular.') }))
  }, [artesaoId, dataInicio, dataFim, base])

  async function gerar() {
    setSalvando(true)
    setMensagem({ tipo: '', texto: '' })
    try {
      const criadas = await window.electronAPI.registrarDevolucaoSimbolica({
        artesao_id: Number(artesaoId),
        dataInicio,
        dataFim,
        base,
        cfop,
      })
      for (const d of criadas) await window.electronAPI.emitirNfeDevolucao(d.id)
      setMensagem({ tipo: 'success', texto: `${criadas.length} NF-e de devolução simbólica enviada(s). Confira a situação abaixo.` })
      setArtesaoId('')
      onGerada?.()
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao gerar a devolução simbólica.') })
    } finally {
      setSalvando(false)
    }
  }

  const total = previa?.grupos.reduce((s, g) => s + g.valor_total, 0) || 0

  return (
    <div className="vendas-resumo-lote devolucao-simbolica">
      <strong>Devolução simbólica das peças consignadas vendidas (CFOP 5919/6919)</strong>
      <p className="modal-field-hint">
        Ao vender uma peça consignada, a loja devolve ela "no papel" ao artesão. Escolha o fornecedor e o período das
        vendas: o sistema monta uma NF-e por nota de remessa.
      </p>
      <div className="notas-emitidas-filtro">
        <select value={artesaoId} onChange={(e) => setArtesaoId(e.target.value)} aria-label="Fornecedor">
          <option value="">Fornecedor...</option>
          {artesoes.map((a) => (
            <option key={a.id} value={a.id}>
              {rotuloNomeFantasia(a.nome_fantasia, a.razao_social, a.nome, `#${a.id}`)}
            </option>
          ))}
        </select>
        <input type="date" value={dataInicio} onChange={(e) => setPeriodo([e.target.value, dataFim])} aria-label="De" />
        <span>a</span>
        <input type="date" value={dataFim} onChange={(e) => setPeriodo([dataInicio, e.target.value])} aria-label="Até" />
        <select value={base} onChange={(e) => setBase(e.target.value)} aria-label="Valor">
          <option value="remessa">Valor da nota de remessa</option>
          <option value="venda">Preço de venda</option>
        </select>
        <select value={cfop} onChange={(e) => setCfop(e.target.value)} aria-label="CFOP">
          {CFOPS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {previa && (
        <div className="devolucao-simbolica-previa">
          {previa.grupos.length === 0 ? (
            <p>Nenhuma peça consignada deste fornecedor vendida no período.</p>
          ) : (
            <ul>
              {previa.grupos.map((g) => (
                <li key={g.nota_entrada_id}>
                  Remessa nº {g.nota_numero || '—'}: {g.itens.reduce((s, i) => s + i.quantidade, 0)} peça(s) ·{' '}
                  {formatarMoeda(g.valor_total)}
                </li>
              ))}
            </ul>
          )}
          {previa.sem_remessa.length > 0 && (
            <p className="config-feedback error">
              Sem nota de remessa (ficam de fora): {previa.sem_remessa.map((s) => `${s.nome} x${s.quantidade}`).join(', ')}
            </p>
          )}
          {previa.grupos.length > 0 && (
            <button type="button" className="modal-submit" onClick={gerar} disabled={salvando}>
              {salvando ? 'Emitindo...' : `Emitir ${previa.grupos.length} NF-e (${formatarMoeda(total)})`}
            </button>
          )}
        </div>
      )}
      {mensagem.texto && <p className={`config-feedback ${mensagem.tipo}`}>{mensagem.texto}</p>}
    </div>
  )
}
