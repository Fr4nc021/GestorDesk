import { useState, useRef, useEffect } from 'react'
import codeIcon from '../assets/complements/code.png'
import ProdutoSearchModal from '../components/ProdutoSearchModal'


function formatBRL(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val ?? 0)
}

export default function PDV() {
  const [codigoInput, setCodigoInput] = useState('')
  const [itens, setItens] = useState([])
  const [tipoDesconto, setTipoDesconto] = useState('valor') // 'valor' ou 'percent'
  const [descontoInput, setDescontoInput] = useState('')
  const [formasSelecionadas, setFormasSelecionadas] = useState([]) // ['credito','pix',...]
  const [valoresPorForma, setValoresPorForma] = useState({}) // { credito: '50', pix: '20' }
  const [showModalPagamento, setShowModalPagamento] = useState(false)
  const [showModalPesquisa, setShowModalPesquisa] = useState(false)
  const [valorRecebido, setValorRecebido] = useState('')
  const inputRef = useRef(null)
  const finalizarRef = useRef(null)
  const [toast, setToast] = useState(null) // ex: { mensagem: '...', tipo: 'sucesso' }

  const FORMAS_PAGAMENTO = [
    { id: 'credito', label: 'Cartão de Crédito', icon: 'credit' },
    { id: 'debito', label: 'Cartão de Débito', icon: 'credit' },
    { id: 'pix', label: 'PIX', icon: 'pix' },
    { id: 'dinheiro', label: 'Dinheiro', icon: 'money' },
  ]

  function adicionarItemNaVenda(produto) {
    if (!produto) return
    setItens((prev) => {
      const existe = prev.find((i) => i.id === produto.id)
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
      adicionarItemNaVenda(produto)
      setCodigoInput('')
      inputRef.current?.focus()
    } catch (err) {
      console.error(err)
      alert('Erro ao buscar produto')
    }
  }

  function abrirModalPesquisa() {
    setShowModalPesquisa(true)
  }

  function selecionarProduto(produto) {
    if (!produto) return
    if ((produto.estoque ?? 0) <= 0) {
      alert('Produto sem estoque disponível.')
      return
    }
    adicionarItemNaVenda(produto)
    setShowModalPesquisa(false)
    inputRef.current?.focus()
  }

  async function handleBuscarProduto() {
    const codigo = codigoInput.trim()
    if (codigo) {
      await buscarProdutoPorCodigo(codigo)
    } else {
      abrirModalPesquisa()
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

  function handleAlterarQtd(id, delta) {
    setItens((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i
        const nova = Math.max(0, i.quantidade + delta)
        return nova === 0 ? null : { ...i, quantidade: nova }
      }).filter(Boolean)
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
        const valor = parseFloat(String(valoresPorForma[formaId]).replace(',', '.')) || 0
        return acc + valor
      }, 0)

      if (somaPagamentos < total) {
        alert('A soma dos valores das formas de pagamento é menor que o total da venda.')
        return
      }
    } else if (formasSelecionadas.length === 1) {
      const unica = formasSelecionadas[0]
      if (unica === 'dinheiro') {
        const valorRecebidoNumLocal = parseFloat(String(valorRecebido).replace(',', '.')) || 0
        if (valorRecebidoNumLocal < total) {
          alert('Valor recebido é menor que o total da venda.')
          return
        }
      }
    }

    const formaPrincipal = formasSelecionadas[0] || null
    const pagamentos = formasSelecionadas.length > 1
      ? formasSelecionadas.map((formaId) => ({
          forma: formaId,
          valor: parseFloat(String(valoresPorForma[formaId]).replace(',', '.')) || 0,
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
      await window.electronAPI.criarVenda(payload)
      setShowModalPagamento(false)
      setItens([])
      setDescontoInput('')
      setFormasSelecionadas([])
      setValoresPorForma({})
      setValorRecebido('')
      inputRef.current?.focus()
    } catch (err) {
      console.error(err)
      alert('Erro ao finalizar venda')
    }
  }

  function handleCancelar() {
    setItens([])
    setDescontoInput('')
    setFormasSelecionadas([])
    setValoresPorForma({})
    setValorRecebido('')
    inputRef.current?.focus()
  }

  finalizarRef.current = handleFinalizarVenda
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'F1') {
        e.preventDefault()
        finalizarRef.current?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const subtotal = itens.reduce((acc, i) => acc + i.preco_venda * i.quantidade, 0)
  const valorDesconto = parseFloat(String(descontoInput).replace(',', '.')) || 0
  const desconto = tipoDesconto === 'percent'
    ? subtotal * (Math.min(100, Math.max(0, valorDesconto)) / 100)
    : Math.max(0, Math.min(valorDesconto, subtotal))
  const total = Math.max(0, subtotal - desconto)

  const valorRecebidoNum = parseFloat(String(valorRecebido).replace(',', '.')) || 0
  const formaPrincipal = formasSelecionadas[0] || null
  const troco = formasSelecionadas.length === 1 && formaPrincipal === 'dinheiro'
    ? Math.max(valorRecebidoNum - total, 0)
    : 0

  return (
    <div>
      <div className="pdv-product-bar">
        <div className="pdv-search-input-wrapper">
          <img src={codeIcon} alt="" className="pdv-input-icon" />
          <input
            ref={inputRef}
            type="text"
            className="pdv-search-input"
            placeholder="Escaneie ou digite o código de barras"
            value={codigoInput}
            onChange={(e) => setCodigoInput(e.target.value)}
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
                    <button type="button" onClick={() => handleAlterarQtd(item.id, -1)}>−</button>
                    <span style={{ margin: '0 8px' }}>{item.quantidade}</span>
                    <button type="button" onClick={() => handleAlterarQtd(item.id, 1)}>+</button>
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
              Finalizar venda (F1)
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
          onClick={() => {
            setValorRecebido('')
            setValoresPorForma({})
            setShowModalPagamento(false)
          }}
        >
          <div className="modal-content pdv-modal-pagamento" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="pdv-modal-close"
              onClick={() => {
                setValorRecebido('')
                setValoresPorForma({})
                setShowModalPagamento(false)
              }}
              aria-label="Fechar"
            >
              ×
            </button>
            <h2 className="pdv-modal-title">Pagamento</h2>
            <p className="pdv-modal-total-label">Total a pagar</p>
            <p className="pdv-modal-total-valor">{formatBRL(total)}</p>
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
                      const valor = parseFloat(String(valoresPorForma[formaId]).replace(',', '.')) || 0
                      return acc + valor
                    }, 0)
                  )}
                </p>
              </div>
            )}
            <div className="pdv-modal-actions">
              <button
                type="button"
                className="pdv-modal-cancelar"
                onClick={() => {
                  setValorRecebido('')
                  setValoresPorForma({})
                  setShowModalPagamento(false)
                }}
              >
                Cancelar
              </button>
              <button type="button" className="pdv-modal-confirmar" onClick={handleConfirmarPagamento}>
                Confirmar Pagamento
              </button>
            </div>
          </div>

          {toast && (
  <div className={`pdv-toast pdv-toast-${toast.tipo}`}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
      <path d="M20 6L9 17l-5-5" />
    </svg>
    {toast.mensagem}
  </div>
)}

        </div>
      )}
      <ProdutoSearchModal
        open={showModalPesquisa}
        onClose={() => setShowModalPesquisa(false)}
        onSelect={selecionarProduto}
      />
    </div>
  )
}
