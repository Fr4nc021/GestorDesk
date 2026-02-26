import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Produtos from './pages/Produtos'
import PDV from './pages/PDV'
import Relatorios from './pages/Relatorios'
import Artesaos from './pages/Artesaos'
import Estoque from './pages/Estoque'
import Caixa from './pages/Caixa'
import Layout from './Layout'

export default function App() {
  return (
        <BrowserRouter>
        <Routes>
            <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="produtos" element={<Produtos />} />
            <Route path="pdv" element={<PDV />} />
            <Route path="artesaos" element={<Artesaos />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="caixa" element={<Caixa />} />
            <Route path="relatorios" element={<Relatorios />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
  )
}
