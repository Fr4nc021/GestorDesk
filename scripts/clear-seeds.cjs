// Remove registros gerados pelos scripts de seed (produtos/vendas)
// Critério:
// - Todos os produtos vinculados ao artesão "Artesão Seed"
// - Todas as vendas (e itens/pagamentos) que usam apenas esses produtos
// Rode com: npm run seed:clear

const path = require('path')
const { app } = require('electron')

const dbModulePath = path.join(__dirname, '..', 'electron', 'database.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dbModule = require(dbModulePath)
const { db, excluirVenda } = dbModule

function logInfo(msg) {
  console.log(`[INFO] ${msg}`)
}

function logError(msg, err) {
  console.error(`[ERROR] ${msg}`)
  if (err) console.error(err)
}

function executarLimpeza() {
  logInfo('Iniciando limpeza de registros criados HOJE...')

  // 1) Apagar vendas de hoje usando a mesma lógica de excluirVenda (restaura estoque)
  const vendasHoje = db
    .prepare(`
      SELECT id FROM vendas
      WHERE date(data) = date('now', 'localtime')
    `)
    .all()

  if (vendasHoje.length > 0) {
    logInfo(`Encontradas ${vendasHoje.length} vendas de hoje. Removendo...`)
    for (const v of vendasHoje) {
      try {
        excluirVenda(v.id)
      } catch (err) {
        logError(`Erro ao excluir venda id=${v.id}`, err)
      }
    }
  } else {
    logInfo('Nenhuma venda registrada hoje.')
  }

  // 2) Apagar movimentações de caixa de hoje (caso existam testes manuais)
  const apagadasCaixa = db
    .prepare(`
      DELETE FROM movimentacoes_caixa
      WHERE date(data) = date('now', 'localtime')
    `)
    .run().changes
  logInfo(`Movimentações de caixa removidas hoje: ${apagadasCaixa}.`)

  // 3) Apagar produtos criados hoje (com ou sem venda)
  const produtosHoje = db
    .prepare(`
      SELECT id
      FROM produtos
      -- produtos usam datetime('now') (UTC) na criação, então comparamos com date('now') em UTC
      WHERE date(created_at) = date('now')
    `)
    .all()
    .map((p) => p.id)

  if (produtosHoje.length > 0) {
    const placeholders = produtosHoje.map(() => '?').join(',')

    logInfo(
      `Encontrados ${produtosHoje.length} produtos criados hoje (com ou sem venda). Removendo...`,
    )

    // 3.1) Apagar vendas (de qualquer data) que envolvam esses produtos
    const vendasComProdutosHoje = db
      .prepare(
        `
        SELECT DISTINCT venda_id
        FROM vendas_itens
        WHERE produto_id IN (${placeholders})
      `,
      )
      .all(...produtosHoje)
      .map((v) => v.venda_id)

    if (vendasComProdutosHoje.length > 0) {
      logInfo(
        `Encontradas ${vendasComProdutosHoje.length} vendas que usam produtos criados hoje. Excluindo...`,
      )
      for (const id of vendasComProdutosHoje) {
        try {
          excluirVenda(id)
        } catch (err) {
          logError(`Erro ao excluir venda id=${id} (ligada a produto de hoje)`, err)
        }
      }
    }

    // 3.2) Apagar movimentações de estoque relacionadas a esses produtos (qualquer data)
    db.prepare(
      `
      DELETE FROM movimentacoes_estoque
      WHERE produto_id IN (${placeholders})
    `,
    ).run(...produtosHoje)

    // 3.3) Finalmente, apagar os próprios produtos
    db.prepare(`DELETE FROM produtos WHERE id IN (${placeholders})`).run(...produtosHoje)
  } else {
    logInfo('Nenhum produto criado hoje encontrado.')
  }

  logInfo('Limpeza de registros de HOJE concluída com sucesso.')
  app.exit(0)
}

app
  .whenReady()
  .then(executarLimpeza)
  .catch((err) => {
    logError('Erro ao executar limpeza de seeds', err)
    app.exit(1)
  })

