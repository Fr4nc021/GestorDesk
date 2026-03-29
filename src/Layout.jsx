import { useEffect } from 'react'
import { Outlet, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import { isFocusLost, recoverInputFocus, runInputRecovery } from './utils/focusRecovery'

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

  useEffect(() => {
    function onKeyDownCapture(e) {
      if (e.key === 'Escape') {
        runInputRecovery()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Tab' || e.key === 'Escape') return
      if (!isFocusLost()) return
      const t = e.target
      if (t !== document.body && t !== document.documentElement) return
      recoverInputFocus()
    }
    document.addEventListener('keydown', onKeyDownCapture, true)
    return () => document.removeEventListener('keydown', onKeyDownCapture, true)
  }, [])

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
