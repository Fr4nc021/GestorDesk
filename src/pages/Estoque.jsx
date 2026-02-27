import loupeIcon from '../assets/complements/loupe.png'

export default function Estoque() {
  return (
    <div className="estoque">
      <div className="estoque-header">
        <div className="estoque-header-left">
          <h2 className="dashboard-heading">Estoque</h2>
          <p className="dashboard-subtitle">Controle de entrada e saída de mercadorias.</p>
          <div className="estoque-search-row">
            <div className="estoque-search-wrapper">
              <img src={loupeIcon} alt="" className="pdv-input-icon" />
              <input type="text" placeholder="Buscar produto para lançar estoque..." />
            </div>
            <button type="button" className="estoque-history-btn">
              <svg className="estoque-history-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>Histórico Recente</span>
            </button>
          </div>
        </div>
      </div>

      <div className="estoque-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Código</th>
              <th>Tipo</th>
              <th>Quantidade</th>
              <th>Data</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* linhas de lançamentos de estoque */}
          </tbody>
        </table>
      </div>
    </div>
  )
}
