import { useEffect, useState } from 'react'
import { useAtualizacao } from '../hooks/useAtualizacao'
import {
  RELATORIO_MODO_DIAS_ATRAS,
  RELATORIO_MODO_OPCOES,
  RELATORIOS_ABAS_PERIODO,
  criarRelatoriosPeriodoPadrao,
  normalizarRelatoriosPeriodoPadrao,
} from '../utils/relatoriosPeriodo'

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
  const { estado: atualizacao, instalar: instalarAtualizacao, verificar: verificarAtualizacao, temApi: temAtualizacao } = useAtualizacao()

  const [periodoRelatorios, setPeriodoRelatorios] = useState(() => criarRelatoriosPeriodoPadrao())
  const [carregandoPeriodoRelatorios, setCarregandoPeriodoRelatorios] = useState(true)
  const [salvandoPeriodoRelatorios, setSalvandoPeriodoRelatorios] = useState(false)
  const [feedbackPeriodoRelatorios, setFeedbackPeriodoRelatorios] = useState('')

  useEffect(() => {
    carregarUsuarios()
    carregarPeriodoRelatorios()
  }, [])

  async function carregarPeriodoRelatorios() {
    if (!window.electronAPI?.obterRelatoriosPeriodoPadrao) {
      setCarregandoPeriodoRelatorios(false)
      return
    }
    setCarregandoPeriodoRelatorios(true)
    setFeedbackPeriodoRelatorios('')
    try {
      const dados = await window.electronAPI.obterRelatoriosPeriodoPadrao()
      setPeriodoRelatorios(normalizarRelatoriosPeriodoPadrao(dados))
    } catch (err) {
      console.error('[Configurações] Erro ao carregar período de relatórios:', err)
      setFeedbackPeriodoRelatorios(err?.message || 'Erro ao carregar preferências de relatórios.')
    } finally {
      setCarregandoPeriodoRelatorios(false)
    }
  }

  function atualizarPeriodoRelatorioAba(abaId, campo, valor) {
    setPeriodoRelatorios((prev) => {
      const next = normalizarRelatoriosPeriodoPadrao(prev)
      next[abaId] = { ...next[abaId], [campo]: valor }
      return next
    })
    setFeedbackPeriodoRelatorios('')
  }

  async function handleSalvarPeriodoRelatorios(e) {
    e.preventDefault()
    if (!window.electronAPI?.salvarRelatoriosPeriodoPadrao) {
      setFeedbackPeriodoRelatorios('Salvar preferências só está disponível no aplicativo.')
      return
    }
    setSalvandoPeriodoRelatorios(true)
    setFeedbackPeriodoRelatorios('')
    try {
      const payload = normalizarRelatoriosPeriodoPadrao(periodoRelatorios)
      const salvo = await window.electronAPI.salvarRelatoriosPeriodoPadrao(payload)
      setPeriodoRelatorios(normalizarRelatoriosPeriodoPadrao(salvo))
      setFeedbackPeriodoRelatorios('Preferências de relatórios salvas.')
    } catch (err) {
      console.error('[Configurações] Erro ao salvar período de relatórios:', err)
      setFeedbackPeriodoRelatorios(err?.message || 'Erro ao salvar preferências.')
    } finally {
      setSalvandoPeriodoRelatorios(false)
    }
  }

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
      console.error('[Configurações] Erro ao carregar usuários:', err)
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
      console.error('[Configurações] Erro na sincronização manual:', err)
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
        <p className="dashboard-subtitle">Gerencie usuários, sincronização e atualizações do aplicativo.</p>
      </div>

      <div className="config-tabs">
        <button className={`config-tab ${abaAtiva === 'usuarios' ? 'active' : ''}`} onClick={() => setAbaAtiva('usuarios')}>
          Usuários locais
        </button>
        <button className={`config-tab ${abaAtiva === 'sync' ? 'active' : ''}`} onClick={() => setAbaAtiva('sync')}>
          Sincronização
        </button>
        <button className={`config-tab ${abaAtiva === 'atualizacao' ? 'active' : ''}`} onClick={() => setAbaAtiva('atualizacao')}>
          Atualização
        </button>
        <button className={`config-tab ${abaAtiva === 'relatorios' ? 'active' : ''}`} onClick={() => setAbaAtiva('relatorios')}>
          Relatórios
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

      {abaAtiva === 'relatorios' && (
        <section className="config-card">
          <h3>Período padrão em Relatórios</h3>
          <p className="config-card-sub">
            Define como a barra de datas é preenchida ao abrir Relatórios ou ao trocar de aba. A data fim continua sendo sempre hoje.
          </p>
          {!window.electronAPI?.obterRelatoriosPeriodoPadrao && (
            <p className="config-card-sub">Disponível apenas no aplicativo instalado.</p>
          )}
          {window.electronAPI?.obterRelatoriosPeriodoPadrao && carregandoPeriodoRelatorios && (
            <p className="config-card-sub">Carregando preferências...</p>
          )}
          {window.electronAPI?.obterRelatoriosPeriodoPadrao && !carregandoPeriodoRelatorios && (
            <form onSubmit={handleSalvarPeriodoRelatorios}>
              <div className="relatorios-periodo-config-lista">
                {RELATORIOS_ABAS_PERIODO.map((aba) => {
                  const item = periodoRelatorios[aba.id] ?? { modo: 'mes_anterior', dias: 30 }
                  return (
                    <div key={aba.id} className="relatorios-periodo-config-item">
                      <span className="relatorios-periodo-config-label">{aba.label}</span>
                      <select
                        value={item.modo}
                        onChange={(e) => atualizarPeriodoRelatorioAba(aba.id, 'modo', e.target.value)}
                        className="relatorios-periodo-config-select"
                      >
                        {RELATORIO_MODO_OPCOES.map((op) => (
                          <option key={op.value} value={op.value}>
                            {op.label}
                          </option>
                        ))}
                      </select>
                      {item.modo === RELATORIO_MODO_DIAS_ATRAS && (
                        <label className="relatorios-periodo-config-dias">
                          <span>Dias</span>
                          <input
                            type="number"
                            min={0}
                            max={3660}
                            value={item.dias ?? 30}
                            onChange={(e) => atualizarPeriodoRelatorioAba(aba.id, 'dias', e.target.value)}
                          />
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="sync-action-row config-save-row">
                <button type="submit" className="btn-sync-manual" disabled={salvandoPeriodoRelatorios}>
                  {salvandoPeriodoRelatorios ? 'Salvando...' : 'Salvar preferências'}
                </button>
              </div>
              {feedbackPeriodoRelatorios && (
                <p
                  className={`config-feedback ${
                    feedbackPeriodoRelatorios.includes('salvas') ? 'success' : 'error'
                  }`}
                >
                  {feedbackPeriodoRelatorios}
                </p>
              )}
            </form>
          )}
        </section>
      )}

      {abaAtiva === 'atualizacao' && (
        <section className="config-card">
          <h3>Atualização do aplicativo</h3>
          <p className="config-card-sub">A versão instalada e o estado da busca por novas versões.</p>
          {!temAtualizacao && (
            <p className="config-card-sub">A verificação de atualização só está disponível no aplicativo.</p>
          )}
          {temAtualizacao && !atualizacao && (
            <p className="config-card-sub">Carregando informações da versão...</p>
          )}
          {temAtualizacao && atualizacao && (
            <div className="atualizacao-config">
              <p>Versão atual: <strong>{atualizacao.versaoAtual || '—'}</strong></p>
              {atualizacao.versaoNova && atualizacao.status !== 'not-available' && (
                <p>Nova versão: <strong>{atualizacao.versaoNova}</strong></p>
              )}
              {atualizacao.mensagem && <p className="config-card-sub">{atualizacao.mensagem}</p>}
              {atualizacao.status === 'downloading' && (
                <div
                  className="atualizacao-progresso"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={atualizacao.progresso || 0}
                >
                  <div className="atualizacao-progresso-barra" style={{ width: `${atualizacao.progresso || 0}%` }} />
                </div>
              )}
              <div className="sync-action-row">
                {atualizacao.status === 'downloaded' && (
                  <button type="button" className="btn-sync-manual" onClick={instalarAtualizacao}>
                    Reiniciar e instalar
                  </button>
                )}
                {atualizacao.status === 'error' && (
                  <button type="button" className="btn-sync-manual" onClick={verificarAtualizacao}>
                    Tentar novamente
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
