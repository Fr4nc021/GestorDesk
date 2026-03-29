import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import codeIcon from '../assets/complements/code.png'
import ProdutoSearchModal from '../components/ProdutoSearchModal'
import { recoverInputFocus } from '../utils/focusRecovery'

const FORMAS_PAGAMENTO = [
  { id: 'credito', label: 'Cartão de Crédito', icon: 'credit' },
  { id: 'debito', label: 'Cartão de Débito', icon: 'credit' },
  { id: 'pix', label: 'PIX', icon: 'pix' },
  { id: 'dinheiro', label: 'Dinheiro', icon: 'money' },
]

function formatBRL(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val ?? 0)
}

/** Parse de valor monetário digitado (pt-BR: vírgula decimal; pontos como milhar). */
function parseDecimalBR(str) {
  const s = String(str ?? '').trim()
  if (!s) return 0
  let normalized = s
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.')
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

/** Centavos inteiros para comparar valores em R$ sem erro de ponto flutuante. */
function centavosBRL(n) {
  const x = Number(n)
  if (!Number.isFinite(x)) return 0
  return Math.round(x * 100 + Number.EPSILON)
}

/** Campo vazio = cliente pagou o valor exato (sem troco). */
function valorRecebidoEfetivoDinheiro(valorRecebidoStr, totalVenda) {
  const s = String(valorRecebidoStr ?? '').trim()
  if (!s) return totalVenda
  return parseDecimalBR(s)
}

function avaliarEstoqueParaAdicionar(produto, itens, vendaEdicaoId) {
  const qNoCarrinho = itens.find((i) => i.id === produto.id)?.quantidade ?? 0
  const estoqueAtual = produto.estoque ?? 0
  const maxPermitido = estoqueAtual + (vendaEdicaoId ? qNoCarrinho : 0)
  if (qNoCarrinho + 1 > maxPermitido) {
    return { permitido: false, toastErro: { tipo: 'erro', mensagem: 'Produto sem estoque disponível.' } }
  }
  const alertaUltimoItem = maxPermitido - qNoCarrinho <= 1
  return {
    permitido: true,
    toastAlerta: alertaUltimoItem
      ? { tipo: 'alerta', mensagem: 'Atenção: este é o último item em estoque.' }
      : null,
  }
}

export default function PDV() {
  const location = useLocation()
  const navigate = useNavigate()
  const [codigoInput, setCodigoInput] = useState('')
  const [itens, setItens] = useState([])
  const [tipoDesconto, setTipoDesconto] = useState('valor')
  const [descontoInput, setDescontoInput] = useState('')
  const [formasSelecionadas, setFormasSelecionadas] = useState([])
  const [valoresPorForma, setValoresPorForma] = useState({})
  const [showModalPagamento, setShowModalPagamento] = useState(false)
  const [showModalPesquisa, setShowModalPesquisa] = useState(false)
  const [valorRecebido, setValorRecebido] = useState('')
  const [vendaEdicaoId, setVendaEdicaoId] = useState(null)
  const inputRef = useRef(null)
  const finalizarRef = useRef(null)
  const [toast, setToast] = useState(null)
  const [voltarRelatorios, setVoltarRelatorios] = useState(false)

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (location.state?.relatoriosRestore) {
      setVoltarRelatorios(true)
    }
    const rawId = location.state?.editarVendaId
    if (rawId == null) return
    const id = Number(rawId)
    if (!Number.isFinite(id)) return

    let cancelled = false
    ;(async () => {
      try {
        const v = await window.electronAPI.obterVendaParaEdicao(id)
        if (cancelled) return
        if (!v?.itens?.length) {
          alert('Venda não encontrada ou sem itens.')
          return
        }
        setVendaEdicaoId(id)
        setItens(
          v.itens.map((row) => ({
            id: row.produto_id,
            nome: row.nome,
            codigo_barras: row.codigo_barras,
            preco_venda: row.preco_unitario,
            quantidade: row.quantidade,
            estoque: row.estoque,
          })),
        )
        const forms = v.pagamentos.map((p) => p.forma_pagamento)
        setFormasSelecionadas(forms)
        const sub = v.itens.reduce((a, r) => a + r.preco_unitario * r.quantidade, 0)
        const descValor = sub - (v.valor_total ?? 0)
        if (descValor > 0.009) {
          setTipoDesconto('valor')
          setDescontoInput(String(Number(descValor.toFixed(2))).replace('.', ','))
        } else {
          setTipoDesconto('valor')
          setDescontoInput('')
        }
        if (forms.length > 1) {
          const valoresIniciaisPorForma = {}
          for (const p of v.pagamentos) {
            valoresIniciaisPorForma[p.forma_pagamento] = String(Number(p.valor).toFixed(2)).replace('.', ',')
          }
          setValoresPorForma(valoresIniciaisPorForma)
          setValorRecebido('')
        } else {
          setValoresPorForma({})
          const formaUnica = forms[0]
          if (formaUnica === 'dinheiro' && v.pagamentos[0]) {
            setValorRecebido(String(Number(v.pagamentos[0].valor).toFixed(2)).replace('.', ','))
          } else {
            setValorRecebido('')
          }
        }
        navigate('.', { replace: true, state: {} })
      } catch (err) {
        console.error(err)
        alert('Erro ao carregar venda para edição.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [location.state, navigate])

  function adicionarItemNaVenda(produto) {
    if (!produto) return
    setItens((prev) => {
      const existe = prev.find((i) => i.id === produto.id)
      const quantidadeAtual = existe ? existe.quantidade : 0
      const maxQ = (produto.estoque ?? 0) + (vendaEdicaoId ? quantidadeAtual : 0)
      if (quantidadeAtual + 1 > maxQ) {
        return prev
      }
      if (existe) {
        return prev.map((i) =>
          i.id === produto.id ? { ...i, quantidade: i.quantidade + 1 } : i
        )
      }
      return [...prev, { ...produto, quantidade: 1 }]
    })
  }

  async function buscarProdutoPorCodigo(codigo) {
    const codigoTrim = String(codigo || '').trim()
    if (!codigoTrim) return
    try {
      const produto = await window.electronAPI.buscarProdutoPorCodigo(codigoTrim)
      if (!produto) {
        alert('Produto não encontrado')
        return
      }
      const aval = avaliarEstoqueParaAdicionar(produto, itens, vendaEdicaoId)
      if (!aval.permitido) {
        setToast(aval.toastErro)
        return
      }
      if (aval.toastAlerta) setToast(aval.toastAlerta)
      adicionarItemNaVenda(produto)
      setCodigoInput('')
      inputRef.current?.focus()
    } catch (err) {
      console.error(err)
      alert('Erro ao buscar produto')
    }
  }

  function selecionarProduto(produto) {
    if (!produto) return
    const aval = avaliarEstoqueParaAdicionar(produto, itens, vendaEdicaoId)
    if (!aval.permitido) {
      setToast(aval.toastErro)
      return
    }
    if (aval.toastAlerta) setToast(aval.toastAlerta)
    adicionarItemNaVenda(produto)
    setShowModalPesquisa(false)
    inputRef.current?.focus()
  }

  async function handleBuscarProduto() {
    const codigo = codigoInput.trim()
    if (codigo) {
      await buscarProdutoPorCodigo(codigo)
    } else {
      setShowModalPesquisa(true)
    }
  }

  function handleBuscarProdutoPorEnter() {
    const codigo = codigoInput.trim()
    if (!codigo) return
    buscarProdutoPorCodigo(codigo)
  }

  function handleRemoverItem(id) {
    setItens((prev) => prev.filter((i) => i.id !== id))
  }

  async function handleAlterarQtd(id, delta) {
    if (delta > 0) {
      const item = itens.find((i) => i.id === id)
      if (!item) return
      const codigo = String(item.codigo_barras || '').trim()
      if (!codigo) {
        setToast({ tipo: 'erro', mensagem: 'Não foi possível validar o estoque deste item.' })
        return
      }
      try {
        const prod = await window.electronAPI.buscarProdutoPorCodigo(codigo)
        if (!prod) {
          setToast({ tipo: 'erro', mensagem: 'Produto não encontrado.' })
          return
        }
        const novaQuantidade = item.quantidade + delta
        const maxQ = (prod.estoque ?? 0) + (vendaEdicaoId ? item.quantidade : 0)
        if (novaQuantidade > maxQ) {
          setToast({ tipo: 'erro', mensagem: 'Estoque insuficiente.' })
          return
        }
      } catch (err) {
        console.error(err)
        setToast({ tipo: 'erro', mensagem: 'Erro ao validar estoque.' })
        return
      }
    }
    setItens((prev) =>
      prev
        .map((i) => {
          if (i.id !== id) return i
          const novaQuantidade = Math.max(0, i.quantidade + delta)
          return novaQuantidade === 0 ? null : { ...i, quantidade: novaQuantidade }
        })
        .filter(Boolean),
    )
  }

  function handleFinalizarVenda() {
    if (itens.length === 0) {
      alert('Adicione itens à venda')
      return
    }
    if (formasSelecionadas.length === 0) {
      alert('Selecione pelo menos uma forma de pagamento')
      return
    }
    setShowModalPagamento(true)
  }

  function fecharModalPagamentoERestaurarFoco() {
    setValorRecebido('')
    setValoresPorForma({})
    setShowModalPagamento(false)
    queueMicrotask(() => {
      inputRef.current?.focus()
      if (document.activeElement !== inputRef.current) recoverInputFocus()
    })
  }

  async function handleConfirmarPagamento() {
    if (formasSelecionadas.length === 0) {
      alert('Selecione pelo menos uma forma de pagamento.')
      return
    }

    if (formasSelecionadas.length > 1) {
      const faltaAlgumValor = formasSelecionadas.some((id) => !valoresPorForma[id])
      if (faltaAlgumValor) {
        alert('Informe o valor pago em cada forma de pagamento selecionada.')
        return
      }

      const somaPagamentos = formasSelecionadas.reduce((acc, formaId) => {
        return acc + parseDecimalBR(valoresPorForma[formaId])
      }, 0)

      if (centavosBRL(somaPagamentos) < centavosBRL(total)) {
        alert('A soma dos valores das formas de pagamento é menor que o total da venda.')
        return
      }
    } else if (formasSelecionadas.length === 1) {
      const unica = formasSelecionadas[0]
      if (unica === 'dinheiro') {
        const valorRecebidoNumerico = valorRecebidoEfetivoDinheiro(valorRecebido, total)
        if (centavosBRL(valorRecebidoNumerico) < centavosBRL(total)) {
          alert('Valor recebido é menor que o total da venda.')
          return
        }
      }
    }

    const formaPrincipal = formasSelecionadas[0] || null
    const pagamentos = formasSelecionadas.length > 1
      ? formasSelecionadas.map((formaId) => ({
          forma: formaId,
          valor: parseDecimalBR(valoresPorForma[formaId]),
        }))
      : [
          {
            forma: formaPrincipal,
            valor: total,
          },
        ]

    try {
      const payload = {
        itens: itens.map((i) => ({
          produto_id: i.id,
          quantidade: i.quantidade,
          preco_unitario: i.preco_venda,
        })),
        forma_pagamento: formaPrincipal,
        valor_total: total,
        pagamentos,
      }
      if (vendaEdicaoId != null) {
        await window.electronAPI.atualizarVenda(vendaEdicaoId, payload)
        setToast({ tipo: 'sucesso', mensagem: 'Venda atualizada com sucesso.' })
      } else {
        await window.electronAPI.criarVenda(payload)
      }
      setShowModalPagamento(false)
      setItens([])
      setDescontoInput('')
      setFormasSelecionadas([])
      setValoresPorForma({})
      setValorRecebido('')
      setVendaEdicaoId(null)
      queueMicrotask(() => {
        inputRef.current?.focus()
        if (document.activeElement !== inputRef.current) recoverInputFocus()
      })
    } catch (err) {
      console.error('[PDV] Erro ao finalizar venda:', err)
      alert('Erro ao finalizar venda')
      fecharModalPagamentoERestaurarFoco()
    }
  }

  function handleCancelar() {
    setItens([])
    setDescontoInput('')
    setFormasSelecionadas([])
    setValoresPorForma({})
    setValorRecebido('')
    setVendaEdicaoId(null)
    inputRef.current?.focus()
  }

  finalizarRef.current = handleFinalizarVenda
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'F1') return
      const target = e.target
      if (target && typeof target.closest === 'function') {
        if (target.closest('.modal-overlay, .modal-content')) return
      }
      e.preventDefault()
      finalizarRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const subtotal = itens.reduce((acc, i) => acc + i.preco_venda * i.quantidade, 0)
  const valorDesconto = parseDecimalBR(descontoInput)
  const desconto = tipoDesconto === 'percent'
    ? subtotal * (Math.min(100, Math.max(0, valorDesconto)) / 100)
    : Math.max(0, Math.min(valorDesconto, subtotal))
  const total = Math.round(Math.max(0, subtotal - desconto) * 100) / 100

  const formaPrincipal = formasSelecionadas[0] || null
  const valorRecebidoNum =
    formasSelecionadas.length === 1 && formaPrincipal === 'dinheiro'
      ? valorRecebidoEfetivoDinheiro(valorRecebido, total)
      : parseDecimalBR(valorRecebido)
  const troco =
    formasSelecionadas.length === 1 && formaPrincipal === 'dinheiro'
      ? Math.max(valorRecebidoNum - total, 0)
      : 0

  function handleVoltarRelatorios() {
    navigate('/app/relatorios')
  }

  return (
    <div>
      {(vendaEdicaoId != null || voltarRelatorios) && (
        <div className="pdv-edit-banner-row">
          {vendaEdicaoId != null && (
            <div className="pdv-edit-banner" role="status">
              Editando venda #{String(vendaEdicaoId).padStart(4, '0')}. Ao salvar, a data e hora originais do lançamento são mantidas.
            </div>
          )}
          {voltarRelatorios && (
            <button type="button" className="pdv-voltar-relatorios" onClick={handleVoltarRelatorios}>
              ← Voltar aos relatórios
            </button>
          )}
        </div>
      )}
      <div className="pdv-product-bar">
        <div className="pdv-search-input-wrapper">
          <img src={codeIcon} alt="" className="pdv-input-icon" />
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            className="pdv-search-input"
            placeholder="Escaneie ou digite o código de barras"
            value={codigoInput}
            onChange={(e) => {
              const somenteNumeros = e.target.value.replace(/\D/g, '')
              setCodigoInput(somenteNumeros)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleBuscarProdutoPorEnter()
              }
            }}
            autoFocus
          />
        </div>
        <button type="button" className="pdv-search-btn" onClick={handleBuscarProduto}>
          <svg className="pdv-btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span>Pesquisar produto</span>
        </button>
      </div>

      <div className="pdv-main">
        <div className="pdv-products-area">
          <table className="pdv-products-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Produto</th>
                <th>Preço Unit.</th>
                <th>Qtd</th>
                <th>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, idx) => (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>
                    <div>{item.nome}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{item.codigo_barras}</div>
                  </td>
                  <td>{formatBRL(item.preco_venda)}</td>
                  <td>
                    <button type="button" onClick={() => void handleAlterarQtd(item.id, -1)}>−</button>
                    <span style={{ margin: '0 8px' }}>{item.quantidade}</span>
                    <button type="button" onClick={() => void handleAlterarQtd(item.id, 1)}>+</button>
                  </td>
                  <td>{formatBRL(item.preco_venda * item.quantidade)}</td>
                  <td>
                    <button type="button" onClick={() => handleRemoverItem(item.id)} title="Remover">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="pdv-empty-state" style={{ display: itens.length === 0 ? 'flex' : 'none' }}>
            <svg className="pdv-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <p className="pdv-empty-title">Caixa Livre</p>
            <p className="pdv-empty-text">Escaneie um produto para iniciar a venda</p>
          </div>
        </div>

        <aside className="pdv-sidebar">
          <section className="pdv-resumo">
            <h3>Resumo da Venda</h3>
            <p>Subtotal: <span>{formatBRL(subtotal)}</span></p>
            <p className="pdv-desconto">Desconto: <span>- {formatBRL(desconto)}</span></p>
            <p className="pdv-total">Total: <span>{formatBRL(total)}</span></p>
            <div className="pdv-desconto-input">
              <span className="pdv-desconto-label">Desconto</span>
              <div className="pdv-desconto-tipo">
                <button
                  type="button"
                  className={tipoDesconto === 'valor' ? 'active' : ''}
                  onClick={() => setTipoDesconto('valor')}
                >
                  R$
                </button>
                <button
                  type="button"
                  className={tipoDesconto === 'percent' ? 'active' : ''}
                  onClick={() => setTipoDesconto('percent')}
                >
                  %
                </button>
              </div>
              <input
                type="text"
                placeholder={tipoDesconto === 'valor' ? 'Valor em R$' : 'Percentual (ex: 10)'}
                value={descontoInput}
                onChange={(e) => setDescontoInput(e.target.value)}
              />
            </div>
          </section>

          <section className="pdv-pagamento">
            <div className="pdv-pagamento-header">
              <h3>Forma de Pagamento</h3>
              <button
                type="button"
                className="pdv-pagamento-multiplas"
                title="Use mais de uma forma na mesma venda"
              >
                Múltiplas formas
              </button>
            </div>
            <div className="pdv-pagamento-btns">
              {FORMAS_PAGAMENTO.map((fp) => {
                const ativa = formasSelecionadas.includes(fp.id)
                return (
                  <button
                    key={fp.id}
                    type="button"
                    className={ativa ? 'active' : ''}
                    onClick={() => {
                      setFormasSelecionadas((prev) =>
                        prev.includes(fp.id)
                          ? prev.filter((id) => id !== fp.id)
                          : [...prev, fp.id]
                      )
                    }}
                  >
                    <span className="pdv-pagamento-icon">
                      {fp.icon === 'credit' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                          <line x1="1" y1="10" x2="23" y2="10" />
                        </svg>
                      )}
                      {fp.icon === 'pix' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                        </svg>
                      )}
                      {fp.icon === 'money' && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="12" y1="1" x2="12" y2="23" />
                          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                      )}
                    </span>
                    {fp.label}
                  </button>
                )
              })}
            </div>
          </section>

          {formasSelecionadas.length === 1 && formasSelecionadas[0] === 'dinheiro' && (
            <section className="pdv-troco">
              <h3>Troco</h3>
              <div className="pdv-troco-field">
                <label>
                  Valor recebido
                  <input
                    type="text"
                    inputMode="decimal"
                    className="pdv-troco-input"
                    placeholder="0,00"
                    value={valorRecebido}
                    onChange={(e) => setValorRecebido(e.target.value)}
                  />
                </label>
              </div>
              <p className="pdv-troco-resultado">
                Troco a devolver:{' '}
                <span>{formatBRL(troco)}</span>
              </p>
            </section>
          )}

          <div className="pdv-actions">
            <button type="button" className="pdv-finalizar" onClick={handleFinalizarVenda}>
              {vendaEdicaoId != null ? 'Salvar alterações (F1)' : 'Finalizar venda (F1)'}
            </button>
            <button type="button" className="pdv-cancelar" onClick={handleCancelar}>
              Cancelar
            </button>
          </div>
        </aside>
      </div>

      {showModalPagamento && (
        <div
          className="modal-overlay"
          onClick={fecharModalPagamentoERestaurarFoco}
        >
          <div className="modal-content pdv-modal-pagamento" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pdv-modal-close"
              onClick={fecharModalPagamentoERestaurarFoco}
              aria-label="Fechar"
            >
              ×
            </button>
            <h2 className="pdv-modal-title">Pagamento</h2>
            <p className="pdv-modal-total-label">Total a pagar</p>
            <p className="pdv-modal-total-valor">{formatBRL(total)}</p>
            {formasSelecionadas.length === 1 && formasSelecionadas[0] === 'dinheiro' && (
              <div className="pdv-modal-dinheiro">
                <p className="pdv-modal-dinheiro-label">Valor recebido em dinheiro</p>
                <p className="pdv-modal-dinheiro-hint">
                  Deixe em branco se o cliente pagou o valor exato (sem troco).
                </p>
                <input
                  type="text"
                  inputMode="decimal"
                  className="pdv-modal-dinheiro-input"
                  placeholder={String(total.toFixed(2)).replace('.', ',')}
                  value={valorRecebido}
                  onChange={(e) => setValorRecebido(e.target.value)}
                  autoFocus
                />
              </div>
            )}
            {formasSelecionadas.length > 1 && (
              <div className="pdv-modal-multiplos">
                <p style={{ marginTop: 16, marginBottom: 8 }}>
                  Informe quanto será pago em cada forma:
                </p>

                {formasSelecionadas.map((formaId) => {
                  const forma = FORMAS_PAGAMENTO.find((f) => f.id === formaId)
                  const valorStr = valoresPorForma[formaId] ?? ''

                  return (
                    <div key={formaId} className="pdv-modal-forma-row">
                      <span>{forma?.label ?? formaId}</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0,00"
                        value={valorStr}
                        onChange={(e) => {
                          const novoValor = e.target.value
                          setValoresPorForma((prev) => ({
                            ...prev,
                            [formaId]: novoValor,
                          }))
                        }}
                      />
                    </div>
                  )
                })}

                <p style={{ marginTop: 8 }}>
                  Soma das formas:{' '}
                  {formatBRL(
                    formasSelecionadas.reduce((acc, formaId) => {
                      return acc + parseDecimalBR(valoresPorForma[formaId])
                    }, 0)
                  )}
                </p>
              </div>
            )}
            <div className="pdv-modal-actions">
              <button
                type="button"
                className="pdv-modal-cancelar"
                onClick={fecharModalPagamentoERestaurarFoco}
              >
                Cancelar
              </button>
              <button type="button" className="pdv-modal-confirmar" onClick={handleConfirmarPagamento}>
                {vendaEdicaoId != null ? 'Salvar venda' : 'Confirmar Pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`pdv-toast pdv-toast-${toast.tipo}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="20"
            height="20"
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {toast.mensagem}
        </div>
      )}
      <ProdutoSearchModal
        open={showModalPesquisa}
        onClose={() => {
          setShowModalPesquisa(false)
          queueMicrotask(() => {
            inputRef.current?.focus()
            if (document.activeElement !== inputRef.current) recoverInputFocus()
          })
        }}
        onSelect={selecionarProduto}
      />
    </div>
  )
}
