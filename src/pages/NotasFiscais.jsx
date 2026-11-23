import { useState } from 'react'
import NotasEntrada from './NotasEntrada'
import NotasEmitidas from './NotasEmitidas'
import DevolucaoFornecedor from '../components/DevolucaoFornecedor'

/** Notas fiscais: notas de entrada (importação/SEFAZ) e as NF-e de devolução (emissão e lista). */
export default function NotasFiscais() {
  const [aba, setAba] = useState('entrada')
  const [versao, setVersao] = useState(0)

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
      {aba === 'entrada' ? (
        <NotasEntrada />
      ) : (
        <>
          <DevolucaoFornecedor onGerada={() => setVersao((v) => v + 1)} />
          <NotasEmitidas key={versao} somenteDevolucoes />
        </>
      )}
    </div>
  )
}
