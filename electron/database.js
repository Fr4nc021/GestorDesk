const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

/** Modelo que acompanha o app (raiz do pacote / pasta do projeto em dev). */
const bundledDbPath = path.join(__dirname, '..', 'database.db')
const dbPath = process.env.GESTORDESK_DB_PATH || bundledDbPath

function openReadonlyDb(filePath) {
  try {
    return new Database(filePath, { readonly: true, fileMustExist: true })
  } catch {
    return null
  }
}

function countWhere(db, sql) {
  try {
    const row = db.prepare(sql).get()
    return typeof row?.n === 'number' ? row.n : 0
  } catch {
    return -1
  }
}

/** Banco ainda “de fábrica” para catálogo de variações (só seed Tamanho ou vazio). */
function isVariationCatalogStillDefault(db) {
  const tipos = countWhere(db, 'SELECT COUNT(*) as n FROM tipos_variacao WHERE deleted_at IS NULL')
  const vals = countWhere(db, 'SELECT COUNT(*) as n FROM variacao_valores WHERE deleted_at IS NULL')
  if (tipos < 0 || vals < 0) return false
  return tipos <= 1 && vals <= 4
}

/** Sem cadastro real ainda — seguro substituir pelo database.db da pasta do projeto. */
function isDatabaseStillUnused(db) {
  const prod = countWhere(db, 'SELECT COUNT(*) as n FROM produtos WHERE deleted_at IS NULL')
  const vend = countWhere(db, 'SELECT COUNT(*) as n FROM vendas WHERE deleted_at IS NULL')
  if (prod < 0 || vend < 0) return false
  return prod === 0 && vend === 0
}

function variationCatalogRicherThan(legacyDb, userDb) {
  const legacyTipos = countWhere(legacyDb, 'SELECT COUNT(*) as n FROM tipos_variacao WHERE deleted_at IS NULL')
  const userTipos = countWhere(userDb, 'SELECT COUNT(*) as n FROM tipos_variacao WHERE deleted_at IS NULL')
  const legacyValores = countWhere(legacyDb, 'SELECT COUNT(*) as n FROM variacao_valores WHERE deleted_at IS NULL')
  const userValores = countWhere(userDb, 'SELECT COUNT(*) as n FROM variacao_valores WHERE deleted_at IS NULL')
  if (legacyTipos < 0 || userTipos < 0 || legacyValores < 0 || userValores < 0) return false
  return legacyTipos > userTipos || legacyValores > userValores
}

// Garante que a pasta existe e, se não houver banco no destino, copia o modelo padrão (se existir)
const dbDir = path.dirname(dbPath)
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true })
}

const sameBundledAndUser =
  path.resolve(dbPath) === path.resolve(bundledDbPath)

if (!fs.existsSync(dbPath) && fs.existsSync(bundledDbPath)) {
  try {
    fs.copyFileSync(bundledDbPath, dbPath)
  } catch (_) {}
} else if (
  fs.existsSync(dbPath) &&
  fs.existsSync(bundledDbPath) &&
  !sameBundledAndUser
) {
  const userRO = openReadonlyDb(dbPath)
  const bundledRO = openReadonlyDb(bundledDbPath)
  if (
    userRO &&
    bundledRO &&
    isDatabaseStillUnused(userRO) &&
    isVariationCatalogStillDefault(userRO) &&
    variationCatalogRicherThan(bundledRO, userRO)
  ) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = `${dbPath}.antes-migracao-${stamp}`
    try {
      userRO.close()
      bundledRO.close()
      fs.copyFileSync(dbPath, backupPath)
      fs.copyFileSync(bundledDbPath, dbPath)
      console.log(
        `[DB] Catálogo de variações migrado de ${bundledDbPath} → ${dbPath} (backup: ${backupPath})`,
      )
    } catch (err) {
      console.error('[DB] Falha na migração do banco legado:', err?.message || err)
      try {
        userRO.close()
      } catch (_) {}
      try {
        bundledRO.close()
      } catch (_) {}
    }
  } else {
    try {
      userRO?.close()
    } catch (_) {}
    try {
      bundledRO?.close()
    } catch (_) {}
  }
}

const db = new Database(dbPath)

db.pragma('foreign_keys = ON')

/** Dígito verificador EAN-13 a partir dos 12 primeiros dígitos. */
function calcularDigitoVerificadorEAN13(codigo12) {
  const pesos = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3]
  let soma = 0
  for (let i = 0; i < 12; i++) {
    soma += parseInt(codigo12[i]) * pesos[i]
  }
  const resto = soma % 10
  return resto === 0 ? 0 : 10 - resto
}

/** Gera código EAN-13 único (base temporal + dígito verificador). */
function gerarCodigoBarras() {
  const base = Date.now().toString().slice(-11).padStart(12, '78900000000')
  const digito = calcularDigitoVerificadorEAN13(base)
  return base + digito
}

function initDatabase() {
  db.exec(`

    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      senha TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS artesoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone_whats TEXT,
      synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS produtos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      variacao TEXT CHECK(variacao IN ('P','M','G','GG') OR variacao IS NULL),
      preco_custo REAL NOT NULL DEFAULT 0,
      preco_venda REAL NOT NULL DEFAULT 0,
      estoque INTEGER NOT NULL DEFAULT 0,
      codigo_barras TEXT UNIQUE NOT NULL,
      artesao_id INTEGER NOT NULL,
      synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (artesao_id) REFERENCES artesoes(id)
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      valor_total REAL NOT NULL DEFAULT 0,
      forma_pagamento TEXT NOT NULL CHECK(forma_pagamento IN ('dinheiro','credito','debito','pix')),
      synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS vendas_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      synced INTEGER DEFAULT 0,
      deleted_at TEXT,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    CREATE TABLE IF NOT EXISTS vendas_pagamentos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      forma_pagamento TEXT NOT NULL CHECK(forma_pagamento IN ('dinheiro','credito','debito','pix')),
      valor REAL NOT NULL,
      deleted_at TEXT,
      FOREIGN KEY (venda_id) REFERENCES vendas(id)
    );

    CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),
      quantidade INTEGER NOT NULL,
      origem TEXT DEFAULT 'admin',
      data TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),
      valor REAL NOT NULL,
      forma_pagamento TEXT NOT NULL CHECK(forma_pagamento IN ('dinheiro','credito','debito','pix')),
      descricao TEXT,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tipos_variacao (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL UNIQUE,
      ordem INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS variacao_valores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo_variacao_id INTEGER NOT NULL,
      valor TEXT NOT NULL,
      ordem INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT,
      FOREIGN KEY (tipo_variacao_id) REFERENCES tipos_variacao(id) ON DELETE CASCADE,
      UNIQUE(tipo_variacao_id, valor)
    );
  `)
}

initDatabase()

// Migração idempotente: produtos.variacao sem CHECK fixo (valores dinâmicos).
try {
  const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='produtos'").get()
  if (tableInfo && tableInfo.sql && tableInfo.sql.includes("CHECK(variacao IN")) {
    db.pragma('foreign_keys = OFF')
    db.exec(`
      CREATE TABLE produtos_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        variacao TEXT,
        preco_custo REAL NOT NULL DEFAULT 0,
        preco_venda REAL NOT NULL DEFAULT 0,
        estoque INTEGER NOT NULL DEFAULT 0,
        codigo_barras TEXT UNIQUE NOT NULL,
        artesao_id INTEGER NOT NULL,
        synced INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (artesao_id) REFERENCES artesoes(id)
      );
      INSERT INTO produtos_new SELECT id, nome, variacao, preco_custo, preco_venda, estoque, codigo_barras, artesao_id, synced, created_at FROM produtos;
      DROP TABLE produtos;
      ALTER TABLE produtos_new RENAME TO produtos;
    `)
    db.pragma('foreign_keys = ON')
  }
} catch (_) {}

// Seed idempotente: tipo "Tamanho" e P/M/G/GG se não houver tipos.
try {
  const countTipos = db.prepare('SELECT COUNT(*) as n FROM tipos_variacao').get()
  if (countTipos.n === 0) {
    db.prepare('INSERT INTO tipos_variacao (nome, ordem) VALUES (?, ?)').run('Tamanho', 0)
    const tipoId = db.prepare('SELECT id FROM tipos_variacao WHERE nome = ?').get('Tamanho').id
    for (const v of ['P', 'M', 'G', 'GG']) {
      db.prepare('INSERT INTO variacao_valores (tipo_variacao_id, valor, ordem) VALUES (?, ?, ?)').run(tipoId, v, 0)
    }
  }
} catch (_) {}

const rowCount = db.prepare('SELECT COUNT(*) as n FROM usuarios').get()
if (rowCount.n === 0) {
  db.prepare('INSERT INTO usuarios (login, senha) VALUES (?, ?)').run('admin', 'admin')
}

// Coluna origem em movimentacoes_estoque (idempotente).
try {
  db.exec(`ALTER TABLE movimentacoes_estoque ADD COLUMN origem TEXT DEFAULT 'admin'`)
} catch (_) {}

// Migração idempotente: copiar forma/valor da venda para vendas_pagamentos.
try {
  db.exec(`
    INSERT INTO vendas_pagamentos (venda_id, forma_pagamento, valor)
    SELECT v.id, v.forma_pagamento, v.valor_total
    FROM vendas v
    WHERE NOT EXISTS (SELECT 1 FROM vendas_pagamentos vp WHERE vp.venda_id = v.id)
  `)
} catch (_) {}

/** Ordem das tabelas para migração de sync e envio ao Supabase (FKs). */
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
const TABELAS_COM_SYNCED_INT = ['artesoes', 'produtos', 'vendas', 'vendas_itens', 'movimentacoes_caixa']

function tabelaTemColuna(dbConn, nomeTabela, coluna) {
  const cols = dbConn.prepare(`PRAGMA table_info(${nomeTabela})`).all()
  return cols.some((c) => c.name === coluna)
}

for (const tabela of ORDEM_SYNC) {
  try {
    if (!tabelaTemColuna(db, tabela, 'sync_status')) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN sync_status TEXT DEFAULT 'pending'`)
    }
    if (TABELAS_COM_SYNCED_INT.includes(tabela) && tabelaTemColuna(db, tabela, 'synced')) {
      db.prepare(`UPDATE ${tabela} SET sync_status = 'synced' WHERE synced = 1`).run()
    }
    if (!tabelaTemColuna(db, tabela, 'deleted_at')) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN deleted_at TEXT`)
    }
  } catch (_) {}
}

function getPendingRecordsForSync(tabela) {
  if (!tabelaTemColuna(db, tabela, 'sync_status')) {
    return db.prepare(`SELECT * FROM ${tabela}`).all()
  }
  return db.prepare(`SELECT * FROM ${tabela} WHERE sync_status = 'pending'`).all()
}

function markAsSynced(tabela, ids) {
  if (ids.length === 0 || !tabelaTemColuna(db, tabela, 'sync_status')) return
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE ${tabela} SET sync_status = 'synced' WHERE id IN (${placeholders})`).run(...ids)
}

// --- Artesãos ---

function criarArtesao({ nome, telefone_whats = null }) {
  const stmt = db.prepare(`
    INSERT INTO artesoes (nome, telefone_whats) VALUES (?, ?)
  `)
  const result = stmt.run(nome, telefone_whats)
  return { id: result.lastInsertRowid, nome, telefone_whats }
}

function listarArtesoes() {
  const stmt = db.prepare(`
    SELECT a.*, COUNT(p.id) as quantidade_produtos
    FROM artesoes a
    LEFT JOIN produtos p ON p.artesao_id = a.id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
    GROUP BY a.id
    ORDER BY a.nome
  `)
  return stmt.all()
}

function atualizarArtesao(id, { nome, telefone_whats = null }) {
  const stmt = db.prepare(`
    UPDATE artesoes SET nome = ?, telefone_whats = ?, sync_status = 'pending' WHERE id = ?
  `)
  stmt.run(nome, telefone_whats, id)
  return { id }
}

function excluirArtesao(id) {
  const stmt = db.prepare(
    "UPDATE artesoes SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE id = ?",
  )
  stmt.run(id)
  return { id }
}

// --- Produtos ---

function criarProduto({ nome, variacao = null, preco_custo = 0, preco_venda = 0, estoque = 0, artesao_id }) {
  let codigo_barras = gerarCodigoBarras()
  const checkStmt = db.prepare('SELECT id FROM produtos WHERE codigo_barras = ?')

  while (checkStmt.get(codigo_barras)) {
    codigo_barras = gerarCodigoBarras()
  }

  const stmt = db.prepare(`
    INSERT INTO produtos (nome, variacao, preco_custo, preco_venda, estoque, codigo_barras, artesao_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(nome, variacao, preco_custo, preco_venda, estoque, codigo_barras, artesao_id)
  return {
    id: result.lastInsertRowid,
    nome,
    variacao,
    preco_custo,
    preco_venda,
    estoque,
    codigo_barras,
    artesao_id,
  }
}

function listarProdutos() {
  const stmt = db.prepare(`
    SELECT p.*, a.nome as artesao_nome
    FROM produtos p
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE p.deleted_at IS NULL
      AND (a.deleted_at IS NULL OR a.id IS NULL)
    ORDER BY p.nome
  `)
  return stmt.all()
}

function atualizarProduto(id, { nome, variacao = null, preco_custo = 0, preco_venda = 0, estoque = 0, artesao_id }) {
  const stmt = db.prepare(`
    UPDATE produtos SET nome = ?, variacao = ?, preco_custo = ?, preco_venda = ?, estoque = ?, artesao_id = ?, sync_status = 'pending'
    WHERE id = ?
  `)
  stmt.run(nome, variacao, preco_custo, preco_venda, estoque, artesao_id, id)
  return { id }
}

function excluirProduto(id) {
  const stmt = db.prepare(
    "UPDATE produtos SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE id = ?",
  )
  stmt.run(id)
  return { id }
}

function buscarProdutoPorCodigo(codigo_barras) {
  const stmt = db.prepare(`
    SELECT p.*, a.nome as artesao_nome
    FROM produtos p
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE p.codigo_barras = ?
  `)
  return stmt.get(codigo_barras.trim()) || null
}

// --- Tipos de Variação e Valores ---

function listarTiposVariacao() {
  const tipos = db.prepare(`
    SELECT * FROM tipos_variacao
    WHERE deleted_at IS NULL
    ORDER BY ordem, nome
  `).all()
  const valoresStmt = db.prepare(`
    SELECT id, tipo_variacao_id, valor, ordem FROM variacao_valores
    WHERE tipo_variacao_id = ?
      AND deleted_at IS NULL
    ORDER BY ordem, valor
  `)
  return tipos.map((t) => {
    const valores = valoresStmt.all(t.id)
    return { ...t, valores }
  })
}

function criarTipoVariacao({ nome, ordem = 0 }) {
  const nomeNormalizado = String(nome || '').trim()
  const ordemNormalizada = Number.isFinite(Number(ordem)) ? Number(ordem) : 0
  if (!nomeNormalizado) throw new Error('Nome da variação é obrigatório.')

  try {
    const stmt = db.prepare('INSERT INTO tipos_variacao (nome, ordem) VALUES (?, ?)')
    const result = stmt.run(nomeNormalizado, ordemNormalizada)
    return { id: result.lastInsertRowid, nome: nomeNormalizado, ordem: ordemNormalizada }
  } catch (err) {
    // Se já existir (inclusive soft-deletado), reativa e atualiza.
    if (String(err?.message || '').includes('UNIQUE constraint failed: tipos_variacao.nome')) {
      const existente = db.prepare('SELECT id FROM tipos_variacao WHERE nome = ?').get(nomeNormalizado)
      if (existente?.id) {
        db.prepare(
          "UPDATE tipos_variacao SET deleted_at = NULL, ordem = ?, sync_status = 'pending' WHERE id = ?",
        ).run(ordemNormalizada, existente.id)
        return { id: existente.id, nome: nomeNormalizado, ordem: ordemNormalizada }
      }
    }
    throw err
  }
}

function atualizarTipoVariacao(id, { nome, ordem }) {
  const stmt = db.prepare("UPDATE tipos_variacao SET nome = ?, ordem = ?, sync_status = 'pending' WHERE id = ?")
  stmt.run(nome.trim(), ordem ?? 0, id)
  return { id }
}

function excluirTipoVariacao(id) {
  const stmt = db.prepare(
    "UPDATE tipos_variacao SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE id = ?",
  )
  stmt.run(id)
  return { id }
}

function listarValoresVariacao(tipoVariacaoId) {
  const stmt = db.prepare(`
    SELECT * FROM variacao_valores
    WHERE tipo_variacao_id = ?
      AND deleted_at IS NULL
    ORDER BY ordem, valor
  `)
  return stmt.all(tipoVariacaoId)
}

function criarValorVariacao({ tipo_variacao_id, valor, ordem = 0 }) {
  const tipoIdNormalizado = parseInt(tipo_variacao_id, 10)
  const valorNormalizado = String(valor || '').trim()
  const ordemNormalizada = Number.isFinite(Number(ordem)) ? Number(ordem) : 0
  if (!tipoIdNormalizado || tipoIdNormalizado < 1) throw new Error('Tipo de variação inválido.')
  if (!valorNormalizado) throw new Error('Valor da variação é obrigatório.')

  try {
    const stmt = db.prepare('INSERT INTO variacao_valores (tipo_variacao_id, valor, ordem) VALUES (?, ?, ?)')
    const result = stmt.run(tipoIdNormalizado, valorNormalizado, ordemNormalizada)
    return { id: result.lastInsertRowid, tipo_variacao_id: tipoIdNormalizado, valor: valorNormalizado, ordem: ordemNormalizada }
  } catch (err) {
    // Se já existir (inclusive soft-deletado), reativa e atualiza.
    if (String(err?.message || '').includes('UNIQUE constraint failed: variacao_valores.tipo_variacao_id, variacao_valores.valor')) {
      const existente = db.prepare(
        'SELECT id FROM variacao_valores WHERE tipo_variacao_id = ? AND valor = ?',
      ).get(tipoIdNormalizado, valorNormalizado)
      if (existente?.id) {
        db.prepare(
          "UPDATE variacao_valores SET deleted_at = NULL, ordem = ?, sync_status = 'pending' WHERE id = ?",
        ).run(ordemNormalizada, existente.id)
        return { id: existente.id, tipo_variacao_id: tipoIdNormalizado, valor: valorNormalizado, ordem: ordemNormalizada }
      }
    }
    throw err
  }
}

function atualizarValorVariacao(id, { valor, ordem }) {
  const stmt = db.prepare("UPDATE variacao_valores SET valor = ?, ordem = ?, sync_status = 'pending' WHERE id = ?")
  stmt.run(valor.trim(), ordem ?? 0, id)
  return { id }
}

function excluirValorVariacao(id) {
  const stmt = db.prepare(
    "UPDATE variacao_valores SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE id = ?",
  )
  stmt.run(id)
  return { id }
}

function listarTodosValoresVariacao() {
  const stmt = db.prepare(`
    SELECT v.valor
    FROM variacao_valores v
    JOIN tipos_variacao t ON t.id = v.tipo_variacao_id
    WHERE v.deleted_at IS NULL
      AND t.deleted_at IS NULL
    ORDER BY t.ordem, t.nome, v.ordem, v.valor
  `)
  return stmt.all().map((r) => r.valor)
}

// --- Vendas ---

function criarVenda({ itens, forma_pagamento, valor_total: valorTotalInformado, pagamentos }) {
  const subtotalItens = itens.reduce((acc, item) => acc + item.quantidade * item.preco_unitario, 0)
  const valor_total = valorTotalInformado != null ? valorTotalInformado : subtotalItens

  const insertVenda = db.prepare(`
    INSERT INTO vendas (data, valor_total, forma_pagamento) VALUES (datetime('now', 'localtime'), ?, ?)
  `)
  const insertItem = db.prepare(`
    INSERT INTO vendas_itens (venda_id, produto_id, quantidade, preco_unitario)
    VALUES (?, ?, ?, ?)
  `)
  const updateEstoque = db.prepare(`
    UPDATE produtos SET estoque = estoque - ? WHERE id = ?
  `)
  const insertMovEstoque = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'saida', ?, 'pdv', datetime('now', 'localtime'))
  `)
  const insertPagamento = db.prepare(`
    INSERT INTO vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (?, ?, ?)
  `)

  const criarVendaComItens = db.transaction(() => {
    const result = insertVenda.run(valor_total, forma_pagamento)
    const vendaId = result.lastInsertRowid

    for (const item of itens) {
      insertItem.run(vendaId, item.produto_id, item.quantidade, item.preco_unitario)
      updateEstoque.run(item.quantidade, item.produto_id)
      insertMovEstoque.run(item.produto_id, item.quantidade)
    }

    const pagamentosEfetivos = Array.isArray(pagamentos) && pagamentos.length > 0
      ? pagamentos
      : [
          {
            forma: forma_pagamento,
            valor: valor_total,
          },
        ]

    for (const pg of pagamentosEfetivos) {
      const formaPg = pg.forma
      const valorPg = pg.valor != null ? pg.valor : 0
      insertPagamento.run(vendaId, formaPg, valorPg)
    }

    return vendaId
  })

  const vendaId = criarVendaComItens()
  return { id: vendaId, valor_total, forma_pagamento }
}

function listarVendas() {
  const vendas = db.prepare(`
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id AND deleted_at IS NULL) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id AND vi.deleted_at IS NULL
    LEFT JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE v.deleted_at IS NULL
    GROUP BY v.id
    ORDER BY v.data DESC
  `).all()
  return vendas
}

function listarVendasDoDia() {
  const vendas = db.prepare(`
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id AND deleted_at IS NULL) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id AND vi.deleted_at IS NULL
    LEFT JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE v.deleted_at IS NULL
      AND date(v.data) = date('now', 'localtime')
    GROUP BY v.id
    ORDER BY v.data ASC
  `).all()
  return vendas
}

function listarVendasPorData(dataISO) {
  const vendas = db.prepare(`
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id AND deleted_at IS NULL) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id AND vi.deleted_at IS NULL
    LEFT JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE v.deleted_at IS NULL
      AND date(v.data) = date(?)
    GROUP BY v.id
    ORDER BY v.data DESC
  `).all(dataISO)
  return vendas
}

function atribuirSequenciaPagamentosCaixa(rows) {
  const result = []
  let lastVendaId = null
  let sequencia = 0
  for (const row of rows) {
    if (row.venda_id !== lastVendaId) {
      lastVendaId = row.venda_id
      sequencia = 0
    }
    sequencia += 1
    result.push({ ...row, sequencia })
  }
  return result
}

const SQL_PAGAMENTOS_CAIXA_BASE = `
    SELECT
      v.id as venda_id,
      v.data,
      v.valor_total,
      vp.forma_pagamento,
      vp.valor,
      (SELECT GROUP_CONCAT(p.nome || ' x' || vi.quantidade) FROM vendas_itens vi JOIN produtos p ON p.id = vi.produto_id WHERE vi.venda_id = v.id AND vi.deleted_at IS NULL) as itens_resumo,
      (SELECT COALESCE(SUM(vi.quantidade), 0) FROM vendas_itens vi WHERE vi.venda_id = v.id AND vi.deleted_at IS NULL) as qtd_itens
    FROM vendas_pagamentos vp
    JOIN vendas v ON v.id = vp.venda_id
    WHERE v.deleted_at IS NULL
      AND vp.deleted_at IS NULL`

/** Pagamentos do Caixa por dia ou intervalo (uma linha por forma de pagamento; sequência por venda). */
function listarPagamentosCaixaPorData(dataISO) {
  const rows = db
    .prepare(
      `${SQL_PAGAMENTOS_CAIXA_BASE}
      AND date(v.data) = date(?)
    ORDER BY v.data DESC, v.id DESC, vp.id ASC`,
    )
    .all(dataISO)
  return atribuirSequenciaPagamentosCaixa(rows)
}

function listarPagamentosCaixaPorPeriodo(dataInicio, dataFim) {
  const rows = db
    .prepare(
      `${SQL_PAGAMENTOS_CAIXA_BASE}
      AND date(v.data) >= date(?)
      AND date(v.data) <= date(?)
    ORDER BY v.data DESC, v.id DESC, vp.id ASC`,
    )
    .all(dataInicio, dataFim)
  return atribuirSequenciaPagamentosCaixa(rows)
}

function listarPagamentosCaixaPorPeriodoEProduto(dataInicio, dataFim, produtoId) {
  const pid = Number(produtoId)
  if (!Number.isFinite(pid) || pid <= 0) return []

  const rows = db.prepare(`
    SELECT
      v.id as venda_id,
      v.data,
      v.valor_total,
      vp.forma_pagamento,
      vp.valor,
      (SELECT GROUP_CONCAT(p.nome || ' x' || vi.quantidade)
       FROM vendas_itens vi
       JOIN produtos p ON p.id = vi.produto_id
       WHERE vi.venda_id = v.id AND vi.deleted_at IS NULL) as itens_resumo,
      (SELECT COALESCE(SUM(vi.quantidade), 0) FROM vendas_itens vi WHERE vi.venda_id = v.id AND vi.deleted_at IS NULL) as qtd_itens,
      (SELECT COALESCE(SUM(vi.quantidade), 0) FROM vendas_itens vi
       WHERE vi.venda_id = v.id AND vi.produto_id = ? AND vi.deleted_at IS NULL) as qtd_produto_filtrado
    FROM vendas_pagamentos vp
    JOIN vendas v ON v.id = vp.venda_id
    WHERE v.deleted_at IS NULL
      AND vp.deleted_at IS NULL
      AND date(v.data) >= date(?)
      AND date(v.data) <= date(?)
      AND EXISTS (
        SELECT 1 FROM vendas_itens vi2
        WHERE vi2.venda_id = v.id AND vi2.produto_id = ? AND vi2.deleted_at IS NULL
      )
    ORDER BY v.data DESC, v.id DESC, vp.id ASC
  `).all(pid, dataInicio, dataFim, pid)

  return atribuirSequenciaPagamentosCaixa(rows)
}

function listarVendasPorPeriodo(dataInicio, dataFim) {
  const vendas = db.prepare(`
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id AND deleted_at IS NULL) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id AND vi.deleted_at IS NULL
    LEFT JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE v.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    GROUP BY v.id
    ORDER BY v.data DESC
  `).all(dataInicio, dataFim)
  return vendas
}

/**
 * Vendas no período; opcionalmente só as que têm pelo menos um item de produto do artesão.
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @param {number|null} artesaoId
 */
function listarVendasPorPeriodoEArtesao(dataInicio, dataFim, artesaoId = null) {
  const base = `
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT COALESCE(SUM(quantidade), 0) FROM vendas_itens WHERE venda_id = v.id AND deleted_at IS NULL) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id AND vi.deleted_at IS NULL
    LEFT JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE v.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
  `
  if (artesaoId == null) {
    return db
      .prepare(base + ` GROUP BY v.id ORDER BY v.data DESC`)
      .all(dataInicio, dataFim)
  }
  return db
    .prepare(
      base +
        ` AND EXISTS (
      SELECT 1 FROM vendas_itens vi2
      JOIN produtos p2 ON p2.id = vi2.produto_id AND p2.deleted_at IS NULL
      WHERE vi2.venda_id = v.id AND vi2.deleted_at IS NULL AND p2.artesao_id = ?
    ) GROUP BY v.id ORDER BY v.data DESC`,
    )
    .all(dataInicio, dataFim, artesaoId)
}

function excluirVenda(id) {
  const updateEstoque = db.prepare(`
    UPDATE produtos SET estoque = estoque + ? WHERE id = ?
  `)
  const insertMovEstoque = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'entrada', ?, 'estorno', datetime('now', 'localtime'))
  `)
  const softDeletePagamentos = db.prepare(
    "UPDATE vendas_pagamentos SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE venda_id = ?",
  )
  const softDeleteItens = db.prepare(
    "UPDATE vendas_itens SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE venda_id = ?",
  )
  const softDeleteVenda = db.prepare(
    "UPDATE vendas SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE id = ?",
  )
  const getItens = db.prepare(
    'SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ? AND deleted_at IS NULL',
  )

  db.transaction(() => {
    const itens = getItens.all(id)
    for (const item of itens) {
      updateEstoque.run(item.quantidade, item.produto_id)
      insertMovEstoque.run(item.produto_id, item.quantidade)
    }
    softDeletePagamentos.run(id)
    softDeleteItens.run(id)
    softDeleteVenda.run(id)
  })()
  return { id }
}

/** Carrega venda ativa com itens e pagamentos para reabrir no PDV. */
function obterVendaParaEdicao(vendaId) {
  const v = db
    .prepare(
      `SELECT id, data, valor_total, forma_pagamento FROM vendas WHERE id = ? AND deleted_at IS NULL`,
    )
    .get(vendaId)
  if (!v) return null
  const itens = db
    .prepare(
      `
    SELECT vi.produto_id, vi.quantidade, vi.preco_unitario,
           p.nome, p.codigo_barras, p.estoque
    FROM vendas_itens vi
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE vi.venda_id = ? AND vi.deleted_at IS NULL
    ORDER BY vi.id ASC
  `,
    )
    .all(vendaId)
  const pagamentos = db
    .prepare(
      `
    SELECT forma_pagamento, valor FROM vendas_pagamentos
    WHERE venda_id = ? AND deleted_at IS NULL
    ORDER BY id ASC
  `,
    )
    .all(vendaId)
  return { ...v, itens, pagamentos }
}

/**
 * Atualiza itens e pagamentos da venda, mantendo `data` e o id originais.
 * Ajusta estoque: devolve quantidades antigas e baixa as novas.
 */
function atualizarVenda(vendaId, { itens, forma_pagamento, valor_total: valorTotalInformado, pagamentos }) {
  const vendaRow = db.prepare('SELECT id, data FROM vendas WHERE id = ? AND deleted_at IS NULL').get(vendaId)
  if (!vendaRow) throw new Error('Venda não encontrada.')

  const subtotalItens = itens.reduce((acc, item) => acc + item.quantidade * item.preco_unitario, 0)
  const valor_total = valorTotalInformado != null ? valorTotalInformado : subtotalItens

  const updateEstoqueMais = db.prepare(`UPDATE produtos SET estoque = estoque + ? WHERE id = ?`)
  const updateEstoqueMenos = db.prepare(`UPDATE produtos SET estoque = estoque - ? WHERE id = ?`)
  const insertMovEntrada = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'entrada', ?, 'estorno', datetime('now', 'localtime'))
  `)
  const insertMovSaida = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'saida', ?, 'pdv', datetime('now', 'localtime'))
  `)
  const softDeletePagamentos = db.prepare(
    "UPDATE vendas_pagamentos SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE venda_id = ? AND deleted_at IS NULL",
  )
  const softDeleteItens = db.prepare(
    "UPDATE vendas_itens SET deleted_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE venda_id = ? AND deleted_at IS NULL",
  )
  const insertItem = db.prepare(`
    INSERT INTO vendas_itens (venda_id, produto_id, quantidade, preco_unitario)
    VALUES (?, ?, ?, ?)
  `)
  const insertPagamento = db.prepare(`
    INSERT INTO vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (?, ?, ?)
  `)
  const updateVenda = db.prepare(`
    UPDATE vendas SET valor_total = ?, forma_pagamento = ?, sync_status = 'pending' WHERE id = ?
  `)
  const getItensAtivos = db.prepare(
    'SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ? AND deleted_at IS NULL',
  )

  const tx = db.transaction(() => {
    const antigos = getItensAtivos.all(vendaId)
    for (const item of antigos) {
      updateEstoqueMais.run(item.quantidade, item.produto_id)
      insertMovEntrada.run(item.produto_id, item.quantidade)
    }
    softDeleteItens.run(vendaId)
    softDeletePagamentos.run(vendaId)

    for (const item of itens) {
      insertItem.run(vendaId, item.produto_id, item.quantidade, item.preco_unitario)
      updateEstoqueMenos.run(item.quantidade, item.produto_id)
      insertMovSaida.run(item.produto_id, item.quantidade)
    }

    const pagamentosEfetivos = Array.isArray(pagamentos) && pagamentos.length > 0
      ? pagamentos
      : [{ forma: forma_pagamento, valor: valor_total }]

    for (const pg of pagamentosEfetivos) {
      insertPagamento.run(vendaId, pg.forma, pg.valor != null ? pg.valor : 0)
    }

    updateVenda.run(valor_total, forma_pagamento, vendaId)
  })

  tx()
  return { id: vendaId, valor_total, forma_pagamento }
}

// --- Caixa ---

function criarMovimentacaoCaixa({ tipo, valor, forma_pagamento, descricao = null }) {
  const stmt = db.prepare(`
    INSERT INTO movimentacoes_caixa (tipo, valor, forma_pagamento, descricao, data)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
  `)
  const result = stmt.run(tipo, valor, forma_pagamento, descricao)
  return { id: result.lastInsertRowid, tipo, valor, forma_pagamento, descricao }
}

// --- Estoque ---

function adicionarEstoque(produto_id, quantidade, origem = 'admin') {
  const insertMov = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'entrada', ?, ?, datetime('now', 'localtime'))
  `)
  const updateProd = db.prepare(`
    UPDATE produtos SET estoque = estoque + ? WHERE id = ?
  `)
  db.transaction(() => {
    insertMov.run(produto_id, quantidade, origem)
    updateProd.run(quantidade, produto_id)
  })()
  return { produto_id, quantidade, tipo: 'entrada' }
}

function listarMovimentacoesRecentes(limite = 20) {
  return db.prepare(`
    SELECT m.*, p.nome as produto_nome, p.codigo_barras
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id
    ORDER BY m.data DESC
    LIMIT ?
  `).all(limite)
}

function listarProdutosMaisVendidos() {
  return db.prepare(`
    SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, SUM(vi.quantidade) as total_vendido
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE vi.deleted_at IS NULL
    GROUP BY vi.produto_id
    ORDER BY total_vendido DESC
  `).all()
}

function listarMovimentacoesPorPeriodo(dataInicio, dataFim) {
  return db.prepare(`
    SELECT m.*, p.nome as produto_nome, p.codigo_barras
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id
    WHERE date(m.data) >= date(?) AND date(m.data) <= date(?)
    ORDER BY m.data DESC
  `).all(dataInicio, dataFim)
}

function listarProdutosMaisVendidosPorPeriodo(dataInicio, dataFim) {
  return db.prepare(`
    SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, p.artesao_id, a.nome as artesao_nome, SUM(vi.quantidade) as total_vendido
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    GROUP BY vi.produto_id
    ORDER BY total_vendido DESC
  `).all(dataInicio, dataFim)
}

// --- Relatórios ---

/**
 * Retorna resumo de vendas para um período, opcionalmente filtrado por artesão.
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @param {number|null} artesaoId - ID do artesão ou null para todos
 * @returns {{ totalVendas: number, qtdVendas: number, qtdItens: number, ticketMedio: number }}
 */
function obterResumoVendasPeriodo(dataInicio, dataFim, artesaoId = null) {
  if (artesaoId == null) {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(v.valor_total), 0) as total_vendas,
        COUNT(DISTINCT v.id) as qtd_vendas,
        COALESCE((SELECT SUM(vi.quantidade) FROM vendas_itens vi
          JOIN vendas v2 ON v2.id = vi.venda_id AND v2.deleted_at IS NULL
          JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
          WHERE vi.deleted_at IS NULL
            AND date(v2.data) >= date(?) AND date(v2.data) <= date(?)), 0) as qtd_itens
      FROM vendas v
      WHERE v.deleted_at IS NULL
        AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    `).get(dataInicio, dataFim, dataInicio, dataFim)
    const totalVendas = row.total_vendas ?? 0
    const qtdVendas = row.qtd_vendas ?? 0
    const qtdItens = row.qtd_itens ?? 0
    const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0
    return { totalVendas, qtdVendas, qtdItens, ticketMedio }
  }

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(vi.preco_unitario * vi.quantidade), 0) as total_vendas,
      COUNT(DISTINCT v.id) as qtd_vendas,
      COALESCE(SUM(vi.quantidade), 0) as qtd_itens
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      AND p.artesao_id = ?
  `).get(dataInicio, dataFim, artesaoId)
  const totalVendas = row.total_vendas ?? 0
  const qtdVendas = row.qtd_vendas ?? 0
  const qtdItens = row.qtd_itens ?? 0
  const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0
  return { totalVendas, qtdVendas, qtdItens, ticketMedio }
}

/**
 * Retorna vendas agregadas por dia no período, para gráfico.
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @param {number|null} artesaoId - ID do artesão ou null para todos
 * @returns {Array<{ data: string, valorTotal: number, qtdItens: number }>}
 */
function obterVendasPorDia(dataInicio, dataFim, artesaoId = null) {
  if (artesaoId == null) {
    return db.prepare(`
      SELECT
        date(v.data) as data,
        COALESCE(SUM(v.valor_total), 0) as valor_total,
        COALESCE(SUM(
          (SELECT COALESCE(SUM(vi.quantidade), 0) FROM vendas_itens vi WHERE vi.venda_id = v.id AND vi.deleted_at IS NULL)
        ), 0) as qtd_itens
      FROM vendas v
      WHERE v.deleted_at IS NULL
        AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      GROUP BY date(v.data)
      ORDER BY date(v.data) ASC
    `).all(dataInicio, dataFim)
  }

  return db.prepare(`
    SELECT
      date(v.data) as data,
      COALESCE(SUM(vi.preco_unitario * vi.quantidade), 0) as valor_total,
      COALESCE(SUM(vi.quantidade), 0) as qtd_itens
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      AND p.artesao_id = ?
    GROUP BY date(v.data)
    ORDER BY date(v.data) ASC
  `).all(dataInicio, dataFim, artesaoId)
}

/**
 * Retorna total de vendas do dia atual (hoje).
 * @returns {{ totalVendas: number, qtdVendas: number, qtdItens: number }}
 */
function obterTotalVendasHoje() {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(v.valor_total), 0) as total_vendas,
      COUNT(v.id) as qtd_vendas,
      COALESCE((SELECT SUM(vi.quantidade) FROM vendas_itens vi
        JOIN vendas v2 ON v2.id = vi.venda_id AND v2.deleted_at IS NULL
        JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
        WHERE vi.deleted_at IS NULL
          AND date(v2.data) = date('now', 'localtime')), 0) as qtd_itens
    FROM vendas v
    WHERE v.deleted_at IS NULL
      AND date(v.data) = date('now', 'localtime')
  `).get()
  return {
    totalVendas: row.total_vendas ?? 0,
    qtdVendas: row.qtd_vendas ?? 0,
    qtdItens: row.qtd_itens ?? 0,
  }
}

/**
 * Calcula lucro no período: (preço venda - preço custo) × quantidade.
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @returns {{ lucro: number, totalVendas: number, totalCusto: number, qtdItens: number }}
 */
function obterLucroPeriodo(dataInicio, dataFim) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM((COALESCE(vi.preco_unitario, p.preco_venda) - p.preco_custo) * vi.quantidade), 0) as lucro,
      COALESCE(SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade), 0) as total_vendas,
      COALESCE(SUM(p.preco_custo * vi.quantidade), 0) as total_custo,
      COALESCE(SUM(vi.quantidade), 0) as qtd_itens
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
  `).get(dataInicio, dataFim)
  return {
    lucro: row.lucro ?? 0,
    totalVendas: row.total_vendas ?? 0,
    totalCusto: row.total_custo ?? 0,
    qtdItens: row.qtd_itens ?? 0,
  }
}

/** Ranking no período; com `artesaoId` filtra itens daquele artesão. */
function listarProdutosMaisVendidosPorPeriodoEArtesao(dataInicio, dataFim, artesaoId = null) {
  if (artesaoId == null) {
    return listarProdutosMaisVendidosPorPeriodo(dataInicio, dataFim)
  }

  return db.prepare(`
    SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, p.artesao_id, a.nome as artesao_nome, SUM(vi.quantidade) as total_vendido
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      AND p.artesao_id = ?
    GROUP BY vi.produto_id
    ORDER BY total_vendido DESC
  `).all(dataInicio, dataFim, artesaoId)
}

/**
 * Conta quantos produtos estão cadastrados para um artesão.
 * @param {number} artesaoId
 * @returns {number}
 */
function contarProdutosPorArtesao(artesaoId) {
  const row = db.prepare(`
    SELECT COUNT(*) as total FROM produtos WHERE artesao_id = ?
  `).get(artesaoId)
  return row?.total ?? 0
}

/**
 * Relatório de custo e vendas por período: total de vendas, total de custo e tabela de produtos vendidos.
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @param {number|null} artesaoId - ID do artesão ou null para todos
 * @returns {{ totalVendas: number, totalCusto: number, produtos: Array }}
 */
function obterRelatorioCustoVendasPeriodo(dataInicio, dataFim, artesaoId = null) {
  if (artesaoId == null) {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade), 0) as total_vendas,
        COALESCE(SUM(p.preco_custo * vi.quantidade), 0) as total_custo
      FROM vendas_itens vi
      JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
      JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
      WHERE vi.deleted_at IS NULL
        AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    `).get(dataInicio, dataFim)
    const produtos = db.prepare(`
      SELECT
        p.id,
        p.nome,
        p.variacao,
        a.nome as artesao_nome,
        p.preco_custo,
        SUM(vi.quantidade) as total_vendido,
        SUM(p.preco_custo * vi.quantidade) as total_custo_produto,
        SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade) as total_venda_produto
      FROM vendas_itens vi
      JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
      JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
      LEFT JOIN artesoes a ON a.id = p.artesao_id
      WHERE vi.deleted_at IS NULL
        AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      GROUP BY vi.produto_id
      ORDER BY p.nome
    `).all(dataInicio, dataFim)
    return {
      totalVendas: row.total_vendas ?? 0,
      totalCusto: row.total_custo ?? 0,
      produtos,
    }
  }

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade), 0) as total_vendas,
      COALESCE(SUM(p.preco_custo * vi.quantidade), 0) as total_custo
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      AND p.artesao_id = ?
  `).get(dataInicio, dataFim, artesaoId)
  const produtos = db.prepare(`
    SELECT
      p.id,
      p.nome,
      p.variacao,
      a.nome as artesao_nome,
      p.preco_custo,
      SUM(vi.quantidade) as total_vendido,
      SUM(p.preco_custo * vi.quantidade) as total_custo_produto,
      SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade) as total_venda_produto
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id AND p.deleted_at IS NULL
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      AND p.artesao_id = ?
    GROUP BY vi.produto_id
    ORDER BY p.nome
  `).all(dataInicio, dataFim, artesaoId)
  return {
    totalVendas: row.total_vendas ?? 0,
    totalCusto: row.total_custo ?? 0,
    produtos,
  }
}

/**
 * Totais por forma de pagamento no período, considerando vendas_pagamentos.
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @returns {Array<{ forma_pagamento: string, total: number, qtd_transacoes: number }>}
 */
function obterTotaisPagamentosPorPeriodo(dataInicio, dataFim) {
  return db.prepare(`
    SELECT
      vp.forma_pagamento as forma_pagamento,
      COALESCE(SUM(vp.valor), 0) as total,
      COUNT(DISTINCT vp.venda_id) as qtd_transacoes
    FROM vendas_pagamentos vp
    JOIN vendas v ON v.id = vp.venda_id
    WHERE v.deleted_at IS NULL
      AND vp.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    GROUP BY vp.forma_pagamento
  `).all(dataInicio, dataFim)
}

function validarLogin(login, senha) {
  const row = db.prepare('SELECT id, login FROM usuarios WHERE login = ? AND senha = ?').get(String(login).trim(), senha)
  return row || null
}

function criarUsuario(login, senha) {
  const loginTrim = String(login).trim()
  if (!loginTrim || !senha) throw new Error('Login e senha são obrigatórios.')
  const existente = db.prepare('SELECT id FROM usuarios WHERE login = ?').get(loginTrim)
  if (existente) throw new Error('Usuário já cadastrado.')
  const result = db.prepare('INSERT INTO usuarios (login, senha) VALUES (?, ?)').run(loginTrim, senha)
  return { id: result.lastInsertRowid, login: loginTrim }
}

// --- Exportações ---

module.exports = {
  db,
  getPendingRecordsForSync,
  markAsSynced,
  ORDEM_SYNC,
  criarArtesao,
  listarArtesoes,
  atualizarArtesao,
  excluirArtesao,
  criarProduto,
  listarProdutos,
  atualizarProduto,
  excluirProduto,
  buscarProdutoPorCodigo,
  criarVenda,
  listarVendas,
  listarVendasDoDia,
  listarVendasPorData,
  listarPagamentosCaixaPorData,
  listarPagamentosCaixaPorPeriodo,
  listarPagamentosCaixaPorPeriodoEProduto,
  listarVendasPorPeriodo,
  listarVendasPorPeriodoEArtesao,
  excluirVenda,
  obterVendaParaEdicao,
  atualizarVenda,
  criarMovimentacaoCaixa,
  adicionarEstoque,
  listarMovimentacoesRecentes,
  listarProdutosMaisVendidos,
  listarMovimentacoesPorPeriodo,
  listarProdutosMaisVendidosPorPeriodo,
  obterResumoVendasPeriodo,
  obterVendasPorDia,
  obterTotalVendasHoje,
  obterLucroPeriodo,
  listarProdutosMaisVendidosPorPeriodoEArtesao,
  contarProdutosPorArtesao,
  obterRelatorioCustoVendasPeriodo,
  obterTotaisPagamentosPorPeriodo,
  validarLogin,
  criarUsuario,
  listarTiposVariacao,
  criarTipoVariacao,
  atualizarTipoVariacao,
  excluirTipoVariacao,
  listarValoresVariacao,
  criarValorVariacao,
  atualizarValorVariacao,
  excluirValorVariacao,
  listarTodosValoresVariacao,
}