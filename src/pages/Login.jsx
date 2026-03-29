import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'

const IconUser = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
)

const IconLock = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

export default function Login() {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    window.electronAPI?.loginShowResize?.()
  }, [])

  useEffect(() => {
    const sessaoJson = sessionStorage.getItem('usuarioLogado')
    if (!sessaoJson) return
    try {
      const sessao = JSON.parse(sessaoJson)
      if (sessao?.id) navigate('/app', { replace: true })
    } catch {}
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setErro('')
    if (!usuario.trim()) {
      setErro('Informe o nome de usuário.')
      return
    }
    if (!senha) {
      setErro('Informe a senha.')
      return
    }
    try {
      const usuarioValidado = await window.electronAPI.validarLogin(usuario.trim(), senha)
      if (usuarioValidado) {
        sessionStorage.setItem('usuarioLogado', JSON.stringify({ id: usuarioValidado.id, login: usuarioValidado.login }))
        window.electronAPI?.loginSuccessResize?.()
        navigate('/app', { replace: true })
      } else {
        setErro('Usuário ou senha incorretos.')
      }
    } catch (err) {
      setErro(err?.message || 'Erro ao validar login.')
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-stripe" />
        <img src={logo} alt="Espaço da Arte" className="login-logo" />
        <p className="login-subtitle">Sistema de Gestão</p>
        <form onSubmit={handleSubmit}>
          <label className="login-label">Usuário</label>
          <div className="login-input-wrap">
            <span className="login-input-icon" aria-hidden><IconUser /></span>
            <input
              type="text"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              className="login-input"
            />
          </div>
          <label className="login-label">Senha</label>
          <div className="login-input-wrap">
            <span className="login-input-icon" aria-hidden><IconLock /></span>
            <input
              type="password"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              placeholder="Senha"
              autoComplete="current-password"
              className="login-input"
            />
          </div>
          {erro && <p className="login-erro">{erro}</p>}
          <button type="submit" className="login-btn">Entrar no Sistema</button>
        </form>
      </div>
    </div>
  )
}
