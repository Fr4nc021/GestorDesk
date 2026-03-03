import { Outlet } from 'react-router-dom'
import Sidebar from './components/Sidebar'

export default function Layout() {
  return (
    <div className="layout-root">
      <Sidebar />
      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  )
}