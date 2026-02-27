import codeIcon from '../assets/complements/code.png'

export default function PDV() {
  return (
    <div>
      <div className="pdv-product-bar">
        <div className="pdv-search-input-wrapper">
        <img src={codeIcon} alt="" className="pdv-input-icon" />
          <input
            type="text"
            className="pdv-search-input"
            placeholder="Escaneie o Código de Barras"
            autoFocus
          />
        </div>
        <button type="button" className="pdv-search-btn">
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
        </tr>
      </thead>
      <tbody>
        {/* Produtos ou empty state */}
      </tbody>
    </table>
    <div className="pdv-empty-state">
      <svg className="pdv-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <p className="pdv-empty-title">Caixa Livre</p>
      <p className="pdv-empty-text">Escaneie um produto para iniciar a venda</p>
    </div>
  </div>

  {/* Coluna direita: resumo + pagamento */}
  <aside className="pdv-sidebar">
    <section className="pdv-resumo">
      <h3>Resumo da Venda</h3>
      <p>Subtotal: <span>R$ 0,00</span></p>
      <p className="pdv-desconto">Desconto: <span>- R$ 0,00</span></p>
      <p className="pdv-total">Total: <span>R$ 0,00</span></p>
      <div className="pdv-desconto-input">
        <button type="button">Desconto</button>
        <input type="text" placeholder="Adicione aqui o desconto" />
      </div>
    </section>

    <section className="pdv-pagamento">
      <h3>Forma de Pagamento</h3>
      <div className="pdv-pagamento-btns">
        <button type="button">Crédito</button>
        <button type="button">Débito</button>
        <button type="button">PIX</button>
        <button type="button">Dinheiro</button>
      </div>
    </section>

    <div className="pdv-actions">
      <button type="button" className="pdv-finalizar">Finalizar venda (F1)</button>
      <button type="button" className="pdv-cancelar">Cancelar</button>
    </div>
  </aside>

  </div>
    </div>
  )
}
