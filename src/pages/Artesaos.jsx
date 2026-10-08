import { useState, useEffect, useRef } from 'react'
import { recoverInputFocus } from '../utils/focusRecovery'
import { buscarCep, formatarCep } from '../utils/cep'
import { formatarCpfCnpj, rotuloDocumento } from '../utils/documento'
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

const TIPOS_PESSOA = [
  { id: 'pf', label: 'Pessoa física' },
  { id: 'mei', label: 'MEI' },
  { id: 'empresa', label: 'Empresa' },
]

const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

function limparFormularioFornecedor(setters) {
  const {
    setRazaoSocial,
    setNomeFantasia,
    setTipoPessoa,
    setCpfCnpj,
    setInscricaoEstadual,
    setEmail,
    setCep,
    setLogradouro,
    setNumero,
    setComplemento,
    setBairro,
    setCidade,
    setUf,
    setTelefoneWhatsapp,
    setRegiaoTelefone,
    setCepErro,
  } = setters

  setRazaoSocial('')
  setNomeFantasia('')
  setTipoPessoa('pf')
  setCpfCnpj('')
  setInscricaoEstadual('')
  setEmail('')
  setCep('')
  setLogradouro('')
  setNumero('')
  setComplemento('')
  setBairro('')
  setCidade('')
  setUf('')
  setTelefoneWhatsapp('')
  setRegiaoTelefone(REGIAO_PADRAO)
  setCepErro('')
}

export default function Artesaos() {
  const [artesoes, setArtesoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [termoBusca, setTermoBusca] = useState('')

  const [modalAberto, setModalAberto] = useState(false)
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false)
  const [artesaoEmEdicao, setArtesaoEmEdicao] = useState(null)
  const [artesaoParaExcluir, setArtesaoParaExcluir] = useState(null)
  const [razaoSocial, setRazaoSocial] = useState('')
  const [nomeFantasia, setNomeFantasia] = useState('')
  const [tipoPessoa, setTipoPessoa] = useState('pf')
  const [cpfCnpj, setCpfCnpj] = useState('')
  const [inscricaoEstadual, setInscricaoEstadual] = useState('')
  const [email, setEmail] = useState('')
  const [cep, setCep] = useState('')
  const [logradouro, setLogradouro] = useState('')
  const [numero, setNumero] = useState('')
  const [complemento, setComplemento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [cepCarregando, setCepCarregando] = useState(false)
  const [cepErro, setCepErro] = useState('')
  const [telefoneWhatsapp, setTelefoneWhatsapp] = useState('')
  const [modalRegiaoAberto, setModalRegiaoAberto] = useState(false)
  const [regiaoTelefone, setRegiaoTelefone] = useState(REGIAO_PADRAO)

  const formSetters = {
    setRazaoSocial,
    setNomeFantasia,
    setTipoPessoa,
    setCpfCnpj,
    setInscricaoEstadual,
    setEmail,
    setCep,
    setLogradouro,
    setNumero,
    setComplemento,
    setBairro,
    setCidade,
    setUf,
    setTelefoneWhatsapp,
    setRegiaoTelefone,
    setCepErro,
  }

  async function carregarArtesoes() {
    try {
      const lista = await window.electronAPI.listarArtesoes()
      setArtesoes(lista)
    } catch (err) {
      console.error('[Fornecedores] Erro ao carregar lista:', err)
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
    limparFormularioFornecedor(formSetters)
    setModalAberto(true)
  }

  function abrirModalEdicao(artesao) {
    setArtesaoEmEdicao(artesao)
    setRazaoSocial((artesao.razao_social || '').trim() || artesao.nome || '')
    setNomeFantasia(artesao.nome_fantasia || '')
    setTipoPessoa(artesao.tipo_pessoa || 'pf')
    setCpfCnpj(formatarCpfCnpj(artesao.cpf_cnpj || '', artesao.tipo_pessoa || 'pf'))
    setInscricaoEstadual(artesao.inscricao_estadual || '')
    setEmail(artesao.email || '')
    setCep(formatarCep(artesao.cep || ''))
    setLogradouro(artesao.logradouro || '')
    setNumero(artesao.numero || '')
    setComplemento(artesao.complemento || '')
    setBairro(artesao.bairro || '')
    setCidade(artesao.cidade || '')
    setUf(artesao.uf || '')
    setCepErro('')
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

  function handleCpfCnpjChange(e) {
    setCpfCnpj(formatarCpfCnpj(e.target.value, tipoPessoa))
  }

  function handleTipoPessoaChange(e) {
    const novoTipo = e.target.value
    setTipoPessoa(novoTipo)
    setCpfCnpj(formatarCpfCnpj(cpfCnpj, novoTipo))
    if (novoTipo === 'pf') setInscricaoEstadual('')
  }

  function handleCepChange(e) {
    setCep(formatarCep(e.target.value))
    setCepErro('')
  }

  async function consultarCep(valorCep) {
    const digitos = String(valorCep || '').replace(/\D/g, '')
    if (digitos.length !== 8) return

    setCepCarregando(true)
    setCepErro('')
    try {
      const endereco = await buscarCep(digitos)
      if (!endereco) {
        setCepErro('CEP não encontrado.')
        return
      }
      setLogradouro(endereco.logradouro)
      setBairro(endereco.bairro)
      setCidade(endereco.cidade)
      setUf(endereco.uf)
    } catch (err) {
      console.error('[Fornecedores] Erro ao buscar CEP:', err)
      setCepErro('Não foi possível buscar o CEP. Verifique sua conexão.')
    } finally {
      setCepCarregando(false)
    }
  }

  async function handleSalvarArtesao(e) {
    e.preventDefault()
    const razao = razaoSocial.trim()
    if (!razao) return

    if (!window.electronAPI) {
      alert('Execute o app pelo Electron (npm start). O banco de dados não está disponível no navegador.')
      return
    }

    try {
      const temTelefone = telefoneWhatsapp.replace(/\D/g, '').length > 0
      const telefoneCompleto = temTelefone ? `${regiaoTelefone.codigo} ${telefoneWhatsapp.trim()}` : null
      const nomeAnterior = String(artesaoEmEdicao?.nome || '').trim()
      const razaoAnterior = String(artesaoEmEdicao?.razao_social || '').trim() || nomeAnterior
      const razaoMudou = !artesaoEmEdicao || razao.toLowerCase() !== razaoAnterior.toLowerCase()
      const cpfCnpjDigitos = cpfCnpj.replace(/\D/g, '')
      const cepDigitos = cep.replace(/\D/g, '')

      const dados = {
        nome: razaoMudou ? razao : (nomeAnterior || razao),
        telefone_whats: telefoneCompleto,
        razao_social: razao,
        nome_fantasia: nomeFantasia.trim() || null,
        tipo_pessoa: tipoPessoa,
        cpf_cnpj: cpfCnpjDigitos || null,
        inscricao_estadual: tipoPessoa !== 'pf' ? (inscricaoEstadual.trim() || null) : null,
        email: email.trim() || null,
        cep: cepDigitos || null,
        logradouro: logradouro.trim() || null,
        numero: numero.trim() || null,
        complemento: complemento.trim() || null,
        bairro: bairro.trim() || null,
        cidade: cidade.trim() || null,
        uf: uf || null,
      }

      if (artesaoEmEdicao) {
        await window.electronAPI.atualizarArtesao(artesaoEmEdicao.id, dados)
      } else {
        await window.electronAPI.criarArtesao(dados)
      }
      setModalAberto(false)
      carregarArtesoes()
    } catch (err) {
      console.error('[Fornecedores] Erro ao salvar fornecedor:', err)
      const msg = err?.message || String(err)
      alert(`Erro ao salvar fornecedor: ${msg}`)
    }
  }

  const buscaNome = termoBusca.trim().toLowerCase()
  const artesoesFiltrados = buscaNome
    ? artesoes.filter((artesao) =>
        [
          artesao.nome,
          artesao.razao_social,
          artesao.nome_fantasia,
          artesao.email,
          artesao.cpf_cnpj,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(buscaNome)
      )
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
      console.error('[Fornecedores] Erro ao excluir fornecedor:', err)
      const msg = err?.message || String(err)
      alert(`Erro ao excluir fornecedor: ${msg}`)
    }
  }

  return (
    <div className="artesaos">
      <div className="artesaos-header">
        <div className="artesaos-header-left">
          <h2 className="dashboard-heading">Fornecedores</h2>
          <p className="dashboard-subtitle">Gerencie os parceiros</p>
          <div className="artesaos-search-row">
            <div className="artesaos-search-wrapper">
              <img src={loupeIcon} alt="" className="pdv-input-icon" />
              <input
                ref={buscaInputRef}
                type="text"
                placeholder="Buscar por nome, e-mail ou documento..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="artesaos-actions">
          <button type="button" className="artesaos-btn-primary" onClick={abrirModal}>
            <span>+</span> Novo Fornecedor
          </button>
        </div>
      </div>

      <div className="artesaos-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Razão Social</th>
              <th>Nome Fantasia</th>
              <th>Contato</th>
              <th>Status</th>
              <th>Produtos Relacionados</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>Carregando...</td>
              </tr>
            ) : artesoesFiltrados.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  {buscaNome
                    ? 'Nenhum fornecedor encontrado com esse nome.'
                    : 'Nenhum fornecedor cadastrado.'}
                </td>
              </tr>
            ) : (
              artesoesFiltrados.map((artesao) => (
                <tr key={artesao.id}>
                  <td>{(artesao.razao_social || '').trim() || artesao.nome || '—'}</td>
                  <td>{artesao.nome_fantasia || '—'}</td>
                  <td>
                    <span className="artesaos-contato">
                      {artesao.telefone_whats || artesao.email ? (
                        <>
                          {artesao.telefone_whats && (
                            <>
                              <svg className="artesaos-contato-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                              </svg>
                              {artesao.telefone_whats}
                            </>
                          )}
                          {artesao.email && (
                            <span style={{ display: 'block', marginTop: artesao.telefone_whats ? '4px' : 0 }}>
                              {artesao.email}
                            </span>
                          )}
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
          <div className="modal-content modal-fornecedor" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{artesaoEmEdicao ? 'Editar Fornecedor' : 'Cadastrar Novo Fornecedor'}</h3>
              <button type="button" className="modal-close" onClick={() => setModalAberto(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <form onSubmit={handleSalvarArtesao}>
              <p className="modal-fornecedor-secao">Identificação</p>
              <div className="modal-field">
                <label htmlFor="razao-social">Nome completo ou razão social</label>
                <input
                  id="razao-social"
                  type="text"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  placeholder="Ex: Maria Silva ou Maria Silva Artesanato Ltda"
                  required
                />
              </div>
              <div className="modal-field">
                <label htmlFor="nome-fantasia">Nome Fantasia</label>
                <input
                  id="nome-fantasia"
                  type="text"
                  value={nomeFantasia}
                  onChange={(e) => setNomeFantasia(e.target.value)}
                  placeholder="Ex: Ateliê da Maria"
                />
              </div>
              <div className="modal-fornecedor-linha">
                <div className="modal-field">
                  <label htmlFor="tipo-pessoa">Tipo</label>
                  <select id="tipo-pessoa" value={tipoPessoa} onChange={handleTipoPessoaChange}>
                    {TIPOS_PESSOA.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>{tipo.label}</option>
                    ))}
                  </select>
                </div>
                <div className="modal-field">
                  <label htmlFor="cpf-cnpj">{rotuloDocumento(tipoPessoa)}</label>
                  <input
                    id="cpf-cnpj"
                    type="text"
                    value={cpfCnpj}
                    onChange={handleCpfCnpjChange}
                    placeholder={tipoPessoa === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'}
                  />
                </div>
              </div>
              {tipoPessoa !== 'pf' && (
                <div className="modal-field">
                  <label htmlFor="inscricao-estadual">Inscrição Estadual</label>
                  <input
                    id="inscricao-estadual"
                    type="text"
                    value={inscricaoEstadual}
                    onChange={(e) => setInscricaoEstadual(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
              )}
              <div className="modal-field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contato@exemplo.com"
                />
              </div>

              <p className="modal-fornecedor-secao">Endereço</p>
              <div className="modal-field">
                <label htmlFor="cep">CEP</label>
                <input
                  id="cep"
                  type="text"
                  value={cep}
                  onChange={handleCepChange}
                  onBlur={() => consultarCep(cep)}
                  placeholder="00000-000"
                />
                {(cepCarregando || cepErro) && (
                  <p className={`modal-field-cep-status${cepErro ? ' erro' : ''}`}>
                    {cepCarregando ? 'Buscando endereço...' : cepErro}
                  </p>
                )}
              </div>
              <div className="modal-field">
                <label htmlFor="logradouro">Logradouro</label>
                <input
                  id="logradouro"
                  type="text"
                  value={logradouro}
                  onChange={(e) => setLogradouro(e.target.value)}
                  placeholder="Rua, avenida..."
                />
              </div>
              <div className="modal-fornecedor-linha">
                <div className="modal-field">
                  <label htmlFor="numero">Número</label>
                  <input
                    id="numero"
                    type="text"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="123"
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="complemento">Complemento</label>
                  <input
                    id="complemento"
                    type="text"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                    placeholder="Sala, bloco..."
                  />
                </div>
              </div>
              <div className="modal-field">
                <label htmlFor="bairro">Bairro</label>
                <input
                  id="bairro"
                  type="text"
                  value={bairro}
                  onChange={(e) => setBairro(e.target.value)}
                />
              </div>
              <div className="modal-fornecedor-linha-tres">
                <div className="modal-field">
                  <label htmlFor="cidade">Cidade</label>
                  <input
                    id="cidade"
                    type="text"
                    value={cidade}
                    onChange={(e) => setCidade(e.target.value)}
                  />
                </div>
                <div className="modal-field">
                  <label htmlFor="uf">UF</label>
                  <select id="uf" value={uf} onChange={(e) => setUf(e.target.value)}>
                    <option value="">—</option>
                    {ESTADOS_BR.map((estado) => (
                      <option key={estado} value={estado}>{estado}</option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="modal-fornecedor-secao">Contato</p>
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
                {artesaoEmEdicao ? 'Salvar Alterações' : 'Salvar Fornecedor'}
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
              <h3>Excluir fornecedor</h3>
              <button type="button" className="modal-close" onClick={() => setModalExcluirAberto(false)} aria-label="Fechar">
                ×
              </button>
            </div>
            <p className="modal-confirm-message">
              Tem certeza que deseja excluir esse fornecedor? Essa ação é permanente e todos os produtos relacionados a ele ficarão sem relação com fornecedor.
            </p>
            <p className="modal-confirm-nome"><strong>{(artesaoParaExcluir.razao_social || '').trim() || artesaoParaExcluir.nome}</strong></p>
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
