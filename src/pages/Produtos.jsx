import loupeIcon from '../assets/complements/loupe.png'
import filterIcon from '../assets/complements/filter.png'

export default function Produtos() {
  return (
    <div className="produtos">
      <div className="produtos-header">
        <div className="produtos-header-left">
          <h2 className="dashboard-heading">Produtos</h2>
          <p className="dashboard-subtitle">Gerencie seu catálogo de produtos artesanais.</p>
          <div className="produtos-search-row">
            <div className="produtos-search-wrapper">
            <img src={loupeIcon} alt="" className="pdv-input-icon" />
              <input type="text" placeholder="Buscar por nome ou código..." />
            </div>
            <button type="button" className="produtos-filter-btn">
              <img src={filterIcon} alt="" className="produtos-filter-icon" />
            </button>
            <button type="button" className="produtos-btn-secondary">Etiquetas</button>
          </div>
        </div>
        <div className="produtos-actions">
          <button type="button" className="produtos-btn-primary">
            <span>+</span> Novo Produto
          </button>
        </div>
      </div>

      <div className="produtos-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Produto</th>
              <th>Artesão</th>
              <th>Categoria</th>
              <th>Estoque</th>
              <th>Preço</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* linhas de produtos - vazio ou mapeando array */}
          </tbody>
        </table>
      </div>
    </div>
  )
}