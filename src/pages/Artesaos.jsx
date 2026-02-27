import loupeIcon from '../assets/complements/loupe.png'

export default function Artesaos() {
  return (
    <div className="artesaos">
      <div className="artesaos-header">
        <div className="artesaos-header-left">
          <h2 className="dashboard-heading">Artesãos</h2>
          <p className="dashboard-subtitle">Gerencie os parceiros</p>
          <div className="artesaos-search-row">
            <div className="artesaos-search-wrapper">
              <img src={loupeIcon} alt="" className="pdv-input-icon" />
              <input type="text" placeholder="Buscar por nome..." />
            </div>
          </div>
        </div>
        <div className="artesaos-actions">
          <button type="button" className="artesaos-btn-primary">
            <span>+</span> Novo Artesão
          </button>
        </div>
      </div>

      <div className="artesaos-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Contato</th>
              <th>Status</th>
              <th>Produtos Relacionados</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {/* linhas de artesãos */}
          </tbody>
        </table>
      </div>
    </div>
  )
}
