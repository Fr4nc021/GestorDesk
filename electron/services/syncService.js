/**
 * Sincronização com Supabase: envia pendentes do SQLite e puxa alterações da nuvem.
 * Chamar periodicamente (ex.: 5 min) e ao fechar o app.
 */

const { db, getPendingRecordsForSync, markAsSynced, ORDEM_SYNC } = require('../database')
const { hasInternetConnection } = require('../utils/internetCheck')
const { getAuthedSupabaseClient } = require('./supabaseClient')

function normalizarTexto(v) {
  return String(v || '').trim()
}

function reatribuirVariacaoValoresParaTipoRemoto(localId, remoteId) {
  const vals = db.prepare('SELECT id FROM variacao_valores WHERE tipo_variacao_id = ?').all(localId)
  for (const v of vals) {
    const valorRow = db.prepare('SELECT valor FROM variacao_valores WHERE id = ?').get(v.id)
    const val = normalizarTexto(valorRow?.valor)
    const dup = db.prepare('SELECT id FROM variacao_valores WHERE tipo_variacao_id = ? AND valor = ?').get(remoteId, val)
    if (dup) {
      db.prepare('DELETE FROM variacao_valores WHERE id = ?').run(v.id)
    } else {
      db.prepare('UPDATE variacao_valores SET tipo_variacao_id = ? WHERE id = ?').run(remoteId, v.id)
    }
  }
}

/**
 * Alinha PK local ao id remoto quando o mesmo nome já existe na nuvem com outro id.
 * Evita violação de UNIQUE em tipos_variacao (nome).
 */
function realizarTipoVariacaoLocalParaRemotoId(localId, remoteId) {
  if (localId === remoteId) return
  const localRow = db.prepare('SELECT nome FROM tipos_variacao WHERE id = ?').get(localId)
  if (!localRow) return
  const existente = db.prepare('SELECT id, nome FROM tipos_variacao WHERE id = ?').get(remoteId)
  if (existente && normalizarTexto(existente.nome) !== normalizarTexto(localRow.nome)) {
    console.warn(`[Sync] Ignorando alinhamento tipos_variacao: id ${remoteId} já usado com outro nome.`)
    return
  }

  db.pragma('foreign_keys = OFF')
  try {
    if (existente) {
      reatribuirVariacaoValoresParaTipoRemoto(localId, remoteId)
      db.prepare('DELETE FROM tipos_variacao WHERE id = ?').run(localId)
    } else {
      reatribuirVariacaoValoresParaTipoRemoto(localId, remoteId)
      db.prepare('UPDATE tipos_variacao SET id = ? WHERE id = ?').run(remoteId, localId)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

/**
 * Alinha id local ao remoto para o mesmo par (tipo_variacao_id, valor).
 * Evita conflito com UNIQUE (tipo_variacao_id, valor) no Postgres em upsert por id.
 */
function realizarVariacaoValorLocalParaRemotoId(localId, remoteId) {
  if (localId === remoteId) return
  const conflito = db.prepare('SELECT id FROM variacao_valores WHERE id = ?').get(remoteId)
  db.pragma('foreign_keys = OFF')
  try {
    if (conflito) {
      db.prepare('DELETE FROM variacao_valores WHERE id = ?').run(localId)
    } else {
      db.prepare('UPDATE variacao_valores SET id = ? WHERE id = ?').run(remoteId, localId)
    }
  } finally {
    db.pragma('foreign_keys = ON')
  }
}

async function alinharTiposVariacaoComSupabase(supabase) {
  const { data: remote, error } = await supabase.from('tipos_variacao').select('id, nome')
  if (error) throw error

  const idPorNome = new Map()
  for (const r of remote || []) {
    const nome = normalizarTexto(r.nome)
    if (!nome) continue
    if (!idPorNome.has(nome)) idPorNome.set(nome, r.id)
  }

  const locais = db.prepare('SELECT id, nome FROM tipos_variacao WHERE deleted_at IS NULL').all()
  db.transaction(() => {
    for (const row of locais) {
      const nome = normalizarTexto(row.nome)
      const remoteId = idPorNome.get(nome)
      if (!remoteId || remoteId === row.id) continue
      realizarTipoVariacaoLocalParaRemotoId(row.id, remoteId)
    }
  })()
}

async function alinharVariacaoValoresComSupabase(supabase) {
  const { data: remote, error } = await supabase.from('variacao_valores').select('id, tipo_variacao_id, valor')
  if (error) throw error

  const chaveTipoEValor = (tipoId, valor) => `${tipoId}:${normalizarTexto(valor)}`
  const idPorChave = new Map()
  for (const r of remote || []) {
    const k = chaveTipoEValor(r.tipo_variacao_id, r.valor)
    if (!idPorChave.has(k)) idPorChave.set(k, r.id)
  }

  const locais = db.prepare('SELECT id, tipo_variacao_id, valor FROM variacao_valores WHERE deleted_at IS NULL').all()
  db.transaction(() => {
    for (const row of locais) {
      const remoteId = idPorChave.get(chaveTipoEValor(row.tipo_variacao_id, row.valor))
      if (!remoteId || remoteId === row.id) continue
      realizarVariacaoValorLocalParaRemotoId(row.id, remoteId)
    }
  })()
}

/** Prepara linha do SQLite para o Supabase (ex.: números não inteiros). */
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

async function enviarUpsert(supabase, tabela, registros) {
  if (registros.length === 0) return { count: 0 }
  const rows = registros.map((row) => {
    const normalized = normalizarLinha(row)
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
  const colunas = getTableColumns(tabela).filter((c) => c !== 'sync_status')
  const insertCols = [...colunas, 'sync_status']
  const placeholders = insertCols.map(() => '?').join(',')

  const updateCols = colunas.filter((c) => c !== 'id')
  const updateSet = updateCols.map((c) => `${c} = excluded.${c}`).join(', ')

  const sql = `
    INSERT INTO ${tabela} (${insertCols.join(',')})
    VALUES (${placeholders})
    ON CONFLICT(id) DO UPDATE SET
      ${updateSet}${updateSet ? ',' : ''}
      sync_status = 'synced'
    WHERE ${tabela}.sync_status != 'pending'
  `

  return { stmt: db.prepare(sql), colunas }
}

async function pullTabelaDoSupabase(supabase, tabela) {
  const batch = 1000
  let from = 0
  let total = 0

  const { stmt, colunas } = createUpsertFromRemoteStmt(tabela)

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
        for (const c of colunas) {
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

async function enviarPendentesTabela(supabase, tabela) {
  const registros = getPendingRecordsForSync(tabela)
  if (registros.length === 0) return { tabela, count: 0 }
  await enviarUpsert(supabase, tabela, registros)
  const ids = registros.map((r) => r.id)
  markAsSynced(tabela, ids)
  return { tabela, count: registros.length }
}

/**
 * Sincronização completa: internet, auth, alinhamento de ids, push pendentes, pull remoto.
 * @returns {{ success: boolean, totalSincronizados?: number, totalPulled?: number, resultados?: Array<{ tabela: string, count: number }>, error?: string }}
 */
async function syncWithSupabase() {
  const log = (msg) => console.log(`[Sync] ${msg}`)
  const logError = (msg, err) => console.error(`[Sync] ${msg}`, err?.message || err)

  log('Início da sincronização.')

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
    await alinharTiposVariacaoComSupabase(supabase)
    await alinharVariacaoValoresComSupabase(supabase)

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

function iniciarSyncTimer() {
  const INTERVALO_MS = 5 * 60 * 1000
  syncWithSupabase().catch(() => {})
  const id = setInterval(() => {
    syncWithSupabase().catch(() => {})
  }, INTERVALO_MS)
  console.log('[Sync] Timer de sincronização automática iniciado (a cada 5 minutos).')
  return id
}

module.exports = { syncWithSupabase, iniciarSyncTimer }
