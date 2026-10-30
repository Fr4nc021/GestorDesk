import { useEffect, useState } from 'react'
import { formatarMoeda } from '../utils/formacaoPreco'
import { mensagemErro } from '../utils/erros'

const CFOPS = [
  { value: '1202', label: '1202 - Produto próprio' },
  { value: '1411', label: '1411 - Produto com ICMS-ST' },
  { value: '1918', label: '1918 - Peça consignada' },
]

const FORMAS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'pix', label: 'Pix' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
]

const CAMPOS_CLIENTE = [
  ['nome', 'Nome completo'],
  ['cpf_cnpj', 'CPF/CNPJ'],
  ['cep', 'CEP'],
  ['logradouro', 'Endereço'],
  ['numero', 'Número'],
  ['bairro', 'Bairro'],
  ['cidade', 'Cidade'],
  ['uf', 'UF'],
]

function cfopPadrao(item) {
  if (item.tipo_posse === 'proprio') return item.icms_st ? '1411' : '1202'
  return '1202'
}

/** Devolução/troca de cliente: escolhe as peças, os dados do cliente e emite a NF-e de entrada. */
export default function ModalDevolucaoCliente({ vendaId, onFechar, onConcluida }) {
  const [dados, setDados] = useState(null)
  const [quantidades, setQuantidades] = useState({})
  const [cfops, setCfops] = useState({})
  const [cliente, setCliente] = useState({ uf: 'RS' })
  const [removerCaixa, setRemoverCaixa] = useState(true)
  const [formaReembolso, setFormaReembolso] = useState('dinheiro')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    window.electronAPI
      .obterVendaParaDevolucaoCliente(vendaId)
      .then((d) => {
        setDados(d)
        setCfops(Object.fromEntries(d.itens.map((i) => [i.produto_id, cfopPadrao(i)])))
      })
      .catch((err) => setErro(mensagemErro(err, 'Erro ao carregar a venda.')))
  }, [vendaId])

  // Preenche endereço pelo CEP (ViaCEP), se houver internet.
  async function buscarCep(cep) {
    const digitos = String(cep).replace(/\D/g, '')
    if (digitos.length !== 8) return
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digitos}/json/`).then((x) => x.json())
      if (r?.erro) return
      setCliente((c) => ({
        ...c,
        logradouro: c.logradouro || r.logradouro,
        bairro: c.bairro || r.bairro,
        cidade: c.cidade || r.localidade,
        uf: r.uf || c.uf,
      }))
    } catch {
      /* sem internet: preenche à mão */
    }
  }

  const total = (dados?.itens || []).reduce(
    (s, i) => s + (Number(quantidades[i.produto_id]) || 0) * i.valor_unitario,
    0,
  )

  async function confirmar() {
    setErro('')
    setSalvando(true)
    try {
      const r = await window.electronAPI.registrarDevolucaoCliente({
        venda_id: vendaId,
        itens: dados.itens.map((i) => ({
          produto_id: i.produto_id,
          quantidade: Number(quantidades[i.produto_id]) || 0,
          cfop: cfops[i.produto_id],
        })),
        cliente,
        remover_caixa: removerCaixa,
        forma_reembolso: formaReembolso,
        motivo,
      })
      const nota = await window.electronAPI.emitirNfeDevolucaoCliente(r.id)
      onConcluida?.(
        nota?.status === 'autorizado'
          ? { tipo: 'success', texto: `Devolução registrada. NF-e nº ${nota.numero} autorizada.` }
          : {
              tipo: 'error',
              texto: `Devolução registrada, mas a NF-e não foi autorizada: ${nota?.mensagem || nota?.status}. Reenvie em NF-e de devolução.`,
            },
      )
    } catch (err) {
      setErro(mensagemErro(err, 'Erro ao registrar a devolução.'))
      setSalvando(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !salvando && onFechar()}>
      <div className="modal-content modal-devolucao-cliente" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Devolução do cliente · venda #{vendaId}</h3>
          <button type="button" className="modal-close" onClick={() => !salvando && onFechar()} aria-label="Fechar">
            ×
          </button>
        </div>
        {!dados ? (
          <p>{erro || 'Carregando...'}</p>
        ) : (
          <>
            {!dados.cupom && (
              <p className="config-feedback error">Esta venda não tem cupom autorizado: emita o cupom antes.</p>
            )}
            <table className="pdv-products-table">
              <thead>
                <tr>
                  <th>Peça</th>
                  <th>Vendidas</th>
                  <th>Devolver</th>
                  <th>CFOP</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((i) => {
                  const restante = i.quantidade - i.devolvida
                  return (
                    <tr key={i.produto_id}>
                      <td>
                        {[i.nome, i.variacao].filter(Boolean).join(' - ')} · {formatarMoeda(i.valor_unitario)}
                      </td>
                      <td>
                        {i.quantidade}
                        {i.devolvida > 0 && ` (${i.devolvida} já devolvida)`}
                      </td>
                      <td>
                        <input
                          type="number"
                          min={0}
                          max={restante}
                          value={quantidades[i.produto_id] ?? ''}
                          disabled={restante <= 0}
                          onChange={(e) =>
                            setQuantidades((q) => ({
                              ...q,
                              [i.produto_id]: Math.min(restante, Math.max(0, parseInt(e.target.value, 10) || 0)),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={cfops[i.produto_id]}
                          onChange={(e) => setCfops((c) => ({ ...c, [i.produto_id]: e.target.value }))}
                        >
                          {CFOPS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            <p className="fiscal-secao">Dados do cliente (obrigatórios na NF-e)</p>
            <div className="fiscal-grid">
              {CAMPOS_CLIENTE.map(([campo, rotulo]) => (
                <div className="modal-field" key={campo}>
                  <label htmlFor={`dev-${campo}`}>{rotulo}</label>
                  <input
                    id={`dev-${campo}`}
                    type="text"
                    value={cliente[campo] || ''}
                    maxLength={campo === 'uf' ? 2 : 80}
                    onChange={(e) => setCliente((c) => ({ ...c, [campo]: campo === 'uf' ? e.target.value.toUpperCase() : e.target.value }))}
                    onBlur={campo === 'cep' ? (e) => buscarCep(e.target.value) : undefined}
                  />
                </div>
              ))}
            </div>
            <div className="modal-field">
              <label htmlFor="dev-motivo">Motivo (opcional)</label>
              <input id="dev-motivo" type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
            <label className="fiscal-produto-st">
              <input type="checkbox" checked={removerCaixa} onChange={(e) => setRemoverCaixa(e.target.checked)} />
              Remover valor do caixa (devolver o dinheiro ao cliente)
            </label>
            {removerCaixa && (
              <div className="modal-field">
                <label htmlFor="dev-forma">Devolvido em</label>
                <select id="dev-forma" value={formaReembolso} onChange={(e) => setFormaReembolso(e.target.value)}>
                  {FORMAS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="modal-field-hint">
              As peças voltam para o estoque. Total da devolução: <strong>{formatarMoeda(total)}</strong>
            </p>
            {erro && <p className="config-feedback error">{erro}</p>}
            <div className="estoque-modal-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={onFechar} disabled={salvando}>
                Voltar
              </button>
              <button
                type="button"
                className="modal-submit"
                onClick={confirmar}
                disabled={salvando || total <= 0 || !dados.cupom}
              >
                {salvando ? 'Emitindo...' : 'Registrar e emitir NF-e'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
