export default function Caixa() {
  const hoje = new Date()
  const dataFormatada = hoje.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

  return (
    <div className="caixa">
      <div className="caixa-header">
        <div className="caixa-header-left">
          <h2 className="dashboard-heading">Caixa</h2>
          <p className="dashboard-subtitle">Movimento do dia {dataFormatada}</p>
        </div>
        <button type="button" className="caixa-export-btn">
          <svg className="caixa-export-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>Exportar Relatório</span>
        </button>
      </div>

      <div className="caixa-cards">
        <div className="caixa-card caixa-card-total">
          <span className="caixa-card-label">Total do Dia</span>
          <span className="caixa-card-value">R$ 144,90</span>
        </div>
      </div>

      <section className="caixa-transacoes">
        <h3 className="caixa-transacoes-title">Transações do Dia</h3>
        <div className="caixa-table-wrapper">
          <table className="pdv-products-table">
            <thead>
              <tr>
                <th>Hora</th>
                <th>ID Venda</th>
                <th>Itens</th>
                <th>Pagamento</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {/* linhas de transações */}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
