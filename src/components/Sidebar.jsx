import { NavLink } from 'react-router-dom'
import pdvIcon from '../assets/icons/pdv.png'
import artesaosIcon from '../assets/icons/artesaos.png'
import estoqueIcon from '../assets/icons/estoque.png'
import relatoriosIcon from '../assets/icons/relatorios.png'
import sairIcon from '../assets/icons/sair.png'

const menuItems = [
  { to: '/', label: 'Dashboard', icon: relatoriosIcon },
  { to: '/pdv', label: 'PDV (Venda)', icon: pdvIcon },
  { to: '/produtos', label: 'Produtos', icon: estoqueIcon },
  { to: '/artesaos', label: 'Artesãos', icon: artesaosIcon },
  { to: '/estoque', label: 'Estoque', icon: estoqueIcon },
  { to: '/caixa', label: 'Caixa', icon: pdvIcon },
  { to: '/relatorios', label: 'Relatórios', icon: relatoriosIcon },
]

export default function Sidebar() {
  return (
    <div className="sidebar">
      <h2>Espaço da Arte</h2>

      <ul className="sidebar-nav">
        {menuItems.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            >
              <img src={icon} alt="" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <a href="/login" className="sidebar-item sair">
          <img src={sairIcon} alt="" />
          <span>Sair</span>
        </a>
      </div>
    </div>
  )
}
