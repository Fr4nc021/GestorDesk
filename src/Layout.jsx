import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'

function getUsuarioLogado() {
  try {
    const storedJson = sessionStorage.getItem('usuarioLogado')
    if (!storedJson) return null
    const parsed = JSON.parse(storedJson)
    return parsed?.id ? parsed : null
  } catch {
    return null
  }
}

export default function Layout() {
  const usuario = getUsuarioLogado()
  if (!usuario) {
    return <Navigate to="/login" replace />
  }
  return (
    <div className="layout-root">
      <Sidebar />
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  )
}
