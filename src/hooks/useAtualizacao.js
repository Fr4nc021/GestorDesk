import { useEffect, useState } from 'react'

const ESTADO_VAZIO = {
  status: 'idle',
  versaoAtual: '',
  versaoNova: null,
  progresso: null,
  mensagem: '',
}

export function useAtualizacao() {
  const temApi = typeof window !== 'undefined' && Boolean(window.electronAPI?.atualizacaoEstado)
  const [estado, setEstado] = useState(temApi ? null : ESTADO_VAZIO)

  useEffect(() => {
    const api = window.electronAPI
    if (!api?.atualizacaoEstado) return undefined
    let ativo = true

    api.atualizacaoEstado()
      .then((dados) => {
        if (ativo && dados) setEstado(dados)
      })
      .catch(() => {
        if (!ativo) return
        setEstado({
          ...ESTADO_VAZIO,
          status: 'error',
          mensagem: 'Não foi possível verificar atualizações.',
        })
      })

    const cancelar = api.onAtualizacao?.((dados) => {
      if (ativo) setEstado(dados)
    })

    return () => {
      ativo = false
      if (typeof cancelar === 'function') cancelar()
    }
  }, [])

  async function instalar() {
    if (!window.electronAPI?.atualizacaoInstalar) return null
    return window.electronAPI.atualizacaoInstalar()
  }

  async function verificar() {
    if (!window.electronAPI?.atualizacaoVerificar) return null
    const dados = await window.electronAPI.atualizacaoVerificar()
    if (dados) setEstado(dados)
    return dados
  }

  return { estado, instalar, verificar, temApi }
}
