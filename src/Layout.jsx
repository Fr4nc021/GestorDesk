import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'

function getUsuarioLogado() {
  try {
    const s = localStorage.getItem('usuarioLogado')
    if (!s) return null
    const data = JSON.parse(s)
    return data && data.id ? data : null
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