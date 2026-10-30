/** Mensagem de um erro vindo do processo principal, sem o prefixo técnico do Electron. */
export function mensagemErro(err, padrao = 'Ocorreu um erro.') {
  const texto = String(err?.message || err || '').trim()
  if (!texto) return padrao
  return texto.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')
}
