// electron/sync.js
const { createClient } = require('@supabase/supabase-js')
const { db } = require('./database')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('[Sync] SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar definidos. Sync desabilitado.')
}

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  : null

// Ordem respeitando FKs no Supabase
const TABELAS_COM_SYNCED = [
  'artesoes',
  'produtos',
  'vendas',
  'vendas_itens',
  'movimentacoes_caixa',
]

const TABELAS_SEM_SYNCED = [
  'usuarios',
  'tipos_variacao',
  'variacao_valores',
  'vendas_pagamentos',
  'movimentacoes_estoque',
]

// Ordem final: primeiro tabelas "pais", depois "filhas"
const ORDEM_SYNC = [
  'usuarios',
  'artesoes',
  'tipos_variacao',
  'variacao_valores',
  'produtos',
  'vendas',
  'vendas_itens',
  'vendas_pagamentos',
  'movimentacoes_estoque',
  'movimentacoes_caixa',
]

function tabelaTemColunaSynced(nomeTabela) {
  const cols = db.prepare(`PRAGMA table_info(${nomeTabela})`).all()
  return cols.some(c => c.name === 'synced')
}

function lerPendentes(tabela) {
  if (!tabelaTemColunaSynced(tabela)) {
    return db.prepare(`SELECT * FROM ${tabela}`).all()
  }
  return db.prepare(`SELECT * FROM ${tabela} WHERE synced = 0`).all()
}

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

function marcarSincronizados(tabela, ids) {
  if (ids.length === 0 || !tabelaTemColunaSynced(tabela)) return
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE ${tabela} SET synced = 1 WHERE id IN (${placeholders})`).run(...ids)
}

async function sincronizarTabela(tabela) {
  const registros = lerPendentes(tabela)
  if (registros.length === 0) return { tabela, count: 0 }
  await enviarUpsert(tabela, registros)
  if (tabelaTemColunaSynced(tabela)) {
    const ids = registros.map(r => r.id)
    marcarSincronizados(tabela, ids)
  }
  return { tabela, count: registros.length }
}

async function executarSincronizacao() {
  if (!supabase) {
    return { success: false, reason: 'Supabase não configurado' }
  }
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
