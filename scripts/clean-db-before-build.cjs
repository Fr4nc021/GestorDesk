const path = require('path')
const Database = require('better-sqlite3')

const dbPath = path.join(__dirname, '..', 'database.db')
const isDryRun = process.argv.includes('--dry-run')

function limparBancoAntesDoBuild() {
  let db
  try {
    console.log(`[clean-db] Abrindo banco: ${dbPath}`)
    db = new Database(dbPath)

    const tabelas = db
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
          AND name <> 'usuarios'
        ORDER BY name
      `)
      .all()
      .map((row) => row.name)

    if (tabelas.length === 0) {
      console.log('[clean-db] Nenhuma tabela para limpar (exceto usuarios).')
      return
    }

    console.log(`[clean-db] Tabelas alvo (${tabelas.length}): ${tabelas.join(', ')}`)

    if (isDryRun) {
      console.log('[clean-db] DRY RUN ativo: nenhuma alteracao foi aplicada.')
      return
    }

    db.pragma('foreign_keys = OFF')

    const executarLimpeza = db.transaction(() => {
      for (const tabela of tabelas) {
        db.prepare(`DELETE FROM ${tabela}`).run()
        console.log(`[clean-db] Dados removidos da tabela: ${tabela}`)
      }

      // Reseta apenas os IDs das tabelas limpas (preserva usuarios).
      for (const tabela of tabelas) {
        db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tabela)
      }
    })

    executarLimpeza()
    db.pragma('foreign_keys = ON')
    console.log('[clean-db] Limpeza concluida com sucesso.')
  } catch (error) {
    console.error('[clean-db] Erro ao limpar banco:', error?.message || error)
    process.exitCode = 1
  } finally {
    if (db) db.close()
  }
}

limparBancoAntesDoBuild()
