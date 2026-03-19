/**
 * Serviço de sincronização com o Supabase.
 * Sincroniza registros com sync_status = 'pending' do banco local para a nuvem.
 * Deve ser chamado periodicamente (ex.: a cada 5 min) e ao fechar o aplicativo.
 */

const { db, getPendingRecordsForSync, markAsSynced, ORDEM_SYNC } = require('../database')
const { hasInternetConnection } = require('../utils/internetCheck')
const { getAuthedSupabaseClient } = require('./supabaseClient')

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
async function enviarUpsert(supabase, tabela, registros) {
  if (registros.length === 0) return { count: 0 }
  const rows = registros.map((row) => {
    const normalized = normalizarLinha(row)
    // sync_status é coluna de controle apenas local; pode não existir na tabela do Supabase.
    // Removemos antes do upsert para evitar erros de esquema.
    // Outros campos de controle locais podem ser filtrados aqui no futuro, se necessário.
    const rest = { ...normalized }
    delete rest.sync_status
    return rest
  })
  const { error } = await supabase.from(tabela).upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return { count: rows.length }
}

function getTableColumns(tabela) {
  const rows = db.prepare(`PRAGMA table_info(${tabela})`).all()
  return rows.map((r) => r.name)
}

function createUpsertFromRemoteStmt(tabela) {
  // Inclui todas as colunas locais (menos sync_status); sync_status é controlado localmente.
  const cols = getTableColumns(tabela).filter((c) => c !== 'sync_status')
  const insertCols = [...cols, 'sync_status']
  const placeholders = insertCols.map(() => '?').join(',')

  const updateCols = cols.filter((c) => c !== 'id')
  const updateSet = updateCols.map((c) => `${c} = excluded.${c}`).join(', ')

  // Só atualiza se o registro local não estiver pendente (evita sobrescrever alterações locais)
  const sql = `
    INSERT INTO ${tabela} (${insertCols.join(',')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET
      ${updateSet}${updateSet ? ',' : ''}
      sync_status = 'synced'
    WHERE ${tabela}.sync_status != 'pending'
  `

  return { stmt: db.prepare(sql), cols }
}

async function pullTabelaDoSupabase(supabase, tabela) {
  const batch = 1000
  let from = 0
  let total = 0

  const { stmt, cols } = createUpsertFromRemoteStmt(tabela)

  while (true) {
    const { data, error } = await supabase
      .from(tabela)
      .select('*')
      .order('id', { ascending: true })
      .range(from, from + batch - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    db.transaction(() => {
      for (const row of data) {
        const values = []
        for (const c of cols) {
          values.push(Object.prototype.hasOwnProperty.call(row, c) ? row[c] : null)
        }
        values.push('synced')
        stmt.run(...values)
      }
    })()

    total += data.length
    if (data.length < batch) break
    from += batch
  }

  return { tabela, pulled: total }
}

/**
 * Envia pendentes de uma tabela: busca pendentes, envia ao Supabase, marca como synced.
 */
async function enviarPendentesTabela(supabase, tabela) {
  const registros = getPendingRecordsForSync(tabela)
  if (registros.length === 0) return { tabela, count: 0 }
  await enviarUpsert(supabase, tabela, registros)
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

  // Verifica conectividade antes de tentar autenticar no Supabase
  // para evitar erro genérico "fetch failed" em ambiente sem internet.
  const temInternet = await hasInternetConnection()
  if (!temInternet) {
    log('Sem conexão com a internet. Sincronização adiada.')
    return { success: false, error: 'Sem conexão com a internet' }
  }

  const { client: supabase, error: supabaseError } = await getAuthedSupabaseClient()
  if (!supabase) {
    logError(supabaseError || 'Supabase não configurado.', null)
    return { success: false, error: supabaseError || 'Supabase não configurado' }
  }

  let totalSincronizados = 0
  const resultados = []

  try {
    // 1) Envia alterações locais (pending -> Supabase)
    for (const tabela of ORDEM_SYNC) {
      try {
        const r = await enviarPendentesTabela(supabase, tabela)
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

    // 2) Baixa o estado do Supabase para o SQLite local (multi-PC)
    let totalPulled = 0
    for (const tabela of ORDEM_SYNC) {
      try {
        const r = await pullTabelaDoSupabase(supabase, tabela)
        totalPulled += r.pulled
      } catch (err) {
        logError(`Erro ao puxar tabela "${tabela}" do Supabase.`, err)
        throw err
      }
    }

    log(`Sincronização concluída. Enviados: ${totalSincronizados} | Baixados: ${totalPulled}.`)
    return { success: true, totalSincronizados, totalPulled, resultados }
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
