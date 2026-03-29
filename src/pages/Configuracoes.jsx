import { useEffect, useState } from 'react'

const SYNC_STATUS_CSS = {
  ok: 'ok',
  error: 'error',
  'no-internet': 'no-internet',
}

export default function Configuracoes() {
  const [abaAtiva, setAbaAtiva] = useState('usuarios')
  const [usuariosLocais, setUsuariosLocais] = useState([])
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(true)
  const [erroUsuarios, setErroUsuarios] = useState('')
  const [excluindoUsuarioId, setExcluindoUsuarioId] = useState(null)

  const [syncStatus, setSyncStatus] = useState('idle')
  const [syncMessage, setSyncMessage] = useState('')

  useEffect(() => {
    carregarUsuarios()
  }, [])

  async function carregarUsuarios() {
    if (!window.electronAPI?.listarUsuarios) {
      setErroUsuarios('Função de listagem de usuários indisponível.')
      setCarregandoUsuarios(false)
      return
    }
    setCarregandoUsuarios(true)
    setErroUsuarios('')
    try {
      const lista = await window.electronAPI.listarUsuarios()
      setUsuariosLocais(Array.isArray(lista) ? lista : [])
    } catch (err) {
      setErroUsuarios(err?.message || 'Erro ao carregar usuários.')
    } finally {
      setCarregandoUsuarios(false)
    }
  }

  async function handleSyncClick() {
    if (!window.electronAPI?.sincronizarAgora) return
    setSyncStatus('checking')
    setSyncMessage('Verificando conexão com a internet...')
    try {
      const resultado = await window.electronAPI.sincronizarAgora()
      if (!resultado?.success) {
        if (resultado?.error === 'Sem conexão com a internet') {
          setSyncStatus('no-internet')
          setSyncMessage('Sem conexão com a internet.')
        } else {
          setSyncStatus('error')
          setSyncMessage(resultado?.error || 'Erro ao sincronizar.')
        }
        return
      }
      setSyncStatus('ok')
      setSyncMessage('Aplicativo sincronizado!')
    } catch (err) {
      setSyncStatus('error')
      setSyncMessage(err?.message || 'Erro ao sincronizar.')
    }
  }

  async function handleExcluirUsuario(usuario) {
    if (!window.electronAPI?.excluirUsuario) return
    const ok = window.confirm(`Excluir o usuário "${usuario.login}"?`)
    if (!ok) return

    setExcluindoUsuarioId(usuario.id)
    setErroUsuarios('')
    try {
      await window.electronAPI.excluirUsuario(usuario.id)
      await carregarUsuarios()
    } catch (err) {
      setErroUsuarios(err?.message || 'Erro ao excluir usuário.')
    } finally {
      setExcluindoUsuarioId(null)
    }
  }

  const syncStatusClass = SYNC_STATUS_CSS[syncStatus] ?? ''

  return (
    <div className="configuracoes">
      <div className="configuracoes-header">
        <h2 className="dashboard-heading">Configurações</h2>
        <p className="dashboard-subtitle">Gerencie usuários e sincronização do aplicativo.</p>
      </div>

      <div className="config-tabs">
        <button className={`config-tab ${abaAtiva === 'usuarios' ? 'active' : ''}`} onClick={() => setAbaAtiva('usuarios')}>
          Usuários locais
        </button>
        <button className={`config-tab ${abaAtiva === 'sync' ? 'active' : ''}`} onClick={() => setAbaAtiva('sync')}>
          Sincronização
        </button>
      </div>

      {abaAtiva === 'usuarios' && (
        <section className="config-card">
          <h3>Usuários cadastrados no banco local</h3>
          <p className="config-card-sub">Lista de logins já criados neste computador.</p>
          {carregandoUsuarios ? (
            <p className="config-card-sub">Carregando usuários...</p>
          ) : (
            <div className="usuarios-local-lista">
              {usuariosLocais.length === 0 ? (
                <p className="config-card-sub">Nenhum usuário encontrado.</p>
              ) : (
                usuariosLocais.map((usuario) => (
                  <div key={usuario.id} className="usuario-local-item">
                    <div>
                      <strong>{usuario.login}</strong>
                      <p>ID: {usuario.id}</p>
                    </div>
                    <button
                      type="button"
                      className="config-delete-btn"
                      onClick={() => handleExcluirUsuario(usuario)}
                      disabled={excluindoUsuarioId === usuario.id || usuario.login === 'admin'}
                    >
                      {excluindoUsuarioId === usuario.id ? 'Excluindo...' : usuario.login === 'admin' ? 'Protegido' : 'Excluir'}
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
          {erroUsuarios && <p className="config-feedback error">{erroUsuarios}</p>}
        </section>
      )}

      {abaAtiva === 'sync' && (
        <section className="config-card">
          <h3>Sincronização</h3>
          <p className="config-card-sub">Execute a sincronização manual quando precisar.</p>
          <div className="sync-action-row">
            <button
              type="button"
              onClick={handleSyncClick}
              className="btn-sync-manual"
              disabled={syncStatus === 'checking'}
            >
              {syncStatus === 'checking' ? 'Sincronizando...' : 'Sincronizar agora'}
            </button>
            {syncMessage && <span className={`sync-status-text ${syncStatusClass}`}>{syncMessage}</span>}
          </div>
        </section>
      )}
    </div>
  )
}
