import loupeIcon from '../assets/complements/loupe.png'
import { useState, useEffect } from 'react'

export default function Artesaos() {
  const [artesoes, setArtesoes] = useState([])
  const [loading, setLoading] = useState(true)

  async function carregarArtesoes() {
    try {
      const lista = await window.electronAPI.listarArtesoes()
      setArtesoes(lista)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarArtesoes()
  }, [])

  async function handleNovoArtesao() {
    const nome = prompt('Nome do artesão:')
    const telefone = prompt('Telefone WhatsApp (opcional):')
    if (!nome) return

    try {
      await window.electronAPI.criarArtesao({ nome, telefone_whats: telefone || null })
      carregarArtesoes()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="artesaos">
      <div className="artesaos-header">
        <div className="artesaos-header-left">
          <h2 className="dashboard-heading">Artesãos</h2>
          <p className="dashboard-subtitle">Gerencie os parceiros</p>
          <div className="artesaos-search-row">
            <div className="artesaos-search-wrapper">
              <img src={loupeIcon} alt="" className="pdv-input-icon" />
              <input type="text" placeholder="Buscar por nome..." />
            </div>
          </div>
        </div>
        <div className="artesaos-actions">
        <button type="button" className="artesaos-btn-primary" onClick={handleNovoArtesao}>
              <span>+</span> Novo Artesão
        </button>
        </div>
      </div>

      <div className="artesaos-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Contato</th>
              <th>Status</th>
              <th>Produtos Relacionados</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5}>Carregando...</td>
              </tr>
            ) : artesoes.length === 0 ? (
              <tr>
                <td colSpan={5}>Nenhum artesão cadastrado.</td>
              </tr>
            ) : (
              artesoes.map((a) => (
                <tr key={a.id}>
                  <td>{a.nome}</td>
                  <td>{a.telefone_whats || '-'}</td>
                  <td>{/* Status - definir depois */}</td>
                  <td>{a.quantidade_produtos}</td>
                  <td>{/* Ações - botões editar/excluir */}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
