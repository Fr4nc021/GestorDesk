const { validarConfigPublicacao } = require('../electron/atualizacaoPolitica.cjs')
const { avaliarBancoParaPublicacao, caminhoBancoDoProjeto } = require('./verificar-banco-publicacao.cjs')

function validarReleaseAtual() {
  const pkg = require('../package.json')
  const config = validarConfigPublicacao({
    publish: pkg.build?.publish,
    tag: process.env.GITHUB_REF_NAME || '',
    version: pkg.version,
    token: process.env.GH_TOKEN || '',
    exigirToken: true,
    exigirTag: true,
  })

  const banco = avaliarBancoParaPublicacao(caminhoBancoDoProjeto())
  const erros = [...config.erros]
  if (!banco.ok) {
    erros.push(
      'O database.db na raiz do projeto tem dados da loja ou não pôde ser lido. A publicação foi interrompida para não enviar esse arquivo.',
    )
  }

  return { ok: erros.length === 0, erros, banco }
}

if (require.main === module) {
  const resultado = validarReleaseAtual()
  if (!resultado.ok) {
    for (const erro of resultado.erros) console.error(`[release] ${erro}`)
    process.exit(1)
  }
  console.log('[release] Tag, repositório, token e banco conferidos.')
}

module.exports = { validarReleaseAtual }
