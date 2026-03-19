const path = require('path')
const { app } = require('electron')
const dotenvPath = path.join(__dirname, '..', '.env')

// Carrega variáveis de ambiente (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_AUTH_EMAIL, etc.)
require('dotenv').config({ path: dotenvPath })

// Carrega módulos internos
const dbModulePath = path.join(__dirname, '..', 'electron', 'database.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbModule = require(dbModulePath)
const { db, ORDEM_SYNC } = dbModule

const syncServicePath = path.join(__dirname, '..', 'electron', 'services', 'syncService.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { syncWithSupabase } = require(syncServicePath)

function logInfo(msg) {
  console.log(`[FULL-RESYNC] ${msg}`)
}

function logError(msg, err) {
  console.error(`[FULL-RESYNC] ${msg}`)
  if (err) console.error(err)
}

function marcarTudoComoPending() {
  logInfo('Marcando todos os registros locais como sync_status = "pending"...')
  db.transaction(() => {
    for (const tabela of ORDEM_SYNC) {
      const sql = `UPDATE ${tabela} SET sync_status = 'pending'`
      db.prepare(sql).run()
    }
  })()
  logInfo('Todos os registros locais foram marcados como pendentes.')
}

async function executarFullResync() {
  try {
    marcarTudoComoPending()

    logInfo('Iniciando sincronização completa com o Supabase...')
    const resultado = await syncWithSupabase()

    if (!resultado.success) {
      logError('Sincronização falhou.', resultado.error)
      app.exit(1)
      return
    }

    logInfo(
      `Sincronização concluída com sucesso. Total sincronizado: ${
        resultado.totalSincronizados ?? 0
      } registro(s).`,
    )
    if (Array.isArray(resultado.resultados)) {
      for (const r of resultado.resultados) {
        logInfo(`Tabela ${r.tabela}: ${r.count ?? 0} registro(s) enviados.`)
      }
    }

    logInfo('Full resync finalizado. O Supabase e o banco local devem convergir após o pull.')
    app.exit(0)
  } catch (err) {
    logError('Erro inesperado durante o full-resync.', err)
    app.exit(1)
  }
}

app
  .whenReady()
  .then(executarFullResync)
  .catch((err) => {
    logError('Falha ao iniciar o full-resync.', err)
    app.exit(1)
  })

