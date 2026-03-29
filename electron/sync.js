const { getPendingRecordsForSync, markAsSynced, ORDEM_SYNC } = require('./database')
const { getAuthedSupabaseClient } = require('./services/supabaseClient')

function normalizarLinha(registro) {
  const saida = {}
  for (const [chave, valor] of Object.entries(registro)) {
    if (valor == null) {
      saida[chave] = null
    } else if (typeof valor === 'number' && !Number.isInteger(valor)) {
      saida[chave] = Number(valor)
    } else {
      saida[chave] = valor
    }
  }
  return saida
}

async function enviarUpsert(clienteSupabase, nomeTabela, registros) {
  if (registros.length === 0) return { count: 0 }
  const linhas = registros.map(normalizarLinha)
  const { error } = await clienteSupabase.from(nomeTabela).upsert(linhas, { onConflict: 'id' })
  if (error) throw error
  return { count: linhas.length }
}

async function sincronizarTabela(clienteSupabase, nomeTabela) {
  const registros = getPendingRecordsForSync(nomeTabela)
  if (registros.length === 0) return { tabela: nomeTabela, count: 0 }
  await enviarUpsert(clienteSupabase, nomeTabela, registros)
  const ids = registros.map((r) => r.id)
  markAsSynced(nomeTabela, ids)
  return { tabela: nomeTabela, count: registros.length }
}

async function executarSincronizacao() {
  const { client, error } = await getAuthedSupabaseClient()
  if (!client) return { success: false, reason: error || 'Supabase não configurado' }

  const resultados = []
  for (const nomeTabela of ORDEM_SYNC) {
    try {
      const r = await sincronizarTabela(client, nomeTabela)
      resultados.push(r)
    } catch (err) {
      console.error(`[Sync] Erro em ${nomeTabela}:`, err.message)
      throw err
    }
  }
  return { success: true, resultados }
}

module.exports = { executarSincronizacao }
