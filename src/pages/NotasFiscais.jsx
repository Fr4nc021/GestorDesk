import { useState } from 'react'
import NotasEntrada from './NotasEntrada'
import NotasEmitidas from './NotasEmitidas'

/** Notas fiscais: notas de entrada (importação/SEFAZ) e as NF-e de devolução já emitidas. */
export default function NotasFiscais() {
  const [aba, setAba] = useState('entrada')

  return (
    <div className="notas-fiscais">
      <div className="vendas-abas notas-fiscais-abas">
        <button type="button" className={aba === 'entrada' ? 'ativa' : ''} onClick={() => setAba('entrada')}>
          Notas de entrada
        </button>
        <button type="button" className={aba === 'devolucao' ? 'ativa' : ''} onClick={() => setAba('devolucao')}>
          Notas de devolução
        </button>
      </div>
      {aba === 'entrada' ? <NotasEntrada /> : <NotasEmitidas somenteDevolucoes />}
    </div>
  )
}
