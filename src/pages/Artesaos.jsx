import { useState, useEffect, useRef } from 'react'
import { recoverInputFocus } from '../utils/focusRecovery'
import loupeIcon from '../assets/complements/loupe.png'

const REGIOES_TELEFONE = [
  { id: 'BR', nome: 'Brasil', codigo: '+55' },
  { id: 'AR', nome: 'Argentina', codigo: '+54' },
  { id: 'UY', nome: 'Uruguai', codigo: '+598' },
  { id: 'PY', nome: 'Paraguai', codigo: '+595' },
  { id: 'CL', nome: 'Chile', codigo: '+56' },
  { id: 'BO', nome: 'Bolivia', codigo: '+591' },
]

const REGIAO_PADRAO = REGIOES_TELEFONE[0]

const REGIOES_TELEFONE_POR_CODIGO_DECRESCENTE = [...REGIOES_TELEFONE].sort(
  (a, b) => b.codigo.replace(/\D/g, '').length - a.codigo.replace(/\D/g, '').length
)

export default function Artesaos() {
  const [artesoes, setArtesoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [termoBusca, setTermoBusca] = useState('')

  const [modalAberto, setModalAberto] = useState(false)
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [artesaoEmEdicao, setArtesaoEmEdicao] = useState(null)
  const [artesaoParaExcluir, setArtesaoParaExcluir] = useState(null)
  const [nome, setNome] = useState('')
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState('')
  const [modalRegiaoAberto, setModalRegiaoAberto] = useState(false)
  const [regiaoTelefone, setRegiaoTelefone] = useState(REGIAO_PADRAO)

  async function carregarArtesoes() {
    try {
      const lista = await window.electronAPI.listarArtesoes()
      setArtesoes(lista)
    } catch (err) {
      console.error('[Artesãos] Erro ao carregar lista:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarArtesoes()
  }, [])

  const buscaInputRef = useRef(null)
  const anyModalArtesao =
    modalAberto || modalRegiaoAberto || modalExcluirAberto
  const prevModalArtesao = useRef(false)
  useEffect(() => {
    if (prevModalArtesao.current && !anyModalArtesao) {
      queueMicrotask(() => {
        buscaInputRef.current?.focus()
        if (document.activeElement !== buscaInputRef.current) recoverInputFocus()
      })
    }
    prevModalArtesao.current = anyModalArtesao
  }, [anyModalArtesao])

  function abrirModal() {
    setArtesaoEmEdicao(null)
    setNome('')
    setTelefoneWhatsapp('')
    setRegiaoTelefone(REGIAO_PADRAO)
    setModalAberto(true)
  }

  function abrirModalEdicao(artesao) {
    setArtesaoEmEdicao(artesao)
    setNome(artesao.nome)
    const { regiao, telefoneLocal } = extrairRegiaoETelefone(artesao.telefone_whats)
    setRegiaoTelefone(regiao)
    setTelefoneWhatsapp(telefoneLocal)
    setModalAberto(true)
  }

  function abrirModalExcluir(artesao) {
    setArtesaoParaExcluir(artesao)
    setModalExcluirAberto(true)
  }

  function formatarTelefoneLocal(valor) {
    const digitos = String(valor || '').replace(/\D/g, '').slice(0, 11)
    if (digitos.length === 0) return ''
    if (digitos.length <= 2) return `(${digitos}`
    if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`
    if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7, 11)}`
  }

  function extrairRegiaoETelefone(telefoneCompleto) {
    const digitos = String(telefoneCompleto || '').replace(/\D/g, '')
    if (!digitos) return { regiao: REGIAO_PADRAO, telefoneLocal: '' }

    for (const regiao of REGIOES_TELEFONE_POR_CODIGO_DECRESCENTE) {
      const codigoDigitos = regiao.codigo.replace(/\D/g, '')
      if (digitos.length > 11 && digitos.startsWith(codigoDigitos)) {
        const telefoneLocal = formatarTelefoneLocal(digitos.slice(codigoDigitos.length))
        return { regiao, telefoneLocal }
      }
    }

    return { regiao: REGIAO_PADRAO, telefoneLocal: formatarTelefoneLocal(digitos) }
  }

  function handleTelefoneChange(e) {
    const valor = e.target.value
    const { regiao, telefoneLocal } = extrairRegiaoETelefone(valor)
    setRegiaoTelefone(regiao)
    setTelefoneWhatsapp(telefoneLocal)
  }

  async function handleSalvarArtesao(e) {
    e.preventDefault()
    if (!nome.trim()) return

    if (!window.electronAPI) {
      alert('Execute o app pelo Electron (npm start). O banco de dados não está disponível no navegador.')
      return
    }

    try {
      const temTelefone = telefoneWhatsapp.replace(/\D/g, '').length > 0
      const telefoneCompleto = temTelefone ? `${regiaoTelefone.codigo} ${telefoneWhatsapp.trim()}` : null

      if (artesaoEmEdicao) {
        await window.electronAPI.atualizarArtesao(artesaoEmEdicao.id, {
          nome: nome.trim(),
          telefone_whats: telefoneCompleto,
        })
      } else {
        await window.electronAPI.criarArtesao({
          nome: nome.trim(),
          telefone_whats: telefoneCompleto,
        })
      }
      setModalAberto(false)
      carregarArtesoes()
    } catch (err) {
      console.error('[Artesãos] Erro ao salvar artesão:', err)
      const msg = err?.message || String(err)
      alert(`Erro ao salvar artesão: ${msg}`)
    }
  }

  const buscaNome = termoBusca.trim().toLowerCase()
  const artesoesFiltrados = buscaNome
    ? artesoes.filter((artesao) => artesao.nome?.toLowerCase().includes(buscaNome))
    : artesoes

  async function handleExcluirArtesao() {
    if (!artesaoParaExcluir) return

    if (!window.electronAPI) {
      alert('Execute o app pelo Electron (npm start). O banco de dados não está disponível no navegador.')
      return
    }

    try {
      await window.electronAPI.excluirArtesao(artesaoParaExcluir.id)
      setModalExcluirAberto(false)
      setArtesaoParaExcluir(null)
      carregarArtesoes()
    } catch (err) {
      console.error('[Artesãos] Erro ao excluir artesão:', err)
      const msg = err?.message || String(err)
      alert(`Erro ao excluir artesão: ${msg}`)
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
              <input
                ref={buscaInputRef}
                type="text"
                placeholder="Buscar por nome..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="artesaos-actions">
          <button type="button" className="artesaos-btn-primary" onClick={abrirModal}>
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
            ) : artesoesFiltrados.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  {buscaNome
                    ? 'Nenhum artesão encontrado com esse nome.'
                    : 'Nenhum artesão cadastrado.'}
                </td>
              </tr>
            ) : (
              artesoesFiltrados.map((artesao) => (
                <tr key={artesao.id}>
                  <td>{artesao.nome}</td>
                  <td>
                    <span className="artesaos-contato">
                      {artesao.telefone_whats ? (
                        <>
                          <svg className="artesaos-contato-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                          {artesao.telefone_whats}
                        </>
                      ) : (
                        '-'
                      )}
                    </span>
                  </td>
                  <td>
                    <span className="artesaos-status-badge">Ativo</span>
                  </td>
                  <td>{artesao.quantidade_produtos ?? 0}</td>
                  <td>
                    <div className="artesaos-acoes">
                      <button
                        type="button"
                        className="artesaos-btn-edit"
                        title="Editar"
                        onClick={() => abrirModalEdicao(artesao)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className="artesaos-btn-excluir"
                        title="Excluir"
                        onClick={() => abrirModalExcluir(artesao)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalAberto && (
        <div className="modal-overlay" onClick={() => setModalAberto(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{artesaoEmEdicao ? 'Editar Artesão' : 'Cadastrar Novo Artesão'}</h3>
              <button type="button" className="modal-close" onClick={() => setModalAberto(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <form onSubmit={handleSalvarArtesao}>
              <div className="modal-field">
                <label htmlFor="nome">Nome Completo</label>
                <input
                  id="nome"
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="telefone">Telefone / WhatsApp</label>
                <button
                  type="button"
                  className="modal-btn-cancelar"
                  onClick={() => setModalRegiaoAberto(true)}
                  style={{ marginBottom: '8px', width: '100%' }}
                >
                  Região: {regiaoTelefone.nome} ({regiaoTelefone.codigo})
                </button>
                <input
                  id="telefone"
                  type="tel"
                  value={telefoneWhatsapp}
                  onChange={handleTelefoneChange}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <button type="submit" className="modal-submit">
                {artesaoEmEdicao ? 'Salvar Alterações' : 'Salvar Artesão'}
              </button>
            </form>
          </div>
        </div>
      )}

      {modalRegiaoAberto && (
        <div className="modal-overlay" onClick={() => setModalRegiaoAberto(false)}>
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Selecionar região</h3>
              <button type="button" className="modal-close" onClick={() => setModalRegiaoAberto(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <div className="modal-confirm-acoes" style={{ display: 'grid', gap: '8px' }}>
              {REGIOES_TELEFONE.map((opcao) => (
                <button
                  key={opcao.id}
                  type="button"
                  className={opcao.id === regiaoTelefone.id ? 'modal-submit' : 'modal-btn-cancelar'}
                  onClick={() => {
                    setRegiaoTelefone(opcao)
                    setModalRegiaoAberto(false)
                  }}
                >
                  {opcao.nome} ({opcao.codigo})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {modalExcluirAberto && artesaoParaExcluir && (
        <div className="modal-overlay" onClick={() => setModalExcluirAberto(false)}>
          <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Excluir artesão</h3>
              <button type="button" className="modal-close" onClick={() => setModalExcluirAberto(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <p className="modal-confirm-message">
              Tem certeza que deseja excluir esse artesão? Essa ação é permanente e todos os produtos relacionados a ele ficarão sem relação com fornecedor.
            </p>
            <p className="modal-confirm-nome"><strong>{artesaoParaExcluir.nome}</strong></p>
            <div className="modal-confirm-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={() => setModalExcluirAberto(false)}>
                Cancelar
              </button>
              <button type="button" className="modal-btn-excluir" onClick={handleExcluirArtesao}>
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
