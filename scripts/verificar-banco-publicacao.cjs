const fs = require('fs')
const path = require('path')
const { DatabaseSync } = require('node:sqlite')
const { bancoTemDadosDeLoja } = require('../electron/atualizacaoPolitica.cjs')

function contarTabela(db, tabela) {
  if (tabela !== 'produtos' && tabela !== 'vendas') return 0
  const existe = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).get(tabela)
  if (!existe) return 0
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${tabela}`).get()
  return Number(row?.n) || 0
}

function avaliarBancoParaPublicacao(dbPath) {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return { ok: true, motivo: 'ausente', produtos: 0, vendas: 0 }
  }

  let db
  try {
    db = new DatabaseSync(dbPath, { readOnly: true })
    const produtos = contarTabela(db, 'produtos')
    const vendas = contarTabela(db, 'vendas')
    const temDados = bancoTemDadosDeLoja({ produtos, vendas })
    return {
      ok: !temDados,
      motivo: temDados ? 'dados-da-loja' : 'vazio',
      produtos,
      vendas,
    }
  } catch (err) {
    return {
      ok: false,
      motivo: 'ilegivel',
      produtos: 0,
      vendas: 0,
      erro: err?.message || String(err),
    }
  } finally {
    try {
      db?.close()
    } catch {
      // A leitura já terminou. Fechar o handle não altera o arquivo.
    }
  }
}

function caminhoBancoDoProjeto() {
  return path.join(process.cwd(), 'database.db')
}

if (require.main === module) {
  const resultado = avaliarBancoParaPublicacao(caminhoBancoDoProjeto())
  if (!resultado.ok) {
    console.error(
      `[release] Publicação recusada (${resultado.motivo}). O database.db do projeto não pode ir para o GitHub com dados da loja.`,
    )
    process.exit(1)
  }
  console.log(`[release] Banco de publicação: ${resultado.motivo}.`)
}

module.exports = {
  avaliarBancoParaPublicacao,
  caminhoBancoDoProjeto,
}
