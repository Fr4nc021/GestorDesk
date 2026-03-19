const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || ''
const SUPABASE_LOGIN = process.env.SUPABASE_LOGIN || ''
const SUPABASE_SENHA = process.env.SUPABASE_SENHA || ''
const SUPABASE_AUTH_DOMAIN = process.env.SUPABASE_AUTH_DOMAIN || 'gestordesk.local'

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_LOGIN || !SUPABASE_SENHA) {
  console.error(
    '[CLEANUP] SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_LOGIN e SUPABASE_SENHA precisam estar configurados no .env.',
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })

async function main() {
  const email = `${String(SUPABASE_LOGIN).trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_')}@${SUPABASE_AUTH_DOMAIN}`
  const { error: authError } = await supabase.auth.signInWithPassword({
    email,
    password: SUPABASE_SENHA,
  })
  if (authError) {
    console.error('[CLEANUP] Falha ao autenticar no Supabase:', authError.message || authError)
    process.exit(1)
  }

  console.log('[CLEANUP] Buscando produtos com synced = 0 no Supabase...')

  const { data: produtos, error } = await supabase
    .from('produtos')
    .select('id, nome, synced')
    .eq('synced', 0)

  if (error) {
    console.error('[CLEANUP] Erro ao buscar produtos:', error.message || error)
    process.exit(1)
  }

  const total = produtos?.length || 0
  console.log(`[CLEANUP] Encontrados ${total} produto(s) com synced = 0.`)

  if (total === 0) {
    console.log('[CLEANUP] Nada para apagar.')
    process.exit(0)
  }

  // Apenas para conferência rápida no log (não imprime tudo se houver muitos)
  const preview = produtos.slice(0, 10).map((p) => `${p.id} - ${p.nome}`)
  console.log('[CLEANUP] Alguns dos produtos que serão apagados:')
  preview.forEach((line) => console.log('  -', line))
  if (total > preview.length) {
    console.log(`  ... e mais ${total - preview.length} produto(s).`)
  }

  const ids = produtos.map((p) => p.id)

  console.log(
    '[CLEANUP] Apagando movimentações de estoque vinculadas a esses produtos (movimentacoes_estoque)...',
  )

  const { error: delMovError } = await supabase
    .from('movimentacoes_estoque')
    .delete()
    .in('produto_id', ids)

  if (delMovError) {
    console.error(
      '[CLEANUP] Erro ao apagar movimentações de estoque:',
      delMovError.message || delMovError,
    )
    process.exit(1)
  }

  console.log('[CLEANUP] Apagando itens de venda vinculados a esses produtos (vendas_itens)...')

  const { error: delItensError } = await supabase
    .from('vendas_itens')
    .delete()
    .in('produto_id', ids)

  if (delItensError) {
    console.error('[CLEANUP] Erro ao apagar itens de venda:', delItensError.message || delItensError)
    process.exit(1)
  }

  console.log('[CLEANUP] Apagando todos os produtos com synced = 0 no Supabase...')

  const { error: deleteError } = await supabase.from('produtos').delete().in('id', ids)

  if (deleteError) {
    console.error('[CLEANUP] Erro ao apagar produtos:', deleteError.message || deleteError)
    process.exit(1)
  }

  console.log(
    `[CLEANUP] Remoção concluída. ${total} produto(s) com synced = 0 e seus itens de venda associados foram apagados no Supabase.`,
  )

  // --- Limpeza de vendas com synced = 0 (e seus vínculos) ---
  console.log('[CLEANUP] Buscando vendas com synced = 0 no Supabase...')

  const { data: vendas, error: vendasError } = await supabase
    .from('vendas')
    .select('id, synced')
    .eq('synced', 0)

  if (vendasError) {
    console.error('[CLEANUP] Erro ao buscar vendas:', vendasError.message || vendasError)
    process.exit(1)
  }

  const totalVendas = vendas?.length || 0
  console.log(`[CLEANUP] Encontradas ${totalVendas} venda(s) com synced = 0.`)

  if (totalVendas > 0) {
    const vendaIds = vendas.map((v) => v.id)

    console.log(
      '[CLEANUP] Apagando pagamentos e itens vinculados a essas vendas (vendas_pagamentos, vendas_itens)...',
    )

    const { error: delPagError } = await supabase
      .from('vendas_pagamentos')
      .delete()
      .in('venda_id', vendaIds)

    if (delPagError) {
      console.error(
        '[CLEANUP] Erro ao apagar pagamentos de vendas:',
        delPagError.message || delPagError,
      )
      process.exit(1)
    }

    const { error: delItensVendaError } = await supabase
      .from('vendas_itens')
      .delete()
      .in('venda_id', vendaIds)

    if (delItensVendaError) {
      console.error(
        '[CLEANUP] Erro ao apagar itens de vendas:',
        delItensVendaError.message || delItensVendaError,
      )
      process.exit(1)
    }

    console.log('[CLEANUP] Apagando movimentações de caixa com synced = 0...')

    const { error: delCaixaError } = await supabase
      .from('movimentacoes_caixa')
      .delete()
      .eq('synced', 0)

    if (delCaixaError) {
      console.error(
        '[CLEANUP] Erro ao apagar movimentações de caixa:',
        delCaixaError.message || delCaixaError,
      )
      process.exit(1)
    }

    console.log('[CLEANUP] Apagando as próprias vendas com synced = 0...')

    const { error: delVendasError } = await supabase.from('vendas').delete().in('id', vendaIds)

    if (delVendasError) {
      console.error('[CLEANUP] Erro ao apagar vendas:', delVendasError.message || delVendasError)
      process.exit(1)
    }

    console.log(
      `[CLEANUP] Remoção de vendas concluída. ${totalVendas} venda(s) com synced = 0 e seus vínculos foram apagados no Supabase.`,
    )
  } else {
    console.log('[CLEANUP] Nenhuma venda com synced = 0 encontrada para limpar.')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error('[CLEANUP] Erro inesperado:', err)
  process.exit(1)
})

