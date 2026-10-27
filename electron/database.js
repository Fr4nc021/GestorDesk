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
      razao_social TEXT,
      nome_fantasia TEXT,
      tipo_pessoa TEXT,
      cpf_cnpj TEXT,
      inscricao_estadual TEXT,
      email TEXT,
      cep TEXT,
      logradouro TEXT,
      numero TEXT,
      complemento TEXT,
      bairro TEXT,
      cidade TEXT,
      uf TEXT,
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

/** Preenche snapshot de custo a partir do cadastro só onde ainda está NULL (idempotente). */
function backfillPrecoCustoUnitarioVendasItens() {
  if (!tabelaTemColuna(db, 'vendas_itens', 'preco_custo_unitario')) return
  db.exec(`
    UPDATE vendas_itens
    SET preco_custo_unitario = (
      SELECT preco_custo FROM produtos WHERE produtos.id = vendas_itens.produto_id
    )
    WHERE preco_custo_unitario IS NULL
  `)
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

try {
  arredondarPrecosVendaExistentes()
} catch (err) {
  console.error('[DB] Falha ao arredondar preços de venda:', err?.message || err)
}

// Razão social e nome fantasia do fornecedor (idempotente).
// Nomes já preenchidos em `nome` viram razão social; a coluna `nome` permanece.
try {
  if (!tabelaTemColuna(db, 'artesoes', 'razao_social')) {
    db.exec(`ALTER TABLE artesoes ADD COLUMN razao_social TEXT`)
  }
  if (!tabelaTemColuna(db, 'artesoes', 'nome_fantasia')) {
    db.exec(`ALTER TABLE artesoes ADD COLUMN nome_fantasia TEXT`)
  }
  const temSync = tabelaTemColuna(db, 'artesoes', 'sync_status')
  db.prepare(`
    UPDATE artesoes
    SET razao_social = nome${temSync ? ", sync_status = 'pending'" : ''}
    WHERE TRIM(COALESCE(nome, '')) != ''
      AND (razao_social IS NULL OR TRIM(razao_social) = '')
  `).run()
} catch (_) {}

// Dados cadastrais do fornecedor (idempotente).
try {
  const colunasFornecedor = [
    'tipo_pessoa',
    'cpf_cnpj',
    'inscricao_estadual',
    'email',
    'cep',
    'logradouro',
    'numero',
    'complemento',
    'bairro',
    'cidade',
    'uf',
  ]
  for (const coluna of colunasFornecedor) {
    if (!tabelaTemColuna(db, 'artesoes', coluna)) {
      db.exec(`ALTER TABLE artesoes ADD COLUMN ${coluna} TEXT`)
    }
  }
} catch (_) {}

// Snapshot de custo unitário no momento da venda (idempotente + backfill).
try {
  if (!tabelaTemColuna(db, 'vendas_itens', 'preco_custo_unitario')) {
    db.exec(`ALTER TABLE vendas_itens ADD COLUMN preco_custo_unitario REAL`)
  }
  backfillPrecoCustoUnitarioVendasItens()
} catch (_) {}

// --- Fiscal (NFC-e / NF-e) ---
// Regras do manual do contador: produto consignado vende com CFOP 5115, próprio com 5102.
// Peças cadastradas antes desta versão eram todas consignadas, por isso o padrão.

const TIPOS_POSSE = ['consignado', 'proprio']

// Dados fiscais do produto (idempotente).
try {
  const colunasFiscaisProduto = [
    ['tipo_posse', "TEXT DEFAULT 'consignado'"],
    ['ncm', 'TEXT'],
    ['cest', 'TEXT'],
    ['unidade', "TEXT DEFAULT 'UN'"],
    ['origem', "TEXT DEFAULT '0'"],
    ['icms_st', 'INTEGER DEFAULT 0'],
  ]
  for (const [coluna, tipo] of colunasFiscaisProduto) {
    if (!tabelaTemColuna(db, 'produtos', coluna)) {
      db.exec(`ALTER TABLE produtos ADD COLUMN ${coluna} ${tipo}`)
    }
  }
} catch (_) {}

// Código IBGE do município do fornecedor, exigido nas notas de devolução (idempotente).
try {
  if (!tabelaTemColuna(db, 'artesoes', 'codigo_municipio')) {
    db.exec(`ALTER TABLE artesoes ADD COLUMN codigo_municipio TEXT`)
  }
} catch (_) {}

// Desconto e troco gravados na venda; a NFC-e exige o desconto rateado por item (idempotente).
// Na primeira vez, o desconto das vendas antigas é deduzido de subtotal - valor_total.
try {
  if (!tabelaTemColuna(db, 'vendas', 'desconto')) {
    db.exec(`ALTER TABLE vendas ADD COLUMN desconto REAL DEFAULT 0`)
    db.exec(`
      UPDATE vendas
      SET desconto = ROUND((
        SELECT COALESCE(SUM(vi.preco_unitario * vi.quantidade), 0)
        FROM vendas_itens vi
        WHERE vi.venda_id = vendas.id AND vi.deleted_at IS NULL
      ) - valor_total, 2)
      WHERE ROUND((
        SELECT COALESCE(SUM(vi.preco_unitario * vi.quantidade), 0)
        FROM vendas_itens vi
        WHERE vi.venda_id = vendas.id AND vi.deleted_at IS NULL
      ) - valor_total, 2) > 0
    `)
  }
  if (!tabelaTemColuna(db, 'vendas', 'troco')) {
    db.exec(`ALTER TABLE vendas ADD COLUMN troco REAL DEFAULT 0`)
  }
} catch (_) {}

// Notas de entrada (XML de NF-e do fornecedor). Ficam só neste computador por enquanto.
db.exec(`
  CREATE TABLE IF NOT EXISTS notas_entrada (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT NOT NULL UNIQUE,
    modelo TEXT,
    serie TEXT,
    numero TEXT,
    data_emissao TEXT,
    natureza_operacao TEXT,
    cfop TEXT,
    tipo TEXT NOT NULL,
    emitente_cpf_cnpj TEXT,
    emitente_nome TEXT,
    artesao_id INTEGER,
    valor_total REAL NOT NULL DEFAULT 0,
    movimentou_estoque INTEGER NOT NULL DEFAULT 0,
    xml TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    deleted_at TEXT,
    FOREIGN KEY (artesao_id) REFERENCES artesoes(id)
  );

  CREATE TABLE IF NOT EXISTS notas_entrada_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nota_id INTEGER NOT NULL,
    numero_item INTEGER,
    codigo TEXT,
    descricao TEXT,
    ncm TEXT,
    cest TEXT,
    cfop TEXT,
    unidade TEXT,
    quantidade REAL NOT NULL DEFAULT 0,
    valor_unitario REAL NOT NULL DEFAULT 0,
    valor_total REAL NOT NULL DEFAULT 0,
    produto_id INTEGER,
    quantidade_estoque INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (nota_id) REFERENCES notas_entrada(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );

  CREATE TABLE IF NOT EXISTS devolucoes_artesao (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nota_entrada_id INTEGER NOT NULL,
    artesao_id INTEGER,
    data TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    valor_total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'aguardando_nf',
    observacao TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    deleted_at TEXT,
    FOREIGN KEY (nota_entrada_id) REFERENCES notas_entrada(id),
    FOREIGN KEY (artesao_id) REFERENCES artesoes(id)
  );

  CREATE TABLE IF NOT EXISTS devolucoes_artesao_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    devolucao_id INTEGER NOT NULL,
    nota_item_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    quantidade INTEGER NOT NULL,
    valor_unitario REAL NOT NULL DEFAULT 0,
    FOREIGN KEY (devolucao_id) REFERENCES devolucoes_artesao(id),
    FOREIGN KEY (nota_item_id) REFERENCES notas_entrada_itens(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );
`)
try {
  if (!tabelaTemColuna(db, 'notas_entrada', 'acerto_inicio')) {
    db.exec(`ALTER TABLE notas_entrada ADD COLUMN acerto_inicio TEXT`)
  }
  if (!tabelaTemColuna(db, 'notas_entrada', 'acerto_fim')) {
    db.exec(`ALTER TABLE notas_entrada ADD COLUMN acerto_fim TEXT`)
  }
} catch (_) {}

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

function criarArtesao({
  nome,
  telefone_whats = null,
  razao_social = null,
  nome_fantasia = null,
  tipo_pessoa = null,
  cpf_cnpj = null,
  inscricao_estadual = null,
  email = null,
  cep = null,
  logradouro = null,
  numero = null,
  complemento = null,
  bairro = null,
  cidade = null,
  uf = null,
  codigo_municipio = null,
}) {
  const stmt = db.prepare(`
    INSERT INTO artesoes (
      nome, telefone_whats, razao_social, nome_fantasia,
      tipo_pessoa, cpf_cnpj, inscricao_estadual, email,
      cep, logradouro, numero, complemento, bairro, cidade, uf, codigo_municipio
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    nome,
    telefone_whats,
    razao_social,
    nome_fantasia,
    tipo_pessoa,
    cpf_cnpj,
    inscricao_estadual,
    email,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    codigo_municipio,
  )
  return {
    id: result.lastInsertRowid,
    nome,
    telefone_whats,
    razao_social,
    nome_fantasia,
    tipo_pessoa,
    cpf_cnpj,
    inscricao_estadual,
    email,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    codigo_municipio,
  }
}

function listarArtesoes() {
  const stmt = db.prepare(`
    SELECT a.*, COUNT(p.id) as quantidade_produtos
    FROM artesoes a
    LEFT JOIN produtos p ON p.artesao_id = a.id AND p.deleted_at IS NULL
    WHERE a.deleted_at IS NULL
    GROUP BY a.id
    ORDER BY COALESCE(NULLIF(TRIM(a.razao_social), ''), a.nome)
  `)
  return stmt.all()
}

function atualizarArtesao(
  id,
  {
    nome,
    telefone_whats = null,
    razao_social = null,
    nome_fantasia = null,
    tipo_pessoa = null,
    cpf_cnpj = null,
    inscricao_estadual = null,
    email = null,
    cep = null,
    logradouro = null,
    numero = null,
    complemento = null,
    bairro = null,
    cidade = null,
    uf = null,
    codigo_municipio = null,
  },
) {
  const stmt = db.prepare(`
    UPDATE artesoes SET
      nome = ?,
      telefone_whats = ?,
      razao_social = ?,
      nome_fantasia = ?,
      tipo_pessoa = ?,
      cpf_cnpj = ?,
      inscricao_estadual = ?,
      email = ?,
      cep = ?,
      logradouro = ?,
      numero = ?,
      complemento = ?,
      bairro = ?,
      cidade = ?,
      uf = ?,
      codigo_municipio = ?,
      sync_status = 'pending'
    WHERE id = ?
  `)
  stmt.run(
    nome,
    telefone_whats,
    razao_social,
    nome_fantasia,
    tipo_pessoa,
    cpf_cnpj,
    inscricao_estadual,
    email,
    cep,
    logradouro,
    numero,
    complemento,
    bairro,
    cidade,
    uf,
    codigo_municipio,
    id,
  )
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

/** Preço de venda no valor mais próximo terminado em ,00 ou ,50. Empate sobe. */
function arredondarPrecoVenda(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return 0
  const centavos = Math.round(n * 100)
  return (Math.round(centavos / 50) * 50) / 100
}

function arredondarPrecosVendaExistentes() {
  const produtos = db.prepare(`
    SELECT id, preco_venda FROM produtos WHERE deleted_at IS NULL
  `).all()
  const update = db.prepare(`
    UPDATE produtos SET preco_venda = ?, sync_status = 'pending' WHERE id = ?
  `)
  const gravar = db.transaction(() => {
    for (const produto of produtos) {
      const atual = Number(produto.preco_venda) || 0
      const arredondado = arredondarPrecoVenda(atual)
      if (Math.abs(atual - arredondado) > 0.001) {
        update.run(arredondado, produto.id)
      }
    }
  })
  gravar()
}

/** Normaliza os campos fiscais do produto; campos ausentes ficam `undefined` (não alteram no update). */
function normalizarFiscalProduto(dados = {}) {
  const fiscal = {}
  if (dados.tipo_posse !== undefined) {
    if (!TIPOS_POSSE.includes(dados.tipo_posse)) throw new Error('Tipo de produto inválido.')
    fiscal.tipo_posse = dados.tipo_posse
  }
  if (dados.ncm !== undefined) {
    const ncm = String(dados.ncm ?? '').replace(/\D/g, '')
    if (ncm && ncm.length !== 8) throw new Error('O NCM deve ter 8 dígitos.')
    fiscal.ncm = ncm || null
  }
  if (dados.cest !== undefined) {
    const cest = String(dados.cest ?? '').replace(/\D/g, '')
    if (cest && cest.length !== 7) throw new Error('O CEST deve ter 7 dígitos.')
    fiscal.cest = cest || null
  }
  if (dados.unidade !== undefined) {
    fiscal.unidade = String(dados.unidade ?? '').trim().toUpperCase().slice(0, 6) || 'UN'
  }
  if (dados.origem !== undefined) {
    const origem = String(dados.origem ?? '0').trim()
    if (!/^[0-8]$/.test(origem)) throw new Error('Origem da mercadoria inválida.')
    fiscal.origem = origem
  }
  if (dados.icms_st !== undefined) {
    fiscal.icms_st = dados.icms_st ? 1 : 0
  }
  return fiscal
}

function criarProduto({ nome, variacao = null, preco_custo = 0, preco_venda = 0, estoque = 0, artesao_id, ...resto }) {
  let codigo_barras = gerarCodigoBarras()
  const checkStmt = db.prepare('SELECT id FROM produtos WHERE codigo_barras = ?')

  while (checkStmt.get(codigo_barras)) {
    codigo_barras = gerarCodigoBarras()
  }

  const fiscal = {
    tipo_posse: 'consignado',
    ncm: null,
    cest: null,
    unidade: 'UN',
    origem: '0',
    icms_st: 0,
    ...normalizarFiscalProduto(resto),
  }

  const stmt = db.prepare(`
    INSERT INTO produtos (
      nome, variacao, preco_custo, preco_venda, estoque, codigo_barras, artesao_id,
      tipo_posse, ncm, cest, unidade, origem, icms_st
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const venda = arredondarPrecoVenda(preco_venda)
  const result = stmt.run(
    nome,
    variacao,
    preco_custo,
    venda,
    estoque,
    codigo_barras,
    artesao_id,
    fiscal.tipo_posse,
    fiscal.ncm,
    fiscal.cest,
    fiscal.unidade,
    fiscal.origem,
    fiscal.icms_st,
  )
  return {
    id: result.lastInsertRowid,
    nome,
    variacao,
    preco_custo,
    preco_venda: venda,
    estoque,
    codigo_barras,
    artesao_id,
    ...fiscal,
  }
}

function listarProdutos() {
  const stmt = db.prepare(`
    SELECT p.*, a.nome as artesao_nome, a.razao_social as artesao_razao_social, a.nome_fantasia as artesao_nome_fantasia
    FROM produtos p
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE p.deleted_at IS NULL
      AND (a.deleted_at IS NULL OR a.id IS NULL)
    ORDER BY p.nome
  `)
  return stmt.all()
}

function atualizarProduto(id, { nome, variacao = null, preco_custo = 0, preco_venda = 0, estoque = 0, artesao_id, ...resto }) {
  const venda = arredondarPrecoVenda(preco_venda)
  const fiscal = normalizarFiscalProduto(resto)
  const colunasFiscais = Object.keys(fiscal)
  const setFiscal = colunasFiscais.map((c) => `, ${c} = ?`).join('')
  const stmt = db.prepare(`
    UPDATE produtos SET nome = ?, variacao = ?, preco_custo = ?, preco_venda = ?, estoque = ?, artesao_id = ?${setFiscal}, sync_status = 'pending'
    WHERE id = ?
  `)
  stmt.run(nome, variacao, preco_custo, venda, estoque, artesao_id, ...colunasFiscais.map((c) => fiscal[c]), id)
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
    SELECT p.*, a.nome as artesao_nome, a.razao_social as artesao_razao_social, a.nome_fantasia as artesao_nome_fantasia
    FROM produtos p
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE p.codigo_barras = ? AND p.deleted_at IS NULL
  `)
  return stmt.get(codigo_barras.trim()) || null
}

/**
 * Gera um novo código de barras EAN-13 único para um produto existente.
 * O código anterior deixa de funcionar (etiquetas antigas precisam ser refeitas).
 */
function refazerCodigoBarras(id) {
  const produto = db
    .prepare('SELECT id, codigo_barras FROM produtos WHERE id = ? AND deleted_at IS NULL')
    .get(id)

  if (!produto) {
    throw new Error('Produto não encontrado.')
  }

  let codigo_barras = gerarCodigoBarras()
  const checkStmt = db.prepare('SELECT id FROM produtos WHERE codigo_barras = ?')

  while (checkStmt.get(codigo_barras)) {
    codigo_barras = gerarCodigoBarras()
  }

  db.prepare(`
    UPDATE produtos SET codigo_barras = ?, sync_status = 'pending'
    WHERE id = ?
  `).run(codigo_barras, id)

  return { id, codigo_barras, codigo_anterior: produto.codigo_barras }
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

/** Garante que o UPDATE de estoque afetou exatamente um produto (evita venda gravada sem baixa). */
function assertUmaLinhaProdutoEstoque(result, produtoId, contexto) {
  if (result.changes !== 1) {
    throw new Error(
      `${contexto}: estoque do produto id=${produtoId} não foi atualizado (changes=${result.changes}).`,
    )
  }
}

/** Valor em R$ não negativo com 2 casas (desconto, troco). */
function valorMonetario(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.round(n * 100) / 100
}

function criarVenda({ itens, forma_pagamento, valor_total: valorTotalInformado, pagamentos, desconto = 0, troco = 0 }) {
  const subtotalItens = itens.reduce((acc, item) => acc + item.quantidade * item.preco_unitario, 0)
  const valor_total = valorTotalInformado != null ? valorTotalInformado : subtotalItens

  const insertVenda = db.prepare(`
    INSERT INTO vendas (data, valor_total, forma_pagamento, desconto, troco)
    VALUES (datetime('now', 'localtime'), ?, ?, ?, ?)
  `)
  const insertItem = db.prepare(`
    INSERT INTO vendas_itens (venda_id, produto_id, quantidade, preco_unitario, preco_custo_unitario)
    VALUES (?, ?, ?, ?, (SELECT preco_custo FROM produtos WHERE id = ?))
  `)
  const updateEstoque = db.prepare(`
    UPDATE produtos SET estoque = estoque - ?, sync_status = 'pending' WHERE id = ?
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
    const result = insertVenda.run(valor_total, forma_pagamento, valorMonetario(desconto), valorMonetario(troco))
    const vendaId = result.lastInsertRowid

    for (const item of itens) {
      insertItem.run(
        vendaId,
        item.produto_id,
        item.quantidade,
        item.preco_unitario,
        item.produto_id,
      )
      assertUmaLinhaProdutoEstoque(
        updateEstoque.run(item.quantidade, item.produto_id),
        item.produto_id,
        'Baixa de estoque (nova venda)',
      )
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
    LEFT JOIN produtos p ON p.id = vi.produto_id
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
    LEFT JOIN produtos p ON p.id = vi.produto_id
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
    LEFT JOIN produtos p ON p.id = vi.produto_id
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
    LEFT JOIN produtos p ON p.id = vi.produto_id
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
    LEFT JOIN produtos p ON p.id = vi.produto_id
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
      JOIN produtos p2 ON p2.id = vi2.produto_id
      WHERE vi2.venda_id = v.id AND vi2.deleted_at IS NULL AND p2.artesao_id = ?
    ) GROUP BY v.id ORDER BY v.data DESC`,
    )
    .all(dataInicio, dataFim, artesaoId)
}

function excluirVenda(id) {
  const updateEstoque = db.prepare(`
    UPDATE produtos SET estoque = estoque + ?, sync_status = 'pending' WHERE id = ?
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
      assertUmaLinhaProdutoEstoque(
        updateEstoque.run(item.quantidade, item.produto_id),
        item.produto_id,
        'Devolução de estoque (exclusão de venda)',
      )
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
      `SELECT id, data, valor_total, forma_pagamento, desconto, troco FROM vendas WHERE id = ? AND deleted_at IS NULL`,
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
function atualizarVenda(
  vendaId,
  { itens, forma_pagamento, valor_total: valorTotalInformado, pagamentos, desconto = 0, troco = 0 },
) {
  const vendaRow = db.prepare('SELECT id, data FROM vendas WHERE id = ? AND deleted_at IS NULL').get(vendaId)
  if (!vendaRow) throw new Error('Venda não encontrada.')

  const subtotalItens = itens.reduce((acc, item) => acc + item.quantidade * item.preco_unitario, 0)
  const valor_total = valorTotalInformado != null ? valorTotalInformado : subtotalItens

  const updateEstoqueMais = db.prepare(
    `UPDATE produtos SET estoque = estoque + ?, sync_status = 'pending' WHERE id = ?`,
  )
  const updateEstoqueMenos = db.prepare(
    `UPDATE produtos SET estoque = estoque - ?, sync_status = 'pending' WHERE id = ?`,
  )
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
    INSERT INTO vendas_itens (venda_id, produto_id, quantidade, preco_unitario, preco_custo_unitario)
    VALUES (?, ?, ?, ?, (SELECT preco_custo FROM produtos WHERE id = ?))
  `)
  const insertPagamento = db.prepare(`
    INSERT INTO vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (?, ?, ?)
  `)
  const updateVenda = db.prepare(`
    UPDATE vendas SET valor_total = ?, forma_pagamento = ?, desconto = ?, troco = ?, sync_status = 'pending' WHERE id = ?
  `)
  const getItensAtivos = db.prepare(
    'SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ? AND deleted_at IS NULL',
  )

  const tx = db.transaction(() => {
    const antigos = getItensAtivos.all(vendaId)
    for (const item of antigos) {
      assertUmaLinhaProdutoEstoque(
        updateEstoqueMais.run(item.quantidade, item.produto_id),
        item.produto_id,
        'Devolução de estoque (edição de venda)',
      )
      insertMovEntrada.run(item.produto_id, item.quantidade)
    }
    softDeleteItens.run(vendaId)
    softDeletePagamentos.run(vendaId)

    for (const item of itens) {
      insertItem.run(
        vendaId,
        item.produto_id,
        item.quantidade,
        item.preco_unitario,
        item.produto_id,
      )
      assertUmaLinhaProdutoEstoque(
        updateEstoqueMenos.run(item.quantidade, item.produto_id),
        item.produto_id,
        'Baixa de estoque (edição de venda)',
      )
      insertMovSaida.run(item.produto_id, item.quantidade)
    }

    const pagamentosEfetivos = Array.isArray(pagamentos) && pagamentos.length > 0
      ? pagamentos
      : [{ forma: forma_pagamento, valor: valor_total }]

    for (const pg of pagamentosEfetivos) {
      insertPagamento.run(vendaId, pg.forma, pg.valor != null ? pg.valor : 0)
    }

    updateVenda.run(valor_total, forma_pagamento, valorMonetario(desconto), valorMonetario(troco), vendaId)
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
    UPDATE produtos SET estoque = estoque + ?, sync_status = 'pending' WHERE id = ?
  `)
  db.transaction(() => {
    insertMov.run(produto_id, quantidade, origem)
    assertUmaLinhaProdutoEstoque(
      updateProd.run(quantidade, produto_id),
      produto_id,
      'Entrada de estoque',
    )
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
    JOIN produtos p ON p.id = vi.produto_id
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
    SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, p.artesao_id, a.nome as artesao_nome, a.nome_fantasia as artesao_nome_fantasia, SUM(vi.quantidade) as total_vendido
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    GROUP BY vi.produto_id
    ORDER BY total_vendido DESC
  `).all(dataInicio, dataFim)
}

// --- Relatórios ---
// Produto excluído (deleted_at) continua nestas consultas: a venda já aconteceu.
// Cadastro, PDV e estoque seguem ocultando esse produto.

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
          JOIN produtos p ON p.id = vi.produto_id
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
    JOIN produtos p ON p.id = vi.produto_id
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
    JOIN produtos p ON p.id = vi.produto_id
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
        JOIN produtos p ON p.id = vi.produto_id
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
      COALESCE(SUM((COALESCE(vi.preco_unitario, p.preco_venda) - COALESCE(vi.preco_custo_unitario, p.preco_custo)) * vi.quantidade), 0) as lucro,
      COALESCE(SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade), 0) as total_vendas,
      COALESCE(SUM(COALESCE(vi.preco_custo_unitario, p.preco_custo) * vi.quantidade), 0) as total_custo,
      COALESCE(SUM(vi.quantidade), 0) as qtd_itens
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id
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
    SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, p.artesao_id, a.nome as artesao_nome, a.nome_fantasia as artesao_nome_fantasia, SUM(vi.quantidade) as total_vendido
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id
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
 * A tabela pode ter mais de uma linha por produto quando o custo congelado na venda mudou no período.
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @param {number|null} artesaoId - ID do artesão ou null para todos
 * @returns {{ totalVendas: number, totalCusto: number, produtos: Array }}
 */
function obterRelatorioCustoVendasPeriodo(dataInicio, dataFim, artesaoId = null) {
  const custoSnapshotExpr = 'ROUND(COALESCE(vi.preco_custo_unitario, p.preco_custo), 2)'

  if (artesaoId == null) {
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade), 0) as total_vendas,
        COALESCE(SUM(COALESCE(vi.preco_custo_unitario, p.preco_custo) * vi.quantidade), 0) as total_custo
      FROM vendas_itens vi
      JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
      JOIN produtos p ON p.id = vi.produto_id
      WHERE vi.deleted_at IS NULL
        AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    `).get(dataInicio, dataFim)
    const produtos = db.prepare(`
      SELECT
        p.id,
        p.nome,
        p.variacao,
        a.nome as artesao_nome, a.nome_fantasia as artesao_nome_fantasia,
        ${custoSnapshotExpr} as preco_custo,
        SUM(vi.quantidade) as total_vendido,
        SUM(COALESCE(vi.preco_custo_unitario, p.preco_custo) * vi.quantidade) as total_custo_produto,
        SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade) as total_venda_produto
      FROM vendas_itens vi
      JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
      JOIN produtos p ON p.id = vi.produto_id
      LEFT JOIN artesoes a ON a.id = p.artesao_id
      WHERE vi.deleted_at IS NULL
        AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      GROUP BY vi.produto_id, ${custoSnapshotExpr}
      ORDER BY p.nome, preco_custo
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
      COALESCE(SUM(COALESCE(vi.preco_custo_unitario, p.preco_custo) * vi.quantidade), 0) as total_custo
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      AND p.artesao_id = ?
  `).get(dataInicio, dataFim, artesaoId)
  const produtos = db.prepare(`
    SELECT
      p.id,
      p.nome,
      p.variacao,
      a.nome as artesao_nome, a.nome_fantasia as artesao_nome_fantasia,
      ${custoSnapshotExpr} as preco_custo,
      SUM(vi.quantidade) as total_vendido,
      SUM(COALESCE(vi.preco_custo_unitario, p.preco_custo) * vi.quantidade) as total_custo_produto,
      SUM(COALESCE(vi.preco_unitario, p.preco_venda) * vi.quantidade) as total_venda_produto
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE vi.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
      AND p.artesao_id = ?
    GROUP BY vi.produto_id, ${custoSnapshotExpr}
    ORDER BY p.nome, preco_custo
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

const FORMACAO_PRECO_PADRAO = {
  faturamento_medio: '14064.90',
  despesas_fixas_mensais: '3572.43',
  imposto: '4',
  investimento: '10',
  lucro: '10',
  usar_folga: '0',
}

function garantirFormacaoPrecoPadrao() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS configuracoes (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    )
  `)
  const insert = db.prepare('INSERT OR IGNORE INTO configuracoes (chave, valor) VALUES (?, ?)')
  const gravar = db.transaction(() => {
    for (const [chave, valor] of Object.entries(FORMACAO_PRECO_PADRAO)) {
      insert.run(chave, valor)
    }
  })
  gravar()
}

garantirFormacaoPrecoPadrao()

function lerNumeroConfig(map, chave, fallback) {
  const n = parseFloat(map[chave])
  return Number.isFinite(n) ? n : fallback
}

function obterFormacaoPreco() {
  garantirFormacaoPrecoPadrao()
  const rows = db.prepare('SELECT chave, valor FROM configuracoes').all()
  const map = Object.fromEntries(rows.map((row) => [row.chave, row.valor]))
  return {
    faturamento_medio: lerNumeroConfig(map, 'faturamento_medio', 14064.9),
    despesas_fixas_mensais: lerNumeroConfig(map, 'despesas_fixas_mensais', 3572.43),
    imposto: lerNumeroConfig(map, 'imposto', 4),
    investimento: lerNumeroConfig(map, 'investimento', 10),
    lucro: lerNumeroConfig(map, 'lucro', 10),
    usar_folga: map.usar_folga === '1',
  }
}

function numeroFormacao(valor, nome) {
  const n = typeof valor === 'number'
    ? valor
    : parseFloat(String(valor ?? '').trim().replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) throw new Error(`Valor inválido para ${nome}.`)
  return n
}

function salvarFormacaoPreco(data) {
  garantirFormacaoPrecoPadrao()
  const faturamento = numeroFormacao(data?.faturamento_medio, 'faturamento médio')
  if (faturamento <= 0) throw new Error('Informe o faturamento médio.')
  const registro = {
    faturamento_medio: String(faturamento),
    despesas_fixas_mensais: String(numeroFormacao(data?.despesas_fixas_mensais, 'despesas fixas')),
    imposto: String(numeroFormacao(data?.imposto, 'imposto')),
    investimento: String(numeroFormacao(data?.investimento, 'investimento')),
    lucro: String(numeroFormacao(data?.lucro, 'lucro')),
    usar_folga: data?.usar_folga ? '1' : '0',
  }
  const upsert = db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `)
  const gravar = db.transaction(() => {
    for (const [chave, valor] of Object.entries(registro)) {
      upsert.run(chave, valor)
    }
  })
  gravar()
  return obterFormacaoPreco()
}

const RELATORIOS_PERIODO_CHAVE = 'relatorios_periodo_padrao'

const RELATORIOS_ABAS_PERIODO_IDS = ['geral', 'artesao', 'lucro', 'mais_vendidos', 'produtos', 'valor']

function itemRelatorioPeriodoPadraoDb() {
  return { modo: 'mes_anterior', dias: 30 }
}

function relatoriosPeriodoPadraoInicialDb() {
  return Object.fromEntries(RELATORIOS_ABAS_PERIODO_IDS.map((id) => [id, itemRelatorioPeriodoPadraoDb()]))
}

function normalizarModoRelatorioDb(modo) {
  if (modo === 'inicio_mes' || modo === 'dias_atras' || modo === 'mes_anterior') return modo
  return 'mes_anterior'
}

function normalizarDiasRelatorioDb(dias) {
  const n = parseInt(String(dias ?? ''), 10)
  if (!Number.isFinite(n) || n < 0) return 30
  return Math.min(n, 3660)
}

function normalizarRelatoriosPeriodoPadraoDb(raw) {
  const base = relatoriosPeriodoPadraoInicialDb()
  if (!raw || typeof raw !== 'object') return base
  for (const id of RELATORIOS_ABAS_PERIODO_IDS) {
    const item = raw[id]
    if (!item || typeof item !== 'object') continue
    base[id] = {
      modo: normalizarModoRelatorioDb(item.modo),
      dias: normalizarDiasRelatorioDb(item.dias),
    }
  }
  return base
}

function obterRelatoriosPeriodoPadrao() {
  garantirFormacaoPrecoPadrao()
  const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(RELATORIOS_PERIODO_CHAVE)
  if (!row?.valor) return relatoriosPeriodoPadraoInicialDb()
  try {
    return normalizarRelatoriosPeriodoPadraoDb(JSON.parse(row.valor))
  } catch {
    return relatoriosPeriodoPadraoInicialDb()
  }
}

function salvarRelatoriosPeriodoPadrao(data) {
  garantirFormacaoPrecoPadrao()
  const normalizado = normalizarRelatoriosPeriodoPadraoDb(data)
  db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `).run(RELATORIOS_PERIODO_CHAVE, JSON.stringify(normalizado))
  return normalizado
}

function aplicarPrecoFormacaoEmTodos(multiplicador) {
  const mult = Number(multiplicador)
  if (!Number.isFinite(mult) || mult <= 0) throw new Error('Multiplicador inválido.')
  const produtos = db.prepare(`
    SELECT id, preco_custo
    FROM produtos
    WHERE deleted_at IS NULL AND preco_custo > 0
  `).all()
  const update = db.prepare(`
    UPDATE produtos
    SET preco_venda = ?, sync_status = 'pending'
    WHERE id = ?
  `)
  const gravar = db.transaction(() => {
    for (const produto of produtos) {
      const venda = arredondarPrecoVenda(Number(produto.preco_custo) * mult)
      update.run(venda, produto.id)
    }
  })
  gravar()
  return { atualizados: produtos.length }
}

// --- Notas de entrada (XML de NF-e do fornecedor) ---

const TIPOS_NOTA_ENTRADA = {
  remessa_consignacao: { movimentaEstoque: true, tipoPosse: 'consignado' },
  faturamento_consignacao: { movimentaEstoque: false, tipoPosse: 'consignado' },
  compra: { movimentaEstoque: true, tipoPosse: 'proprio' },
  compra_st: { movimentaEstoque: true, tipoPosse: 'proprio' },
  outra: { movimentaEstoque: false, tipoPosse: 'consignado' },
}

function buscarArtesaoPorDocumento(documento) {
  const digitos = String(documento ?? '').replace(/\D/g, '')
  if (!digitos) return null
  return (
    db
      .prepare(`
        SELECT * FROM artesoes
        WHERE deleted_at IS NULL
          AND REPLACE(REPLACE(REPLACE(COALESCE(cpf_cnpj, ''), '.', ''), '/', ''), '-', '') = ?
        ORDER BY id
        LIMIT 1
      `)
      .get(digitos) || null
  )
}

function buscarNotaEntradaPorChave(chave) {
  return (
    db
      .prepare('SELECT id, numero, data_emissao, created_at FROM notas_entrada WHERE chave = ? AND deleted_at IS NULL')
      .get(String(chave ?? '').replace(/\D/g, '')) || null
  )
}

/**
 * Grava a nota e, se for remessa ou compra, cadastra/vincula os produtos e dá entrada no estoque.
 * @param {object} dados - { nota, itens, artesao_id, novo_artesao, xml }
 *   itens[i].acao: 'criar' | 'vincular' | 'ignorar'; 'criar' usa nome e preco_venda; 'vincular' usa produto_id.
 */
function importarNotaEntrada({ nota, itens, artesao_id = null, novo_artesao = null, xml }) {
  const chave = String(nota?.chave ?? '').replace(/\D/g, '')
  if (chave.length !== 44) throw new Error('Chave de acesso inválida.')
  if (!xml) throw new Error('XML da nota não informado.')
  const regra = TIPOS_NOTA_ENTRADA[nota.tipo]
  if (!regra) throw new Error('Tipo de nota inválido.')
  if (!Array.isArray(itens) || itens.length === 0) throw new Error('A nota não tem itens.')

  const insertNota = db.prepare(`
    INSERT INTO notas_entrada (
      chave, modelo, serie, numero, data_emissao, natureza_operacao, cfop, tipo,
      emitente_cpf_cnpj, emitente_nome, artesao_id, valor_total, movimentou_estoque, xml,
      acerto_inicio, acerto_fim
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertItem = db.prepare(`
    INSERT INTO notas_entrada_itens (
      nota_id, numero_item, codigo, descricao, ncm, cest, cfop, unidade,
      quantidade, valor_unitario, valor_total, produto_id, quantidade_estoque
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const getProduto = db.prepare('SELECT * FROM produtos WHERE id = ? AND deleted_at IS NULL')
  const updateFiscalProduto = db.prepare(`
    UPDATE produtos SET ncm = COALESCE(?, ncm), cest = COALESCE(?, cest), tipo_posse = ?, sync_status = 'pending'
    WHERE id = ?
  `)

  return db.transaction(() => {
    if (buscarNotaEntradaPorChave(chave)) throw new Error('Esta nota já foi importada.')

    let artesaoId = artesao_id ? Number(artesao_id) : null
    if (!artesaoId && novo_artesao) {
      artesaoId = Number(criarArtesao(novo_artesao).id)
    }
    if (!artesaoId && itens.some((i) => i.acao === 'criar')) {
      throw new Error('Selecione o fornecedor para cadastrar as peças.')
    }

    const notaId = insertNota.run(
      chave,
      nota.modelo || '55',
      nota.serie || null,
      nota.numero || null,
      nota.data_emissao || null,
      nota.natureza_operacao || null,
      nota.cfop || null,
      nota.tipo,
      String(nota.emitente_cpf_cnpj ?? '').replace(/\D/g, '') || null,
      nota.emitente_nome || null,
      artesaoId,
      Number(nota.valor_total) || 0,
      regra.movimentaEstoque ? 1 : 0,
      xml,
      nota.tipo === 'faturamento_consignacao' ? nota.acerto_inicio || null : null,
      nota.tipo === 'faturamento_consignacao' ? nota.acerto_fim || null : null,
    ).lastInsertRowid

    let produtosCriados = 0
    let unidadesEntrada = 0
    for (const item of itens) {
      const quantidadeEstoque = Math.round(Number(item.quantidade) || 0)
      const ncm = String(item.ncm ?? '').replace(/\D/g, '')
      const cest = String(item.cest ?? '').replace(/\D/g, '')
      let produtoId = null

      if (item.acao === 'criar') {
        const nome = String(item.nome || item.descricao || '').trim()
        if (!nome) throw new Error(`Item ${item.numero_item}: informe o nome do produto.`)
        produtoId = Number(
          criarProduto({
            nome,
            preco_custo: Number(item.valor_unitario) || 0,
            preco_venda: Number(item.preco_venda) || 0,
            estoque: 0,
            artesao_id: artesaoId,
            tipo_posse: regra.tipoPosse,
            ncm: ncm.length === 8 ? ncm : '',
            cest: cest.length === 7 ? cest : '',
            unidade: item.unidade || 'UN',
          }).id,
        )
        produtosCriados += 1
      } else if (item.acao === 'vincular') {
        produtoId = Number(item.produto_id)
        if (!getProduto.get(produtoId)) throw new Error(`Item ${item.numero_item}: produto não encontrado.`)
        if (regra.movimentaEstoque) {
          updateFiscalProduto.run(
            ncm.length === 8 ? ncm : null,
            cest.length === 7 ? cest : null,
            regra.tipoPosse,
            produtoId,
          )
        }
      }

      const entraNoEstoque = regra.movimentaEstoque && produtoId && quantidadeEstoque > 0
      if (entraNoEstoque) {
        adicionarEstoque(produtoId, quantidadeEstoque, 'nfe_entrada')
        unidadesEntrada += quantidadeEstoque
      }

      insertItem.run(
        notaId,
        item.numero_item || null,
        item.codigo || null,
        item.descricao || null,
        ncm || null,
        cest || null,
        item.cfop || null,
        item.unidade || null,
        Number(item.quantidade) || 0,
        Number(item.valor_unitario) || 0,
        Number(item.valor_total) || 0,
        produtoId,
        entraNoEstoque ? quantidadeEstoque : 0,
      )
    }

    return { id: notaId, artesao_id: artesaoId, produtosCriados, unidadesEntrada }
  })()
}

function listarNotasEntrada() {
  return db.prepare(`
    SELECT n.id, n.chave, n.serie, n.numero, n.data_emissao, n.cfop, n.tipo, n.valor_total,
           n.movimentou_estoque, n.emitente_nome, n.emitente_cpf_cnpj, n.artesao_id, n.created_at,
           n.acerto_inicio, n.acerto_fim,
           (SELECT COALESCE(SUM(di.quantidade), 0) FROM devolucoes_artesao_itens di
              JOIN devolucoes_artesao d ON d.id = di.devolucao_id AND d.deleted_at IS NULL
              WHERE d.nota_entrada_id = n.id) as unidades_devolvidas,
           a.razao_social as artesao_razao_social, a.nome_fantasia as artesao_nome_fantasia, a.nome as artesao_nome,
           (SELECT COUNT(*) FROM notas_entrada_itens i WHERE i.nota_id = n.id) as qtd_itens,
           (SELECT COALESCE(SUM(i.quantidade_estoque), 0) FROM notas_entrada_itens i WHERE i.nota_id = n.id) as unidades_estoque
    FROM notas_entrada n
    LEFT JOIN artesoes a ON a.id = n.artesao_id
    WHERE n.deleted_at IS NULL
    ORDER BY COALESCE(n.data_emissao, n.created_at) DESC, n.id DESC
  `).all()
}

function listarItensNotaEntrada(notaId) {
  return db.prepare(`
    SELECT i.*, p.nome as produto_nome, p.variacao as produto_variacao, p.estoque as produto_estoque,
           (SELECT COALESCE(SUM(di.quantidade), 0) FROM devolucoes_artesao_itens di
              JOIN devolucoes_artesao d ON d.id = di.devolucao_id AND d.deleted_at IS NULL
              WHERE di.nota_item_id = i.id) as quantidade_devolvida
    FROM notas_entrada_itens i
    LEFT JOIN produtos p ON p.id = i.produto_id
    WHERE i.nota_id = ?
    ORDER BY i.numero_item, i.id
  `).all(notaId)
}

/** Exclui a importação e retira do estoque o que ela tinha lançado. Os produtos criados continuam cadastrados. */
function excluirNotaEntrada(id) {
  const nota = db.prepare('SELECT id FROM notas_entrada WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!nota) throw new Error('Nota não encontrada.')
  const devolucao = db
    .prepare('SELECT id FROM devolucoes_artesao WHERE nota_entrada_id = ? AND deleted_at IS NULL LIMIT 1')
    .get(id)
  if (devolucao) throw new Error('Não é possível excluir: esta nota tem devolução registrada. Cancele a devolução antes.')
  const itens = db
    .prepare('SELECT produto_id, quantidade_estoque FROM notas_entrada_itens WHERE nota_id = ? AND quantidade_estoque > 0')
    .all(id)
  const getEstoque = db.prepare('SELECT nome, estoque FROM produtos WHERE id = ?')
  const updateEstoque = db.prepare(`UPDATE produtos SET estoque = estoque - ?, sync_status = 'pending' WHERE id = ?`)
  const insertMov = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'saida', ?, 'estorno_nfe', datetime('now', 'localtime'))
  `)

  db.transaction(() => {
    for (const item of itens) {
      const produto = getEstoque.get(item.produto_id)
      if (produto && Number(produto.estoque) < item.quantidade_estoque) {
        throw new Error(
          `Não é possível excluir: "${produto.nome}" já tem peças vendidas desta nota (estoque ${produto.estoque}).`,
        )
      }
      assertUmaLinhaProdutoEstoque(
        updateEstoque.run(item.quantidade_estoque, item.produto_id),
        item.produto_id,
        'Estorno de estoque (exclusão de nota de entrada)',
      )
      insertMov.run(item.produto_id, item.quantidade_estoque)
    }
    db.prepare("UPDATE notas_entrada SET deleted_at = datetime('now', 'localtime') WHERE id = ?").run(id)
  })()
  return { id }
}

// --- Devolução de peças consignadas ao artesão (base da NF-e 5918, emitida pela loja) ---

/**
 * Registra a devolução de peças de uma nota de remessa e tira do estoque.
 * @param {{ nota_entrada_id: number, itens: Array<{ nota_item_id: number, quantidade: number }>, observacao?: string }} dados
 */
function registrarDevolucaoArtesao({ nota_entrada_id, itens, observacao = null }) {
  const nota = db
    .prepare('SELECT id, tipo, artesao_id FROM notas_entrada WHERE id = ? AND deleted_at IS NULL')
    .get(nota_entrada_id)
  if (!nota) throw new Error('Nota não encontrada.')
  if (nota.tipo !== 'remessa_consignacao') throw new Error('Só é possível devolver peças de uma nota de remessa em consignação.')
  const pedidos = (Array.isArray(itens) ? itens : [])
    .map((i) => ({ nota_item_id: Number(i.nota_item_id), quantidade: Math.round(Number(i.quantidade) || 0) }))
    .filter((i) => i.quantidade > 0)
  if (pedidos.length === 0) throw new Error('Informe a quantidade de pelo menos uma peça.')

  const getItem = db.prepare(`
    SELECT i.id, i.produto_id, i.quantidade_estoque, i.valor_unitario, p.nome, p.estoque,
           (SELECT COALESCE(SUM(di.quantidade), 0) FROM devolucoes_artesao_itens di
              JOIN devolucoes_artesao d ON d.id = di.devolucao_id AND d.deleted_at IS NULL
              WHERE di.nota_item_id = i.id) as devolvida
    FROM notas_entrada_itens i
    JOIN produtos p ON p.id = i.produto_id
    WHERE i.id = ? AND i.nota_id = ?
  `)
  const insertDevolucao = db.prepare(`
    INSERT INTO devolucoes_artesao (nota_entrada_id, artesao_id, valor_total, observacao) VALUES (?, ?, ?, ?)
  `)
  const insertItem = db.prepare(`
    INSERT INTO devolucoes_artesao_itens (devolucao_id, nota_item_id, produto_id, quantidade, valor_unitario)
    VALUES (?, ?, ?, ?, ?)
  `)
  const updateEstoque = db.prepare(`UPDATE produtos SET estoque = estoque - ?, sync_status = 'pending' WHERE id = ?`)
  const insertMov = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'saida', ?, 'devolucao_artesao', datetime('now', 'localtime'))
  `)

  return db.transaction(() => {
    const linhas = pedidos.map((pedido) => {
      const item = getItem.get(pedido.nota_item_id, nota.id)
      if (!item) throw new Error('Item da nota não encontrado ou sem produto vinculado.')
      const restante = item.quantidade_estoque - item.devolvida
      if (pedido.quantidade > restante) {
        throw new Error(`"${item.nome}": só ${restante} peça(s) desta nota ainda podem ser devolvidas.`)
      }
      if (pedido.quantidade > Number(item.estoque)) {
        throw new Error(`"${item.nome}": o estoque atual é ${item.estoque}.`)
      }
      return { ...pedido, produto_id: item.produto_id, valor_unitario: Number(item.valor_unitario) || 0 }
    })
    const valorTotal = Math.round(linhas.reduce((acc, l) => acc + l.quantidade * l.valor_unitario, 0) * 100) / 100
    const devolucaoId = insertDevolucao.run(nota.id, nota.artesao_id, valorTotal, observacao || null).lastInsertRowid
    for (const linha of linhas) {
      insertItem.run(devolucaoId, linha.nota_item_id, linha.produto_id, linha.quantidade, linha.valor_unitario)
      assertUmaLinhaProdutoEstoque(
        updateEstoque.run(linha.quantidade, linha.produto_id),
        linha.produto_id,
        'Devolução ao artesão',
      )
      insertMov.run(linha.produto_id, linha.quantidade)
    }
    return { id: devolucaoId, valor_total: valorTotal }
  })()
}

function listarDevolucoesArtesao(notaEntradaId = null) {
  const filtro = notaEntradaId ? 'AND d.nota_entrada_id = ?' : ''
  const params = notaEntradaId ? [notaEntradaId] : []
  const devolucoes = db.prepare(`
    SELECT d.*, n.numero as nota_numero, n.serie as nota_serie, n.chave as nota_chave,
           a.razao_social as artesao_razao_social, a.nome_fantasia as artesao_nome_fantasia, a.nome as artesao_nome
    FROM devolucoes_artesao d
    JOIN notas_entrada n ON n.id = d.nota_entrada_id
    LEFT JOIN artesoes a ON a.id = d.artesao_id
    WHERE d.deleted_at IS NULL ${filtro}
    ORDER BY d.data DESC, d.id DESC
  `).all(...params)
  const getItens = db.prepare(`
    SELECT di.*, i.descricao, i.ncm, i.unidade, p.nome as produto_nome, p.variacao as produto_variacao
    FROM devolucoes_artesao_itens di
    JOIN notas_entrada_itens i ON i.id = di.nota_item_id
    LEFT JOIN produtos p ON p.id = di.produto_id
    WHERE di.devolucao_id = ?
    ORDER BY di.id
  `)
  return devolucoes.map((d) => ({ ...d, itens: getItens.all(d.id) }))
}

/** Cancela uma devolução que ainda não teve NF-e emitida e devolve as peças ao estoque. */
function cancelarDevolucaoArtesao(id) {
  const devolucao = db.prepare('SELECT id, status FROM devolucoes_artesao WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!devolucao) throw new Error('Devolução não encontrada.')
  if (devolucao.status !== 'aguardando_nf') throw new Error('Esta devolução já tem nota fiscal emitida.')
  const itens = db.prepare('SELECT produto_id, quantidade FROM devolucoes_artesao_itens WHERE devolucao_id = ?').all(id)
  const updateEstoque = db.prepare(`UPDATE produtos SET estoque = estoque + ?, sync_status = 'pending' WHERE id = ?`)
  const insertMov = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'entrada', ?, 'estorno_devolucao', datetime('now', 'localtime'))
  `)
  db.transaction(() => {
    for (const item of itens) {
      assertUmaLinhaProdutoEstoque(
        updateEstoque.run(item.quantidade, item.produto_id),
        item.produto_id,
        'Cancelamento de devolução',
      )
      insertMov.run(item.produto_id, item.quantidade)
    }
    db.prepare("UPDATE devolucoes_artesao SET deleted_at = datetime('now', 'localtime') WHERE id = ?").run(id)
  })()
  return { id }
}

// --- Configuração fiscal do emitente ---
// Fica em `configuracoes` (chaves fiscal_*), local deste computador.

const CONFIG_FISCAL_PADRAO = {
  cnpj: '',
  inscricao_estadual: '',
  razao_social: '',
  nome_fantasia: '',
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  municipio: '',
  codigo_municipio: '',
  uf: '',
  telefone: '',
  email: '',
  crt: '1',
  ambiente: '2',
  serie_nfce: '1',
  proximo_numero_nfce: '1',
  serie_nfe: '1',
  proximo_numero_nfe: '1',
  csc_id: '',
  csc: '',
}

const CONFIG_FISCAL_PREFIXO = 'fiscal_'

function obterConfigFiscal() {
  garantirFormacaoPrecoPadrao()
  const rows = db
    .prepare(`SELECT chave, valor FROM configuracoes WHERE chave LIKE '${CONFIG_FISCAL_PREFIXO}%'`)
    .all()
  const salvo = Object.fromEntries(rows.map((r) => [r.chave.slice(CONFIG_FISCAL_PREFIXO.length), r.valor]))
  const config = {}
  for (const [campo, padrao] of Object.entries(CONFIG_FISCAL_PADRAO)) {
    config[campo] = salvo[campo] ?? padrao
  }
  return config
}

function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '')
}

function inteiroPositivoConfig(valor, nome) {
  const n = parseInt(somenteDigitos(valor), 10)
  if (!Number.isFinite(n) || n < 1) throw new Error(`Informe ${nome}.`)
  return String(n)
}

function salvarConfigFiscal(data) {
  garantirFormacaoPrecoPadrao()
  const texto = (campo) => String(data?.[campo] ?? '').trim()

  const cnpj = somenteDigitos(data?.cnpj)
  if (cnpj && cnpj.length !== 14) throw new Error('O CNPJ deve ter 14 dígitos.')
  const cep = somenteDigitos(data?.cep)
  if (cep && cep.length !== 8) throw new Error('O CEP deve ter 8 dígitos.')
  const codigoMunicipio = somenteDigitos(data?.codigo_municipio)
  if (codigoMunicipio && codigoMunicipio.length !== 7) {
    throw new Error('O código IBGE do município deve ter 7 dígitos.')
  }
  const uf = texto('uf').toUpperCase()
  if (uf && !/^[A-Z]{2}$/.test(uf)) throw new Error('UF inválida.')
  const crt = texto('crt') || '1'
  if (!['1', '2', '3', '4'].includes(crt)) throw new Error('Regime tributário (CRT) inválido.')
  const ambiente = texto('ambiente') || '2'
  if (!['1', '2'].includes(ambiente)) throw new Error('Ambiente inválido.')

  const registro = {
    cnpj,
    inscricao_estadual: somenteDigitos(data?.inscricao_estadual),
    razao_social: texto('razao_social'),
    nome_fantasia: texto('nome_fantasia'),
    cep,
    logradouro: texto('logradouro'),
    numero: texto('numero'),
    complemento: texto('complemento'),
    bairro: texto('bairro'),
    municipio: texto('municipio'),
    codigo_municipio: codigoMunicipio,
    uf,
    telefone: somenteDigitos(data?.telefone),
    email: texto('email'),
    crt,
    ambiente,
    serie_nfce: inteiroPositivoConfig(data?.serie_nfce, 'a série da NFC-e'),
    proximo_numero_nfce: inteiroPositivoConfig(data?.proximo_numero_nfce, 'o próximo número da NFC-e'),
    serie_nfe: inteiroPositivoConfig(data?.serie_nfe, 'a série da NF-e'),
    proximo_numero_nfe: inteiroPositivoConfig(data?.proximo_numero_nfe, 'o próximo número da NF-e'),
    csc_id: somenteDigitos(data?.csc_id),
    csc: texto('csc'),
  }

  const upsert = db.prepare(`
    INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor
  `)
  db.transaction(() => {
    for (const [campo, valor] of Object.entries(registro)) {
      upsert.run(CONFIG_FISCAL_PREFIXO + campo, valor)
    }
  })()
  return obterConfigFiscal()
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
  backfillPrecoCustoUnitarioVendasItens,
  criarArtesao,
  listarArtesoes,
  atualizarArtesao,
  excluirArtesao,
  criarProduto,
  listarProdutos,
  atualizarProduto,
  excluirProduto,
  buscarProdutoPorCodigo,
  refazerCodigoBarras,
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
  obterFormacaoPreco,
  salvarFormacaoPreco,
  aplicarPrecoFormacaoEmTodos,
  obterRelatoriosPeriodoPadrao,
  salvarRelatoriosPeriodoPadrao,
  obterConfigFiscal,
  salvarConfigFiscal,
  buscarArtesaoPorDocumento,
  buscarNotaEntradaPorChave,
  importarNotaEntrada,
  listarNotasEntrada,
  listarItensNotaEntrada,
  excluirNotaEntrada,
  registrarDevolucaoArtesao,
  listarDevolucoesArtesao,
  cancelarDevolucaoArtesao,
}