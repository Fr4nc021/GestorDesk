/**
 * Serviço de sincronização com o Supabase.
 * Sincroniza registros com sync_status = 'pending' do banco local para a nuvem.
 * Deve ser chamado periodicamente (ex.: a cada 5 min) e ao fechar o aplicativo.
 */

const { createClient } = require('@supabase/supabase-js')
const { getPendingRecordsForSync, markAsSynced, ORDEM_SYNC } = require('../database')
const { hasInternetConnection } = require('../utils/internetCheck')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
    : null

/**
 * Normaliza uma linha do SQLite para o formato esperado pelo Supabase (tipos e null).
 */
function normalizarLinha(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) {
      out[k] = null
      continue
    }
    if (typeof v === 'number' && !Number.isInteger(v)) out[k] = Number(v)
    else out[k] = v
  }
  return out
}

/**
 * Envia um lote de registros para uma tabela no Supabase (upsert por id).
 */
async function enviarUpsert(tabela, registros) {
  if (registros.length === 0) return { count: 0 }
  const rows = registros.map(normalizarLinha)
  const { error } = await supabase.from(tabela).upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return { count: rows.length }
}

/**
 * Sincroniza uma única tabela: busca pendentes, envia ao Supabase e marca como synced.
 */
async function sincronizarTabela(tabela) {
  const registros = getPendingRecordsForSync(tabela)
  if (registros.length === 0) return { tabela, count: 0 }
  await enviarUpsert(tabela, registros)
  const ids = registros.map((r) => r.id)
  markAsSynced(tabela, ids)
  return { tabela, count: registros.length }
}

/**
 * Executa a sincronização completa com o Supabase.
 * - Verifica conexão com a internet.
 * - Para cada tabela (na ordem de FKs), envia registros com sync_status = 'pending' e marca como 'synced'.
 * - Registra no console início, quantidade por tabela e erros.
 * @returns {{ success: boolean, totalSincronizados?: number, resultados?: Array<{ tabela: string, count: number }>, error?: string }}
 */
async function syncWithSupabase() {
  const log = (msg) => console.log(`[Sync] ${msg}`)
  const logError = (msg, err) => console.error(`[Sync] ${msg}`, err?.message || err)

  log('Início da sincronização.')

  if (!supabase) {
    logError('Supabase não configurado (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY).', null)
    return { success: false, error: 'Supabase não configurado' }
  }

  const temInternet = await hasInternetConnection()
  if (!temInternet) {
    log('Sem conexão com a internet. Sincronização adiada.')
    return { success: false, error: 'Sem conexão com a internet' }
  }

  let totalSincronizados = 0
  const resultados = []

  try {
    for (const tabela of ORDEM_SYNC) {
      try {
        const r = await sincronizarTabela(tabela)
        resultados.push(r)
        if (r.count > 0) {
          totalSincronizados += r.count
          log(`${tabela}: ${r.count} registro(s) sincronizado(s).`)
        }
      } catch (err) {
        logError(`Erro ao sincronizar tabela "${tabela}".`, err)
        throw err
      }
    }
    log(`Sincronização concluída. Total: ${totalSincronizados} registro(s).`)
    return { success: true, totalSincronizados, resultados }
  } catch (err) {
    logError('Falha na sincronização.', err)
    return { success: false, error: err?.message || String(err), resultados }
  }
}

/**
 * Inicia o timer de sincronização automática (a cada 5 minutos).
 * Retorna o id do setInterval para eventual cancelamento.
 */
function iniciarSyncTimer() {
  const INTERVALO_MS = 5 * 60 * 1000 // 5 minutos
  syncWithSupabase().catch(() => {})
  const id = setInterval(() => {
    syncWithSupabase().catch(() => {})
  }, INTERVALO_MS)
  console.log('[Sync] Timer de sincronização automática iniciado (a cada 5 minutos).')
  return id
}

module.exports = { syncWithSupabase, iniciarSyncTimer }
