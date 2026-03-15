/**
 * Utilitário para verificação de conectividade com a internet.
 * Usado pelo serviço de sincronização para decidir se deve tentar enviar dados ao Supabase.
 */

const https = require('https')

/** URL usada para teste de conectividade (resposta rápida e estável) */
const PING_URL = 'https://www.google.com/generate_204'
const TIMEOUT_MS = 5000

/**
 * Verifica se há conexão com a internet.
 * Faz uma requisição HEAD leve a um serviço externo; em caso de timeout ou erro, retorna false.
 * @returns {Promise<boolean>} true se houver conexão, false caso contrário
 */
function hasInternetConnection() {
  return new Promise((resolve) => {
    const url = new URL(PING_URL)
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'GET',
        timeout: TIMEOUT_MS,
      },
      (res) => {
        resolve(res.statusCode === 204 || res.statusCode === 200)
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.setTimeout(TIMEOUT_MS)
    req.end()
  })
}

module.exports = { hasInternetConnection }
