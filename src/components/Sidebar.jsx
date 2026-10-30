import { NavLink, Link, useNavigate } from 'react-router-dom'
import pdvIcon from '../assets/icons/pdv.png'
import artesaosIcon from '../assets/icons/artesaos.png'
import estoqueIcon from '../assets/icons/estoque.png'
import relatorioIcon from '../assets/icons/relatorio.png'
import painelIcon from '../assets/icons/painel.png'
import produtosIcon from '../assets/icons/produtos.png'
import estoqueProntoIcon from '../assets/icons/estoque-pronto.png'
import configuracoesIcon from '../assets/icons/configuracoes.png'
import dinheiroIcon from '../assets/icons/dinheiro.svg'
import notaEmitidaIcon from '../assets/icons/nota-emitida.svg'
import sairIcon from '../assets/icons/sair.png'
import logo from '../assets/logo.png'

const sidebarNavItems = [
  { to: '/app', label: 'Dashboard', icon: painelIcon },
  { to: '/app/pdv', label: 'PDV (Venda)', icon: pdvIcon },
  { to: '/app/produtos', label: 'Produtos', icon: produtosIcon },
  { to: '/app/artesaos', label: 'Fornecedores', icon: artesaosIcon },
  { to: '/app/estoque', label: 'Estoque', icon: estoqueProntoIcon },
  { to: '/app/notas-entrada', label: 'Notas de entrada', icon: estoqueIcon },
  { to: '/app/notas-emitidas', label: 'Notas emitidas', icon: notaEmitidaIcon },
  { to: '/app/caixa', label: 'Caixa', icon: dinheiroIcon },
  { to: '/app/relatorios', label: 'Relatórios', icon: relatorioIcon },
  { to: '/app/configuracoes', label: 'Configurações', icon: configuracoesIcon },
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
