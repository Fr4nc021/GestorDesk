// electron/sync.js
const { getPendingRecordsForSync, markAsSynced, ORDEM_SYNC } = require('./database')
const { getAuthedSupabaseClient } = require('./services/supabaseClient')

let supabase = null

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

async function enviarUpsert(tabela, registros) {
  if (registros.length === 0) return { count: 0 }
  const rows = registros.map(normalizarLinha)
  const { error } = await supabase.from(tabela).upsert(rows, { onConflict: 'id' })
  if (error) throw error
  return { count: rows.length }
}

async function sincronizarTabela(tabela) {
  const registros = getPendingRecordsForSync(tabela)
  if (registros.length === 0) return { tabela, count: 0 }
  await enviarUpsert(tabela, registros)
  const ids = registros.map(r => r.id)
  markAsSynced(tabela, ids)
  return { tabela, count: registros.length }
}

async function executarSincronizacao() {
  const { client, error } = await getAuthedSupabaseClient()
  if (!client) return { success: false, reason: error || 'Supabase não configurado' }
  supabase = client
  const resultados = []
  for (const tabela of ORDEM_SYNC) {
    try {
      const r = await sincronizarTabela(tabela)
      resultados.push(r)
    } catch (err) {
      console.error(`[Sync] Erro em ${tabela}:`, err.message)
      throw err
    }
  }
  return { success: true, resultados }
}

module.exports = { executarSincronizacao }
