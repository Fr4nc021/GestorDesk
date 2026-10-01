import { useAtualizacao } from '../hooks/useAtualizacao'

const STATUS_VISIVEIS = new Set(['available', 'downloading', 'downloaded', 'error'])

export default function AtualizacaoBanner() {
  const { estado, instalar, verificar, temApi } = useAtualizacao()
  if (!temApi || !estado || !STATUS_VISIVEIS.has(estado.status)) return null

  const progresso = typeof estado.progresso === 'number' ? estado.progresso : 0
  const erro = estado.status === 'error'

  return (
    <section
      className={`atualizacao-banner${erro ? ' atualizacao-banner-erro' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="atualizacao-banner-texto">
        <strong>
          {estado.status === 'downloaded' && 'Atualização pronta'}
          {estado.status === 'downloading' && 'Baixando atualização'}
          {estado.status === 'available' && 'Nova versão disponível'}
          {erro && 'Atualização indisponível'}
        </strong>
        <p>{estado.mensagem}</p>
        {(estado.status === 'downloading' || estado.status === 'available') && (
          <div
            className="atualizacao-progresso"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progresso}
          >
            <div className="atualizacao-progresso-barra" style={{ width: `${progresso}%` }} />
          </div>
        )}
      </div>
      {estado.status === 'downloaded' && (
        <button type="button" className="btn-sync-manual" onClick={instalar}>
          Reiniciar e instalar
        </button>
      )}
      {erro && (
        <button type="button" className="btn-sync-manual" onClick={verificar}>
          Tentar novamente
        </button>
      )}
    </section>
  )
}
