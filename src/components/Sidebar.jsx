import { NavLink, Link, useNavigate } from 'react-router-dom'
import pdvIcon from '../assets/icons/pdv.png'
import artesaosIcon from '../assets/icons/artesaos.png'
import estoqueIcon from '../assets/icons/estoque.png'
import relatoriosIcon from '../assets/icons/relatorios.png'
import sairIcon from '../assets/icons/sair.png'
import logo from '../assets/logo.png'

const sidebarNavItems = [
  { to: '/app', label: 'Dashboard', icon: relatoriosIcon },
  { to: '/app/pdv', label: 'PDV (Venda)', icon: pdvIcon },
  { to: '/app/produtos', label: 'Produtos', icon: estoqueIcon },
  { to: '/app/artesaos', label: 'Artesãos', icon: artesaosIcon },
  { to: '/app/estoque', label: 'Estoque', icon: estoqueIcon },
  { to: '/app/caixa', label: 'Caixa', icon: pdvIcon },
  { to: '/app/relatorios', label: 'Relatórios', icon: relatoriosIcon },
  { to: '/app/configuracoes', label: 'Configurações', icon: relatoriosIcon },
]

export default function Sidebar() {
  const navigate = useNavigate()

  function handleLogout(event) {
    event.preventDefault()
    try {
      sessionStorage.removeItem('usuarioLogado')
    } catch {}
    window.electronAPI?.loginShowResize?.()
    navigate('/login', { replace: true })
  }

  return (
    <div className="sidebar">
      <img src={logo} alt="Espaço da Arte" />

      <ul className="sidebar-nav">
        {sidebarNavItems.map(({ to, label, icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/app'}
              className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
            >
              <img src={icon} alt="" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-footer">
        <Link to="/login" className="sidebar-item sair" onClick={handleLogout}>
          <img src={sairIcon} alt="" />
          <span>Sair</span>
        </Link>
      </div>
    </div>
  )
}
