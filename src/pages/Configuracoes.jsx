import { useEffect, useState } from 'react'
import { useAtualizacao } from '../hooks/useAtualizacao'
import { buscarCep, formatarCep } from '../utils/cep'
import { AMBIENTES, CRT_OPCOES, formatarCnpj } from '../utils/fiscal'
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

const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const CONFIG_FISCAL_VAZIA = {
  cnpj: '',
  inscricao_estadual: '',
  razao_social: '',
  nome_fantasia: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  municipio: '',
  codigo_municipio: '',
  uf: '',
  telefone: '',
  email: '',
  crt: '1',
  ambiente: '2',
  serie_nfce: '1',
  proximo_numero_nfce: '1',
  serie_nfe: '1',
  proximo_numero_nfe: '1',
  csc_id: '',
  csc: '',
}

function configFiscalParaForm(config) {
  const base = { ...CONFIG_FISCAL_VAZIA, ...(config || {}) }
  return { ...base, cnpj: formatarCnpj(base.cnpj), cep: formatarCep(base.cep) }
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

  const [fiscal, setFiscal] = useState(CONFIG_FISCAL_VAZIA)
  const [carregandoFiscal, setCarregandoFiscal] = useState(true)
  const [salvandoFiscal, setSalvandoFiscal] = useState(false)
  const [feedbackFiscal, setFeedbackFiscal] = useState({ tipo: '', texto: '' })
  const [cepFiscalStatus, setCepFiscalStatus] = useState('')
  const [mostrarCsc, setMostrarCsc] = useState(false)

  useEffect(() => {
    carregarUsuarios()
    carregarPeriodoRelatorios()
    carregarConfigFiscal()
  }, [])

  async function carregarConfigFiscal() {
    if (!window.electronAPI?.obterConfigFiscal) {
      setCarregandoFiscal(false)
      return
    }
    setCarregandoFiscal(true)
    try {
      const dados = await window.electronAPI.obterConfigFiscal()
      setFiscal(configFiscalParaForm(dados))
    } catch (err) {
      console.error('[Configurações] Erro ao carregar dados fiscais:', err)
      setFeedbackFiscal({ tipo: 'error', texto: err?.message || 'Erro ao carregar dados fiscais.' })
    } finally {
      setCarregandoFiscal(false)
    }
  }

  function atualizarFiscal(campo, valor) {
    setFiscal((prev) => ({ ...prev, [campo]: valor }))
    setFeedbackFiscal({ tipo: '', texto: '' })
  }

  async function consultarCepFiscal() {
    const digitos = fiscal.cep.replace(/\D/g, '')
    if (digitos.length !== 8) return
    setCepFiscalStatus('Buscando endereço...')
    try {
      const endereco = await buscarCep(digitos)
      if (!endereco) {
        setCepFiscalStatus('CEP não encontrado.')
        return
      }
      setFiscal((prev) => ({
        ...prev,
        logradouro: endereco.logradouro || prev.logradouro,
        bairro: endereco.bairro || prev.bairro,
        municipio: endereco.cidade || prev.municipio,
        uf: endereco.uf || prev.uf,
        codigo_municipio: endereco.ibge || prev.codigo_municipio,
      }))
      setCepFiscalStatus('')
    } catch (err) {
      console.error('[Configurações] Erro ao buscar CEP:', err)
      setCepFiscalStatus('Não foi possível buscar o CEP. Verifique sua conexão.')
    }
  }

  async function handleSalvarFiscal(e) {
    e.preventDefault()
    if (!window.electronAPI?.salvarConfigFiscal) {
      setFeedbackFiscal({ tipo: 'error', texto: 'Salvar dados fiscais só está disponível no aplicativo.' })
      return
    }
    setSalvandoFiscal(true)
    setFeedbackFiscal({ tipo: '', texto: '' })
    try {
      const salvo = await window.electronAPI.salvarConfigFiscal(fiscal)
      setFiscal(configFiscalParaForm(salvo))
      setFeedbackFiscal({ tipo: 'success', texto: 'Dados fiscais salvos.' })
    } catch (err) {
      console.error('[Configurações] Erro ao salvar dados fiscais:', err)
      setFeedbackFiscal({ tipo: 'error', texto: err?.message || 'Erro ao salvar dados fiscais.' })
    } finally {
      setSalvandoFiscal(false)
    }
  }

  function campoFiscal(campo, label, props = {}) {
    return (
      <div className="modal-field">
        <label htmlFor={`fiscal-${campo}`}>{label}</label>
        <input
          id={`fiscal-${campo}`}
          type="text"
          value={fiscal[campo]}
          onChange={(e) => atualizarFiscal(campo, e.target.value)}
          {...props}
        />
      </div>
    )
  }

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
        <p className="dashboard-subtitle">Gerencie usuários, sincronização, dados fiscais e atualizações do aplicativo.</p>
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
        <button className={`config-tab ${abaAtiva === 'fiscal' ? 'active' : ''}`} onClick={() => setAbaAtiva('fiscal')}>
          Fiscal
        </button>
      </div>

      {abaAtiva === 'fiscal' && (
        <section className="config-card">
          <h3>Dados fiscais da empresa</h3>
          <p className="config-card-sub">
            Usados na emissão de NFC-e e NF-e. Ficam salvos neste computador.
          </p>
          {!window.electronAPI?.obterConfigFiscal && (
            <p className="config-card-sub">Disponível apenas no aplicativo instalado.</p>
          )}
          {window.electronAPI?.obterConfigFiscal && carregandoFiscal && (
            <p className="config-card-sub">Carregando dados fiscais...</p>
          )}
          {window.electronAPI?.obterConfigFiscal && !carregandoFiscal && (
            <form onSubmit={handleSalvarFiscal} className="fiscal-form">
              <p className="fiscal-secao">Empresa</p>
              <div className="fiscal-grid">
                {campoFiscal('razao_social', 'Razão social')}
                {campoFiscal('nome_fantasia', 'Nome fantasia')}
                <div className="modal-field">
                  <label htmlFor="fiscal-cnpj">CNPJ</label>
                  <input
                    id="fiscal-cnpj"
                    type="text"
                    inputMode="numeric"
                    value={fiscal.cnpj}
                    onChange={(e) => atualizarFiscal('cnpj', formatarCnpj(e.target.value))}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                {campoFiscal('inscricao_estadual', 'Inscrição Estadual', { inputMode: 'numeric' })}
                <div className="modal-field">
                  <label htmlFor="fiscal-crt">Regime tributário (CRT)</label>
                  <select id="fiscal-crt" value={fiscal.crt} onChange={(e) => atualizarFiscal('crt', e.target.value)}>
                    {CRT_OPCOES.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                {campoFiscal('telefone', 'Telefone', { inputMode: 'tel' })}
                {campoFiscal('email', 'E-mail', { type: 'email' })}
              </div>

              <p className="fiscal-secao">Endereço</p>
              <div className="fiscal-grid">
                <div className="modal-field">
                  <label htmlFor="fiscal-cep">CEP</label>
                  <input
                    id="fiscal-cep"
                    type="text"
                    inputMode="numeric"
                    value={fiscal.cep}
                    onChange={(e) => atualizarFiscal('cep', formatarCep(e.target.value))}
                    onBlur={consultarCepFiscal}
                    placeholder="00000-000"
                  />
                  {cepFiscalStatus && <p className="modal-field-cep-status">{cepFiscalStatus}</p>}
                </div>
                {campoFiscal('logradouro', 'Logradouro')}
                {campoFiscal('numero', 'Número')}
                {campoFiscal('complemento', 'Complemento')}
                {campoFiscal('bairro', 'Bairro')}
                {campoFiscal('municipio', 'Município')}
                <div className="modal-field">
                  <label htmlFor="fiscal-uf">UF</label>
                  <select id="fiscal-uf" value={fiscal.uf} onChange={(e) => atualizarFiscal('uf', e.target.value)}>
                    <option value="">—</option>
                    {ESTADOS_BR.map((estado) => (
                      <option key={estado} value={estado}>{estado}</option>
                    ))}
                  </select>
                </div>
                {campoFiscal('codigo_municipio', 'Código IBGE do município', {
                  inputMode: 'numeric',
                  maxLength: 7,
                  placeholder: 'Preenchido pelo CEP',
                })}
              </div>

              <p className="fiscal-secao">Emissão</p>
              <div className="fiscal-grid">
                <div className="modal-field">
                  <label htmlFor="fiscal-ambiente">Ambiente</label>
                  <select
                    id="fiscal-ambiente"
                    value={fiscal.ambiente}
                    onChange={(e) => atualizarFiscal('ambiente', e.target.value)}
                  >
                    {AMBIENTES.map((op) => (
                      <option key={op.value} value={op.value}>{op.label}</option>
                    ))}
                  </select>
                </div>
                {campoFiscal('serie_nfce', 'Série da NFC-e', { inputMode: 'numeric' })}
                {campoFiscal('proximo_numero_nfce', 'Próximo número da NFC-e', { inputMode: 'numeric' })}
                {campoFiscal('serie_nfe', 'Série da NF-e', { inputMode: 'numeric' })}
                {campoFiscal('proximo_numero_nfe', 'Próximo número da NF-e', { inputMode: 'numeric' })}
                {campoFiscal('csc_id', 'ID do CSC (token NFC-e)', { inputMode: 'numeric' })}
                <div className="modal-field">
                  <label htmlFor="fiscal-csc">CSC (token NFC-e)</label>
                  <input
                    id="fiscal-csc"
                    type={mostrarCsc ? 'text' : 'password'}
                    value={fiscal.csc}
                    onChange={(e) => atualizarFiscal('csc', e.target.value)}
                    autoComplete="off"
                  />
                  <button type="button" className="fiscal-mostrar-csc" onClick={() => setMostrarCsc((v) => !v)}>
                    {mostrarCsc ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>

              <div className="sync-action-row config-save-row">
                <button type="submit" className="btn-sync-manual" disabled={salvandoFiscal}>
                  {salvandoFiscal ? 'Salvando...' : 'Salvar dados fiscais'}
                </button>
              </div>
              {feedbackFiscal.texto && (
                <p className={`config-feedback ${feedbackFiscal.tipo}`}>{feedbackFiscal.texto}</p>
              )}
            </form>
          )}
        </section>
      )}

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
