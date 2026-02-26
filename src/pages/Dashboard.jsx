import { Link } from 'react-router-dom'
import pdvIcon from '../assets/icons/pdv.png'
import estoqueIcon from '../assets/icons/estoque.png'
import relatoriosIcon from '../assets/icons/relatorios.png'

const quickActions = [
  { to: '/pdv', label: 'Vendas', icon: pdvIcon },
  { to: '/produtos', label: 'Produtos', icon: estoqueIcon },
  { to: '/caixa', label: 'Caixa', icon: relatoriosIcon },
]

export default function Dashboard() {
  return (
    <div className="dashboard">
      <section className="dashboard-section">
        <h2 className="dashboard-heading">Ações Rápidas</h2>
        <hr className="dashboard-divider" />
        <div className="quick-actions">
          {quickActions.map(({ to, label, icon }) => (
            <Link key={to} to={to} className="quick-action-card">
              <img src={icon} alt="" className="quick-action-icon" />
              <span className="quick-action-label">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <hr className="dashboard-divider" />
        <h2 className="dashboard-heading">Dashboard</h2>
        <p className="dashboard-subtitle">Visão geral da sua loja hoje.</p>
      </section>
    </div>
  )
}