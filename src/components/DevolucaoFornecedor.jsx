import { useEffect, useMemo, useState } from 'react'
import { formatarMoeda } from '../utils/formacaoPreco'
import { mensagemErro } from '../utils/erros'
import { rotuloNomeFantasia } from '../utils/artesao'

function dataBr(iso) {
  return String(iso || '').slice(0, 10).split('-').reverse().join('/')
}

/**
 * Devolução ao fornecedor (NF-e 5918) escolhendo peças de qualquer nota de remessa dele.
 * Uma NF-e só, referenciando todas as remessas de onde as peças vieram.
 */
export default function DevolucaoFornecedor({ onGerada }) {
  const [aberto, setAberto] = useState(false)
  const [artesoes, setArtesoes] = useState([])
  const [artesaoId, setArtesaoId] = useState('')
  const [pecas, setPecas] = useState([])
  const [quantidades, setQuantidades] = useState({})
  const [busca, setBusca] = useState('')
  const [observacao, setObservacao] = useState('')
  const [cfop, setCfop] = useState('5918')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' })

  useEffect(() => {
    if (!aberto) return
    window.electronAPI?.listarArtesoes?.().then((l) => setArtesoes(l || [])).catch(() => {})
  }, [aberto])

  // Sugere o CFOP pela UF do fornecedor; continua editável.
  useEffect(() => {
    const artesao = artesoes.find((a) => String(a.id) === String(artesaoId))
    if (artesao?.uf) setCfop(String(artesao.uf).toUpperCase() === 'RS' ? '5918' : '6918')
  }, [artesaoId, artesoes])

  useEffect(() => {
    setPecas([])
    setQuantidades({})
    if (!artesaoId) return
    setCarregando(true)
    window.electronAPI
      .listarPecasDevolviveisArtesao(Number(artesaoId))
      .then((l) => setPecas(l || []))
      .catch((err) => setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao carregar as peças.') }))
      .finally(() => setCarregando(false))
  }, [artesaoId])

  // Estoque é do produto: várias remessas do mesmo produto dividem o mesmo saldo.
  const maximoDe = (peca) => {
    const usadoEmOutras = pecas
      .filter((p) => p.produto_id === peca.produto_id && p.nota_item_id !== peca.nota_item_id)
      .reduce((s, p) => s + (Number(quantidades[p.nota_item_id]) || 0), 0)
    return Math.max(0, Math.min(Number(peca.restante), Number(peca.produto_estoque) - usadoEmOutras))
  }

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return pecas
    return pecas.filter((p) =>
      [p.produto_nome, p.produto_variacao, p.descricao, p.nota_numero].some((v) => String(v || '').toLowerCase().includes(termo)),
    )
  }, [pecas, busca])

  const selecionadas = pecas.filter((p) => Number(quantidades[p.nota_item_id]) > 0)
  const totalPecas = selecionadas.reduce((s, p) => s + Number(quantidades[p.nota_item_id]), 0)
  const totalValor = selecionadas.reduce((s, p) => s + Number(quantidades[p.nota_item_id]) * Number(p.valor_unitario || 0), 0)
  const remessasEnvolvidas = new Set(selecionadas.map((p) => p.nota_id)).size

  function definirQuantidade(peca, valor) {
    setQuantidades((q) => ({ ...q, [peca.nota_item_id]: String(valor).replace(/\D/g, '') }))
  }

  function fechar() {
    setAberto(false)
    setArtesaoId('')
    setBusca('')
    setObservacao('')
  }

  async function emitir() {
    const acima = selecionadas.find((p) => Number(quantidades[p.nota_item_id]) > maximoDe(p))
    if (acima) {
      setMensagem({ tipo: 'error', texto: `"${acima.produto_nome}": no máximo ${maximoDe(acima)} peça(s).` })
      return
    }
    setSalvando(true)
    setMensagem({ tipo: '', texto: '' })
    try {
      const dev = await window.electronAPI.registrarDevolucaoArtesaoAvulsa({
        artesao_id: Number(artesaoId),
        itens: selecionadas.map((p) => ({ nota_item_id: p.nota_item_id, quantidade: Number(quantidades[p.nota_item_id]) })),
        observacao: observacao.trim() || null,
        cfop,
      })
      let texto = `Devolução registrada: ${totalPecas} peça(s), ${formatarMoeda(dev.valor_total)}. As peças saíram do estoque.`
      let tipo = 'success'
      try {
        const nota = await window.electronAPI.emitirNfeDevolucao(dev.id)
        if (nota?.status === 'autorizado') texto += ` NF-e nº ${nota.numero} autorizada.`
        else if (nota?.status === 'processando_autorizacao') texto += ' NF-e em processamento na SEFAZ.'
        else {
          tipo = 'error'
          texto += ` A NF-e não foi autorizada: ${nota?.mensagem || 'confira abaixo e reenvie.'}`
        }
      } catch (err) {
        tipo = 'error'
        texto += ` Erro ao emitir a NF-e: ${mensagemErro(err, 'reenvie pela lista abaixo.')}`
      }
      fechar()
      setMensagem({ tipo, texto })
      onGerada?.()
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao registrar a devolução.') })
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) {
    return (
      <div className="devolucao-fornecedor">
        <button type="button" className="modal-submit" onClick={() => { setMensagem({ tipo: '', texto: '' }); setAberto(true) }}>
          Nova devolução ao fornecedor
        </button>
        {mensagem.texto && <p className={`config-feedback ${mensagem.tipo}`}>{mensagem.texto}</p>}
      </div>
    )
  }

  return (
    <div className="vendas-resumo-lote devolucao-fornecedor">
      <strong>Devolução ao fornecedor (CFOP 5918/6918)</strong>
      <p className="modal-field-hint">
        Escolha o fornecedor e as peças, de qualquer nota de remessa dele. Sai uma NF-e só, que referencia todas as
        remessas de onde as peças vieram.
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
        <select value={cfop} onChange={(e) => setCfop(e.target.value)} aria-label="CFOP">
          <option value="5918">5918 - Fornecedor do RS</option>
          <option value="6918">6918 - Fornecedor de outro estado</option>
        </select>
        {pecas.length > 0 && (
          <input type="search" placeholder="Buscar peça ou nº da nota" value={busca} onChange={(e) => setBusca(e.target.value)} />
        )}
      </div>

      {carregando && <p>Carregando peças...</p>}
      {artesaoId && !carregando && pecas.length === 0 && (
        <p>Nenhuma peça deste fornecedor no estoque para devolver (só entram peças de notas de remessa em consignação).</p>
      )}

      {visiveis.length > 0 && (
        <div className="produtos-table-wrapper">
          <table className="pdv-products-table">
            <thead>
              <tr>
                <th>Peça</th>
                <th>Remessa</th>
                <th>Disponível</th>
                <th>Valor unit.</th>
                <th>Devolver</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => {
                const maximo = maximoDe(p)
                return (
                  <tr key={p.nota_item_id}>
                    <td>
                      {p.produto_nome}
                      {p.produto_variacao ? ` · ${p.produto_variacao}` : ''}
                    </td>
                    <td>
                      nº {p.nota_numero || '—'}
                      {p.nota_data ? ` · ${dataBr(p.nota_data)}` : ''}
                    </td>
                    <td>{maximo}</td>
                    <td>{formatarMoeda(p.valor_unitario || 0)}</td>
                    <td>
                      <input
                        type="text"
                        inputMode="numeric"
                        style={{ width: 60 }}
                        value={quantidades[p.nota_item_id] || ''}
                        onChange={(e) => definirQuantidade(p, e.target.value)}
                        aria-label={`Quantidade de ${p.produto_nome}`}
                      />{' '}
                      <button type="button" className="link-button" onClick={() => definirQuantidade(p, maximo)} disabled={maximo === 0}>
                        todas
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pecas.length > 0 && (
        <textarea
          placeholder="Observação (opcional, vai nas informações complementares da NF-e)"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
        />
      )}

      {mensagem.texto && <p className={`config-feedback ${mensagem.tipo}`}>{mensagem.texto}</p>}

      <div className="notas-emitidas-filtro">
        <button type="button" onClick={fechar} disabled={salvando}>
          Cancelar
        </button>
        <button type="button" className="modal-submit" onClick={emitir} disabled={salvando || totalPecas === 0}>
          {salvando
            ? 'Emitindo...'
            : totalPecas > 0
              ? `Emitir NF-e: ${totalPecas} peça(s) de ${remessasEnvolvidas} remessa(s) · ${formatarMoeda(totalValor)}`
              : 'Selecione as peças'}
        </button>
      </div>
    </div>
  )
}
