import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Produtos from './pages/Produtos'
import PDV from './pages/PDV'
import Relatorios from './pages/Relatorios'
import Artesaos from './pages/Artesaos'
import Estoque from './pages/Estoque'
import Caixa from './pages/Caixa'
import Configuracoes from './pages/Configuracoes'
import Layout from './Layout'

function obterUsuarioLogado() {
  try {
    const raw = sessionStorage.getItem('usuarioLogado')
    if (!raw) return null
    const usuario = JSON.parse(raw)
    return usuario && usuario.id ? usuario : null
  } catch {
    return null
  }
}

function RotaProtegida({ children }) {
  const location = useLocation()

  if (!obterUsuarioLogado()) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}

export default function App() {
  // file:// (Electron empacotado): HashRouter evita rotas quebradas com BrowserRouter
  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'
  const Router = isFileProtocol ? HashRouter : BrowserRouter

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/app"
          element={
            <RotaProtegida>
              <Layout />
            </RotaProtegida>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="produtos" element={<Produtos />} />
          <Route path="pdv" element={<PDV />} />
          <Route path="artesaos" element={<Artesaos />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="caixa" element={<Caixa />} />
          <Route path="relatorios" element={<Relatorios />} />
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  )
}
