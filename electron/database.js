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
  'notas_fiscais',
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
// NFC-e emitidas pela loja (Focus NFe). Uma linha por tentativa de envio; ficam só neste computador.
db.exec(`
  CREATE TABLE IF NOT EXISTS notas_fiscais (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER,
    modelo TEXT NOT NULL DEFAULT '65',
    ref TEXT NOT NULL UNIQUE,
    ambiente TEXT NOT NULL,
    status TEXT NOT NULL,
    numero TEXT,
    serie TEXT,
    chave TEXT,
    protocolo TEXT,
    mensagem TEXT,
    valor_total REAL NOT NULL DEFAULT 0,
    caminho_danfe TEXT,
    caminho_xml TEXT,
    url_qrcode TEXT,
    xml TEXT,
    requisicao TEXT,
    resposta TEXT,
    cancelada_em TEXT,
    justificativa_cancelamento TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (venda_id) REFERENCES vendas(id)
  );
`)

try {
  if (!tabelaTemColuna(db, 'notas_fiscais', 'devolucao_id')) {
    db.exec(`ALTER TABLE notas_fiscais ADD COLUMN devolucao_id INTEGER REFERENCES devolucoes_artesao(id)`)
  }
  if (!tabelaTemColuna(db, 'notas_fiscais', 'devolucao_cliente_id')) {
    db.exec(`ALTER TABLE notas_fiscais ADD COLUMN devolucao_cliente_id INTEGER`)
  }
  // Devolução simbólica (5919) das peças vendidas: não mexe no estoque, cobre um período de vendas.
  for (const [coluna, tipo] of [
    ['tipo', "TEXT NOT NULL DEFAULT 'fisica'"],
    ['periodo_inicio', 'TEXT'],
    ['periodo_fim', 'TEXT'],
    ['cfop', 'TEXT'],
  ]) {
    if (!tabelaTemColuna(db, 'devolucoes_artesao', coluna)) {
      db.exec(`ALTER TABLE devolucoes_artesao ADD COLUMN ${coluna} ${tipo}`)
    }
  }
  // Hora da autorização na SEFAZ: base do prazo de cancelamento. As antigas usam a última atualização.
  if (!tabelaTemColuna(db, 'notas_fiscais', 'autorizada_em')) {
    db.exec(`ALTER TABLE notas_fiscais ADD COLUMN autorizada_em TEXT`)
    db.exec(`UPDATE notas_fiscais SET autorizada_em = updated_at WHERE status IN ('autorizado', 'cancelado')`)
  }
  // A tabela é criada depois do laço de ORDEM_SYNC: as colunas de sync entram aqui.
  if (!tabelaTemColuna(db, 'notas_fiscais', 'sync_status')) {
    db.exec(`ALTER TABLE notas_fiscais ADD COLUMN sync_status TEXT DEFAULT 'pending'`)
  }
  if (!tabelaTemColuna(db, 'notas_fiscais', 'deleted_at')) {
    db.exec(`ALTER TABLE notas_fiscais ADD COLUMN deleted_at TEXT`)
  }
} catch (_) {}

// Devolução/troca de cliente: NF-e de entrada da loja referenciando o cupom da venda.
db.exec(`
  CREATE TABLE IF NOT EXISTS devolucoes_cliente (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venda_id INTEGER NOT NULL,
    data TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    valor_total REAL NOT NULL DEFAULT 0,
    remover_caixa INTEGER NOT NULL DEFAULT 0,
    forma_reembolso TEXT,
    cliente_nome TEXT NOT NULL,
    cliente_cpf_cnpj TEXT NOT NULL,
    cliente_logradouro TEXT,
    cliente_numero TEXT,
    cliente_bairro TEXT,
    cliente_cidade TEXT,
    cliente_uf TEXT,
    cliente_cep TEXT,
    motivo TEXT,
    deleted_at TEXT,
    FOREIGN KEY (venda_id) REFERENCES vendas(id)
  );

  CREATE TABLE IF NOT EXISTS devolucoes_cliente_itens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    devolucao_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    quantidade INTEGER NOT NULL,
    valor_unitario REAL NOT NULL DEFAULT 0,
    cfop TEXT NOT NULL,
    FOREIGN KEY (devolucao_id) REFERENCES devolucoes_cliente(id),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  );
`)

// Tabela do IBPT (Lei 12.741/12): alíquotas aproximadas por NCM, para o "Trib. aprox." do cupom.
db.exec(`
  CREATE TABLE IF NOT EXISTS ibpt (
    ncm TEXT NOT NULL,
    ex TEXT NOT NULL DEFAULT '',
    nacional_federal REAL NOT NULL DEFAULT 0,
    importados_federal REAL NOT NULL DEFAULT 0,
    estadual REAL NOT NULL DEFAULT 0,
    municipal REAL NOT NULL DEFAULT 0,
    vigencia_fim TEXT,
    versao TEXT,
    fonte TEXT,
    PRIMARY KEY (ncm, ex)
  );
`)

// Faixas de numeração inutilizadas na SEFAZ (números pulados que não viraram nota).
db.exec(`
  CREATE TABLE IF NOT EXISTS inutilizacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    modelo TEXT NOT NULL,
    serie TEXT NOT NULL,
    numero_inicial INTEGER NOT NULL,
    numero_final INTEGER NOT NULL,
    ambiente TEXT NOT NULL,
    justificativa TEXT,
    protocolo TEXT,
    caminho_xml TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
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
  // Notas de homologação são testes do próprio PC: não vão para a nuvem.
  const filtroExtra = tabela === 'notas_fiscais' ? " AND ambiente = '1'" : ''
  return db.prepare(`SELECT * FROM ${tabela} WHERE sync_status = 'pending'${filtroExtra}`).all()
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

/** Grava o mesmo NCM (e, opcionalmente, o tipo) em vários produtos. Devolve quantos foram alterados. */
function atualizarFiscalEmLote(ids, { ncm, tipo_posse = null } = {}) {
  const digitos = String(ncm ?? '').replace(/\D/g, '')
  if (digitos.length !== 8) throw new Error('O NCM precisa ter 8 números.')
  if (tipo_posse && !TIPOS_POSSE.includes(tipo_posse)) throw new Error('Tipo de produto inválido.')
  const lista = [...new Set((ids || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
  if (lista.length === 0) throw new Error('Nenhum produto selecionado.')
  const stmt = db.prepare(`
    UPDATE produtos SET ncm = ?, tipo_posse = COALESCE(?, tipo_posse), sync_status = 'pending'
    WHERE id = ? AND deleted_at IS NULL
  `)
  let total = 0
  db.transaction(() => {
    for (const id of lista) total += stmt.run(digitos, tipo_posse, id).changes
  })()
  return total
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
  return ordenarCaixa(atribuirSequenciaPagamentosCaixa(rows).concat(reembolsosCaixaComSequencia(dataISO, dataISO)))
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
  return ordenarCaixa(atribuirSequenciaPagamentosCaixa(rows).concat(reembolsosCaixaComSequencia(dataInicio, dataFim)))
}

function ordenarCaixa(linhas) {
  return linhas.sort((a, b) => String(b.data).localeCompare(String(a.data)))
}

/** Reembolsos de devolução de cliente no Caixa (sequência 0: não é pagamento da venda, não tem ações). */
function reembolsosCaixaComSequencia(dataInicio, dataFim) {
  return listarReembolsosCaixa(dataInicio, dataFim).map((r) => ({ ...r, sequencia: `D${r.devolucao_cliente_id}` }))
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
  exigirVendaSemNfceAutorizada(id, 'excluir a venda')
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
  exigirVendaSemNfceAutorizada(vendaId, 'alterar a venda')

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
  const totais = db.prepare(`
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
  // Reembolsos de devolução de cliente saem do total da forma usada.
  for (const r of listarReembolsosCaixa(dataInicio, dataFim)) {
    const linha = totais.find((t) => t.forma_pagamento === r.forma_pagamento)
    if (linha) linha.total += r.valor
    else totais.push({ forma_pagamento: r.forma_pagamento, total: r.valor, qtd_transacoes: 0 })
  }
  return totais
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
  compra: { movimentaEstoque: true, tipoPosse: 'proprio', icmsSt: false },
  compra_st: { movimentaEstoque: true, tipoPosse: 'proprio', icmsSt: true },
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
    UPDATE produtos SET ncm = COALESCE(?, ncm), cest = COALESCE(?, cest), tipo_posse = ?,
      icms_st = COALESCE(?, icms_st), sync_status = 'pending'
    WHERE id = ?
  `)

  return db.transaction(() => {
    if (buscarNotaEntradaPorChave(chave)) throw new Error('Esta nota já foi importada.')

    let artesaoId = artesao_id ? Number(artesao_id) : null
    if (!artesaoId && novo_artesao) {
      artesaoId = Number(criarArtesao(novo_artesao).id)
    }
    // Fornecedor escolhido sem CPF/CNPJ no cadastro: guarda o da nota, para as próximas notas
    // serem reconhecidas sozinhas e a NF-e de devolução ter o documento do destinatário.
    const documentoNota = String(nota.emitente_cpf_cnpj ?? '').replace(/\D/g, '')
    if (artesaoId && documentoNota) {
      db.prepare(`
        UPDATE artesoes SET cpf_cnpj = ?, sync_status = 'pending'
        WHERE id = ? AND (cpf_cnpj IS NULL OR TRIM(cpf_cnpj) = '')
      `).run(documentoNota, artesaoId)
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
            icms_st: Boolean(regra.icmsSt),
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
            regra.icmsSt === undefined ? null : regra.icmsSt ? 1 : 0,
            produtoId,
          )
        }
      }

      // Peça que já estava no estoque antes da importação (cadastrada no sistema antigo): só vincula, não soma.
      const somarEstoque = item.acao === 'criar' || item.somar_estoque !== false
      const entraNoEstoque = regra.movimentaEstoque && produtoId && quantidadeEstoque > 0 && somarEstoque
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

/** Itens de notas anteriores do fornecedor já ligados a um produto (código do item no fornecedor → produto). */
function listarVinculosNotaEntrada(artesaoId) {
  if (!artesaoId) return []
  return db.prepare(`
    SELECT i.codigo, i.produto_id, MAX(i.id) as ultimo
    FROM notas_entrada_itens i
    JOIN notas_entrada n ON n.id = i.nota_id AND n.deleted_at IS NULL
    JOIN produtos p ON p.id = i.produto_id AND p.deleted_at IS NULL
    WHERE n.artesao_id = ? AND i.codigo IS NOT NULL AND i.codigo != ''
    GROUP BY i.codigo
  `).all(artesaoId).map(({ codigo, produto_id }) => ({ codigo, produto_id }))
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
  return devolucoes.map((d) => {
    const nota = ultimaNotaFiscalDaDevolucao(d.id)
    return {
      ...d,
      itens: getItens.all(d.id),
      nota_fiscal: nota
        ? { id: nota.id, status: nota.status, numero: nota.numero, serie: nota.serie, mensagem: nota.mensagem }
        : null,
    }
  })
}

/** Cancela uma devolução que ainda não teve NF-e emitida e devolve as peças ao estoque. */
function cancelarDevolucaoArtesao(id) {
  const devolucao = db.prepare('SELECT id, status FROM devolucoes_artesao WHERE id = ? AND deleted_at IS NULL').get(id)
  if (!devolucao) throw new Error('Devolução não encontrada.')
  if (devolucao.status !== 'aguardando_nf') throw new Error('Esta devolução já tem nota fiscal emitida.')
  const notaFiscal = ultimaNotaFiscalDaDevolucao(id)
  if (notaFiscal && ['enviando', 'processando_autorizacao', 'autorizado'].includes(notaFiscal.status)) {
    throw new Error('A NF-e desta devolução está em processamento ou autorizada. Confira em Notas emitidas.')
  }
  // A devolução simbólica não tirou nada do estoque (as peças foram vendidas), então não devolve.
  const simbolica = db.prepare('SELECT tipo FROM devolucoes_artesao WHERE id = ?').get(id)?.tipo === 'simbolica'
  const itens = simbolica
    ? []
    : db.prepare('SELECT produto_id, quantidade FROM devolucoes_artesao_itens WHERE devolucao_id = ?').all(id)
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

// --- Devolução simbólica das peças consignadas vendidas (NF-e 5919, Ajuste SINIEF 02/93) ---

/**
 * Peças consignadas do artesão vendidas no período, distribuídas pelas notas de remessa (a mais antiga primeiro,
 * até o saldo de cada item ainda não devolvido). Uma devolução por nota de remessa.
 * @param {{ artesao_id: number, dataInicio: string, dataFim: string, base?: 'remessa'|'venda' }} filtros
 * @returns {{ grupos: Array<{ nota_entrada_id, nota_numero, nota_chave, itens, valor_total }>, sem_remessa: Array }}
 */
function calcularDevolucaoSimbolica({ artesao_id, dataInicio, dataFim, base = 'remessa' }) {
  if (!artesao_id) throw new Error('Escolha o fornecedor.')
  if (!dataInicio || !dataFim || dataInicio > dataFim) throw new Error('Período inválido.')
  const vendidos = db.prepare(`
    SELECT vi.produto_id, p.nome, p.variacao, SUM(vi.quantidade) as quantidade,
           SUM(vi.quantidade * vi.preco_unitario) / SUM(vi.quantidade) as preco_medio
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id
    WHERE vi.deleted_at IS NULL AND p.artesao_id = ? AND COALESCE(p.tipo_posse, 'consignado') = 'consignado'
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    GROUP BY vi.produto_id
  `).all(artesao_id, dataInicio, dataFim)
  const remessas = db.prepare(`
    SELECT i.id as nota_item_id, i.nota_id, i.quantidade_estoque, i.valor_unitario,
           n.numero as nota_numero, n.chave as nota_chave, n.data_emissao,
           (SELECT COALESCE(SUM(di.quantidade), 0) FROM devolucoes_artesao_itens di
              JOIN devolucoes_artesao d ON d.id = di.devolucao_id AND d.deleted_at IS NULL
              WHERE di.nota_item_id = i.id) as devolvida
    FROM notas_entrada_itens i
    JOIN notas_entrada n ON n.id = i.nota_id AND n.deleted_at IS NULL AND n.tipo = 'remessa_consignacao'
    WHERE i.produto_id = ?
    ORDER BY n.data_emissao, n.id, i.id
  `)
  const grupos = new Map()
  const semRemessa = []
  for (const v of vendidos) {
    let falta = Number(v.quantidade) || 0
    for (const r of remessas.all(v.produto_id)) {
      if (falta <= 0) break
      const saldo = Number(r.quantidade_estoque) - Number(r.devolvida)
      if (saldo <= 0) continue
      const qtd = Math.min(saldo, falta)
      falta -= qtd
      if (!grupos.has(r.nota_id)) {
        grupos.set(r.nota_id, { nota_entrada_id: r.nota_id, nota_numero: r.nota_numero, nota_chave: r.nota_chave, itens: [] })
      }
      grupos.get(r.nota_id).itens.push({
        nota_item_id: r.nota_item_id,
        produto_id: v.produto_id,
        nome: [v.nome, v.variacao].filter(Boolean).join(' - '),
        quantidade: qtd,
        valor_unitario: base === 'venda' ? Math.round(Number(v.preco_medio) * 100) / 100 : Number(r.valor_unitario) || 0,
      })
    }
    if (falta > 0) semRemessa.push({ produto_id: v.produto_id, nome: v.nome, quantidade: falta })
  }
  const lista = [...grupos.values()].map((g) => ({
    ...g,
    valor_total: Math.round(g.itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0) * 100) / 100,
  }))
  return { grupos: lista, sem_remessa: semRemessa }
}

/** Grava as devoluções simbólicas do período (uma por nota de remessa), prontas para emitir a NF-e. */
function registrarDevolucaoSimbolica({ artesao_id, dataInicio, dataFim, base = 'remessa', cfop = '5919' }) {
  if (!['5919', '6919'].includes(String(cfop))) throw new Error('CFOP inválido para devolução simbólica.')
  const sobreposta = db.prepare(`
    SELECT periodo_inicio, periodo_fim FROM devolucoes_artesao
    WHERE deleted_at IS NULL AND tipo = 'simbolica' AND artesao_id = ?
      AND date(periodo_inicio) <= date(?) AND date(periodo_fim) >= date(?)
    LIMIT 1
  `).get(artesao_id, dataFim, dataInicio)
  if (sobreposta) {
    throw new Error(`Já existe devolução simbólica deste fornecedor de ${sobreposta.periodo_inicio} a ${sobreposta.periodo_fim}.`)
  }
  const { grupos } = calcularDevolucaoSimbolica({ artesao_id, dataInicio, dataFim, base })
  if (grupos.length === 0) throw new Error('Nenhuma peça consignada deste fornecedor vendida no período com nota de remessa.')
  const insertDevolucao = db.prepare(`
    INSERT INTO devolucoes_artesao (nota_entrada_id, artesao_id, valor_total, observacao, tipo, periodo_inicio, periodo_fim, cfop)
    VALUES (?, ?, ?, NULL, 'simbolica', ?, ?, ?)
  `)
  const insertItem = db.prepare(`
    INSERT INTO devolucoes_artesao_itens (devolucao_id, nota_item_id, produto_id, quantidade, valor_unitario)
    VALUES (?, ?, ?, ?, ?)
  `)
  return db.transaction(() =>
    grupos.map((g) => {
      const id = insertDevolucao.run(g.nota_entrada_id, artesao_id, g.valor_total, dataInicio, dataFim, String(cfop)).lastInsertRowid
      for (const i of g.itens) insertItem.run(id, i.nota_item_id, i.produto_id, i.quantidade, i.valor_unitario)
      return { id, nota_numero: g.nota_numero, valor_total: g.valor_total }
    }),
  )()
}

// --- Devolução/troca de cliente (NF-e de entrada referenciando o cupom) ---

/** Itens da venda com quanto ainda pode ser devolvido, e o cupom autorizado que será referenciado. */
function obterVendaParaDevolucaoCliente(vendaId) {
  const venda = db.prepare('SELECT * FROM vendas WHERE id = ? AND deleted_at IS NULL').get(vendaId)
  if (!venda) throw new Error('Venda não encontrada.')
  const cupom = ultimaNotaFiscalDaVenda(vendaId)
  const itens = db.prepare(`
    SELECT vi.produto_id, SUM(vi.quantidade) as quantidade,
           SUM(vi.quantidade * vi.preco_unitario) / SUM(vi.quantidade) as valor_unitario,
           p.nome, p.variacao, p.tipo_posse, p.icms_st,
           (SELECT COALESCE(SUM(di.quantidade), 0) FROM devolucoes_cliente_itens di
              JOIN devolucoes_cliente d ON d.id = di.devolucao_id AND d.deleted_at IS NULL
              WHERE d.venda_id = vi.venda_id AND di.produto_id = vi.produto_id) as devolvida
    FROM vendas_itens vi
    JOIN produtos p ON p.id = vi.produto_id
    WHERE vi.venda_id = ? AND vi.deleted_at IS NULL
    GROUP BY vi.produto_id
  `).all(vendaId)
  // Desconto da venda rateado: devolve o que o cliente pagou de fato.
  const bruto = itens.reduce((s, i) => s + i.quantidade * i.valor_unitario, 0)
  const fator = bruto > 0 ? Number(venda.valor_total) / bruto : 1
  return {
    venda,
    cupom: cupom && cupom.status === 'autorizado' ? { id: cupom.id, numero: cupom.numero, chave: cupom.chave } : null,
    itens: itens.map((i) => ({ ...i, valor_unitario: Math.round(i.valor_unitario * fator * 100) / 100 })),
  }
}

const CFOPS_DEVOLUCAO_CLIENTE = ['1202', '1411', '1918']
const FORMAS_PAGAMENTO_VALIDAS = ['dinheiro', 'credito', 'debito', 'pix']

/**
 * Registra a devolução do cliente: volta as peças ao estoque e, se pedido, tira o valor do caixa.
 * @param {object} dados - { venda_id, itens: [{ produto_id, quantidade, cfop }], cliente: {...}, remover_caixa, forma_reembolso, motivo }
 */
function registrarDevolucaoCliente({ venda_id, itens, cliente = {}, remover_caixa = false, forma_reembolso = 'dinheiro', motivo = '' }) {
  const { venda, cupom, itens: vendidos } = obterVendaParaDevolucaoCliente(venda_id)
  if (!cupom?.chave) throw new Error('A venda precisa ter cupom fiscal autorizado para emitir a NF-e de devolução.')
  const doc = String(cliente.cpf_cnpj || '').replace(/\D/g, '')
  if (doc.length !== 11 && doc.length !== 14) throw new Error('Informe o CPF ou CNPJ do cliente.')
  const faltando = [
    ['nome', 'nome'],
    ['logradouro', 'endereço'],
    ['numero', 'número'],
    ['bairro', 'bairro'],
    ['cidade', 'cidade'],
    ['uf', 'UF'],
    ['cep', 'CEP'],
  ].filter(([c]) => !String(cliente[c] || '').trim())
  if (faltando.length) throw new Error(`Complete os dados do cliente: ${faltando.map(([, n]) => n).join(', ')}.`)
  if (!FORMAS_PAGAMENTO_VALIDAS.includes(forma_reembolso)) throw new Error('Forma de reembolso inválida.')

  const linhas = (itens || [])
    .map((i) => ({ produto_id: Number(i.produto_id), quantidade: Math.round(Number(i.quantidade) || 0), cfop: String(i.cfop) }))
    .filter((i) => i.quantidade > 0)
    .map((i) => {
      const v = vendidos.find((x) => x.produto_id === i.produto_id)
      if (!v) throw new Error('Produto não pertence a esta venda.')
      if (i.quantidade > v.quantidade - v.devolvida) {
        throw new Error(`"${v.nome}": só ${v.quantidade - v.devolvida} peça(s) ainda podem ser devolvidas.`)
      }
      if (!CFOPS_DEVOLUCAO_CLIENTE.includes(i.cfop)) throw new Error(`CFOP ${i.cfop} inválido.`)
      return { ...i, valor_unitario: v.valor_unitario }
    })
  if (linhas.length === 0) throw new Error('Informe a quantidade de pelo menos uma peça.')
  const valorTotal = Math.round(linhas.reduce((s, l) => s + l.quantidade * l.valor_unitario, 0) * 100) / 100

  const insert = db.prepare(`
    INSERT INTO devolucoes_cliente (venda_id, valor_total, remover_caixa, forma_reembolso, cliente_nome, cliente_cpf_cnpj,
      cliente_logradouro, cliente_numero, cliente_bairro, cliente_cidade, cliente_uf, cliente_cep, motivo)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const insertItem = db.prepare(`
    INSERT INTO devolucoes_cliente_itens (devolucao_id, produto_id, quantidade, valor_unitario, cfop) VALUES (?, ?, ?, ?, ?)
  `)
  const updateEstoque = db.prepare(`UPDATE produtos SET estoque = estoque + ?, sync_status = 'pending' WHERE id = ?`)
  const insertMov = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem, data)
    VALUES (?, 'entrada', ?, 'devolucao_cliente', datetime('now', 'localtime'))
  `)
  return db.transaction(() => {
    const id = insert.run(
      venda.id,
      valorTotal,
      remover_caixa ? 1 : 0,
      remover_caixa ? forma_reembolso : null,
      String(cliente.nome).trim().slice(0, 60),
      doc,
      String(cliente.logradouro).trim(),
      String(cliente.numero).trim(),
      String(cliente.bairro).trim(),
      String(cliente.cidade).trim(),
      String(cliente.uf).trim().toUpperCase(),
      String(cliente.cep).replace(/\D/g, ''),
      String(motivo || '').trim() || null,
    ).lastInsertRowid
    for (const l of linhas) {
      insertItem.run(id, l.produto_id, l.quantidade, l.valor_unitario, l.cfop)
      assertUmaLinhaProdutoEstoque(updateEstoque.run(l.quantidade, l.produto_id), l.produto_id, 'Devolução de cliente')
      insertMov.run(l.produto_id, l.quantidade)
    }
    return { id, valor_total: valorTotal }
  })()
}

/** Devolução de cliente com itens e a chave do cupom, para montar a NF-e de entrada. */
function obterDevolucaoClienteParaNfe(devolucaoId) {
  const devolucao = db.prepare('SELECT * FROM devolucoes_cliente WHERE id = ? AND deleted_at IS NULL').get(devolucaoId)
  if (!devolucao) throw new Error('Devolução não encontrada.')
  const cupom = ultimaNotaFiscalDaVenda(devolucao.venda_id)
  const itens = db.prepare(`
    SELECT di.*, p.nome, p.variacao, p.ncm, p.cest, p.origem, p.unidade, p.codigo_barras
    FROM devolucoes_cliente_itens di JOIN produtos p ON p.id = di.produto_id
    WHERE di.devolucao_id = ? ORDER BY di.id
  `).all(devolucaoId)
  return { devolucao, itens, chaveCupom: cupom?.status === 'autorizado' ? cupom.chave : null }
}

function ultimaNotaFiscalDaDevolucaoCliente(devolucaoId) {
  return db.prepare('SELECT * FROM notas_fiscais WHERE devolucao_cliente_id = ? ORDER BY id DESC LIMIT 1').get(devolucaoId) || null
}

function contarTentativasNotaFiscalDevolucaoCliente(devolucaoId) {
  return db.prepare('SELECT COUNT(*) as n FROM notas_fiscais WHERE devolucao_cliente_id = ?').get(devolucaoId).n
}

/** Reembolsos de devolução de cliente que saem do caixa, como linhas negativas do Caixa. */
function listarReembolsosCaixa(dataInicio, dataFim) {
  return db.prepare(`
    SELECT d.venda_id, d.data, -d.valor_total as valor_total, d.forma_reembolso as forma_pagamento,
           -d.valor_total as valor, 'Devolução de cliente' as itens_resumo, 0 as qtd_itens, 1 as estorno,
           d.id as devolucao_cliente_id
    FROM devolucoes_cliente d
    WHERE d.deleted_at IS NULL AND d.remover_caixa = 1
      AND date(d.data) >= date(?) AND date(d.data) <= date(?)
  `).all(dataInicio, dataFim)
}

// --- Relatório fiscal (contador) ---

/** Notas autorizadas/canceladas do período (pela data de emissão), para o .zip de XMLs. */
function listarNotasParaXml({ dataInicio, dataFim, ambiente }) {
  return db.prepare(`
    SELECT n.id, n.modelo, n.numero, n.serie, n.chave, n.status, n.xml, n.caminho_xml, n.ambiente,
           n.venda_id, n.devolucao_id, n.devolucao_cliente_id, d.tipo as devolucao_tipo
    FROM notas_fiscais n
    LEFT JOIN devolucoes_artesao d ON d.id = n.devolucao_id
    WHERE n.status IN ('autorizado', 'cancelado') AND n.ambiente = ?
      AND date(n.created_at) >= date(?) AND date(n.created_at) <= date(?)
    ORDER BY n.id
  `).all(String(ambiente), dataInicio, dataFim)
}

/** XMLs das notas de fornecedores (entrada) emitidas no período. */
function listarXmlsEntrada(dataInicio, dataFim) {
  return db.prepare(`
    SELECT chave, tipo, xml FROM notas_entrada
    WHERE deleted_at IS NULL AND date(data_emissao) >= date(?) AND date(data_emissao) <= date(?)
    ORDER BY data_emissao
  `).all(dataInicio, dataFim)
}

/**
 * Faturamento do período separado como o PGDAS pede: revenda normal (5102), com ICMS-ST (5405) e
 * consignado (5115). Desconto da venda rateado entre os itens; devoluções de cliente descontadas.
 */
function resumoFiscalPeriodo(dataInicio, dataFim) {
  const categoria = `CASE WHEN COALESCE(p.tipo_posse, 'consignado') = 'proprio'
                          THEN CASE WHEN p.icms_st = 1 THEN 'st' ELSE 'normal' END
                          ELSE 'consignado' END`
  const vendas = db.prepare(`
    SELECT ${categoria} as categoria,
           SUM(vi.quantidade * vi.preco_unitario *
               (v.valor_total / NULLIF((SELECT SUM(x.quantidade * x.preco_unitario) FROM vendas_itens x
                                         WHERE x.venda_id = v.id AND x.deleted_at IS NULL), 0))) as valor
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id AND v.deleted_at IS NULL
    JOIN produtos p ON p.id = vi.produto_id
    WHERE vi.deleted_at IS NULL AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    GROUP BY categoria
  `).all(dataInicio, dataFim)
  const devolucoes = db.prepare(`
    SELECT ${categoria} as categoria, SUM(di.quantidade * di.valor_unitario) as valor
    FROM devolucoes_cliente_itens di
    JOIN devolucoes_cliente d ON d.id = di.devolucao_id AND d.deleted_at IS NULL
    JOIN produtos p ON p.id = di.produto_id
    WHERE date(d.data) >= date(?) AND date(d.data) <= date(?)
    GROUP BY categoria
  `).all(dataInicio, dataFim)
  const cupons = db.prepare(`
    SELECT
      SUM(CASE WHEN n.status = 'autorizado' THEN 1 ELSE 0 END) as autorizados,
      SUM(CASE WHEN n.status = 'cancelado' THEN 1 ELSE 0 END) as cancelados,
      SUM(CASE WHEN n.id IS NULL OR n.status NOT IN ('autorizado', 'cancelado') THEN 1 ELSE 0 END) as sem_cupom,
      SUM(CASE WHEN n.status = 'autorizado' THEN v.valor_total ELSE 0 END) as valor_autorizado,
      COUNT(*) as vendas
    FROM vendas v
    LEFT JOIN notas_fiscais n ON n.id = (SELECT MAX(t.id) FROM notas_fiscais t WHERE t.venda_id = v.id)
    WHERE v.deleted_at IS NULL AND date(v.data) >= date(?) AND date(v.data) <= date(?)
  `).get(dataInicio, dataFim)
  const linhas = ['normal', 'st', 'consignado'].map((c) => {
    const bruto = vendas.find((v) => v.categoria === c)?.valor || 0
    const devolvido = devolucoes.find((v) => v.categoria === c)?.valor || 0
    const r = (n) => Math.round(n * 100) / 100
    return { categoria: c, vendas: r(bruto), devolucoes: r(devolvido), liquido: r(bruto - devolvido) }
  })
  return { linhas, cupons }
}

// --- NFC-e emitidas (Focus NFe) ---

/** Venda com os dados fiscais de cada produto, para montar a NFC-e. */
function obterVendaParaNfce(vendaId) {
  const venda = db.prepare('SELECT * FROM vendas WHERE id = ? AND deleted_at IS NULL').get(vendaId)
  if (!venda) throw new Error('Venda não encontrada.')
  const itens = db.prepare(`
    SELECT vi.produto_id, vi.quantidade, vi.preco_unitario,
           p.nome, p.variacao, p.codigo_barras, p.ncm, p.cest, p.origem, p.tipo_posse, p.icms_st, p.unidade
    FROM vendas_itens vi
    JOIN produtos p ON p.id = vi.produto_id
    WHERE vi.venda_id = ? AND vi.deleted_at IS NULL
    ORDER BY vi.id
  `).all(vendaId)
  const pagamentos = db
    .prepare('SELECT forma_pagamento, valor FROM vendas_pagamentos WHERE venda_id = ? AND deleted_at IS NULL ORDER BY id')
    .all(vendaId)
  return { venda, itens, pagamentos }
}

const CAMPOS_NOTA_FISCAL = [
  'status', 'numero', 'serie', 'chave', 'protocolo', 'mensagem', 'caminho_danfe', 'caminho_xml', 'url_qrcode',
  'xml', 'resposta', 'cancelada_em', 'justificativa_cancelamento', 'autorizada_em',
]

function criarNotaFiscal({
  venda_id = null,
  devolucao_id = null,
  devolucao_cliente_id = null,
  modelo = '65',
  ref,
  ambiente,
  valor_total,
  requisicao,
}) {
  const id = db.prepare(`
    INSERT INTO notas_fiscais (venda_id, devolucao_id, devolucao_cliente_id, modelo, ref, ambiente, status, valor_total, requisicao)
    VALUES (?, ?, ?, ?, ?, ?, 'enviando', ?, ?)
  `).run(
    venda_id,
    devolucao_id,
    devolucao_cliente_id,
    modelo,
    ref,
    String(ambiente),
    Number(valor_total) || 0,
    requisicao ? JSON.stringify(requisicao) : null,
  ).lastInsertRowid
  return obterNotaFiscal(id)
}

function atualizarNotaFiscal(id, dados) {
  const campos = CAMPOS_NOTA_FISCAL.filter((c) => dados[c] !== undefined)
  if (campos.length > 0) {
    const sets = campos.map((c) => `${c} = ?`).join(', ')
    const valores = campos.map((c) => (c === 'resposta' && dados[c] && typeof dados[c] !== 'string' ? JSON.stringify(dados[c]) : dados[c]))
    db.prepare(`UPDATE notas_fiscais SET ${sets}, updated_at = datetime('now', 'localtime'), sync_status = 'pending' WHERE id = ?`).run(...valores, id)
  }
  return obterNotaFiscal(id)
}

function obterNotaFiscal(id) {
  return db.prepare('SELECT * FROM notas_fiscais WHERE id = ?').get(id) || null
}

/** Última tentativa de NFC-e da venda (a que vale). */
function ultimaNotaFiscalDaVenda(vendaId) {
  return db.prepare('SELECT * FROM notas_fiscais WHERE venda_id = ? ORDER BY id DESC LIMIT 1').get(vendaId) || null
}

function contarTentativasNotaFiscal(vendaId) {
  return db.prepare('SELECT COUNT(*) as n FROM notas_fiscais WHERE venda_id = ?').get(vendaId).n
}

/** Última tentativa de NF-e de uma devolução ao artesão. */
function ultimaNotaFiscalDaDevolucao(devolucaoId) {
  return db.prepare('SELECT * FROM notas_fiscais WHERE devolucao_id = ? ORDER BY id DESC LIMIT 1').get(devolucaoId) || null
}

function contarTentativasNotaFiscalDevolucao(devolucaoId) {
  return db.prepare('SELECT COUNT(*) as n FROM notas_fiscais WHERE devolucao_id = ?').get(devolucaoId).n
}

/** Devolução com itens, chave da remessa e cadastro do artesão, para montar a NF-e 5918. */
function obterDevolucaoParaNfe(devolucaoId) {
  const devolucao = db.prepare('SELECT * FROM devolucoes_artesao WHERE id = ? AND deleted_at IS NULL').get(devolucaoId)
  if (!devolucao) throw new Error('Devolução não encontrada.')
  const remessa = db
    .prepare('SELECT chave, numero, data_emissao FROM notas_entrada WHERE id = ?')
    .get(devolucao.nota_entrada_id)
  const artesao = devolucao.artesao_id ? db.prepare('SELECT * FROM artesoes WHERE id = ?').get(devolucao.artesao_id) : null
  const itens = db.prepare(`
    SELECT di.produto_id, di.quantidade, di.valor_unitario,
           i.codigo, i.descricao, i.ncm, i.cest, i.unidade,
           p.nome as produto_nome, p.codigo_barras, p.origem
    FROM devolucoes_artesao_itens di
    JOIN notas_entrada_itens i ON i.id = di.nota_item_id
    LEFT JOIN produtos p ON p.id = di.produto_id
    WHERE di.devolucao_id = ?
    ORDER BY di.id
  `).all(devolucaoId)
  return { devolucao, itens, chaveRemessa: remessa?.chave, remessa, artesao }
}

/** Status da devolução acompanha a NF-e: 'nf_emitida' trava o cancelamento da devolução. */
function definirStatusDevolucao(devolucaoId, status) {
  db.prepare('UPDATE devolucoes_artesao SET status = ? WHERE id = ?').run(status, devolucaoId)
}

/** Lista as vendas com a situação da NFC-e (a última tentativa de cada uma). */
function listarNotasFiscais({ dataInicio, dataFim } = {}) {
  const filtros = []
  const params = []
  if (dataInicio) {
    filtros.push('date(n.created_at) >= date(?)')
    params.push(dataInicio)
  }
  if (dataFim) {
    filtros.push('date(n.created_at) <= date(?)')
    params.push(dataFim)
  }
  const where = filtros.length ? `AND ${filtros.join(' AND ')}` : ''
  return db.prepare(`
    SELECT n.id, n.venda_id, n.devolucao_id, n.modelo, n.ref, n.ambiente, n.status, n.numero, n.serie, n.chave,
           n.mensagem, n.valor_total, n.caminho_danfe, n.cancelada_em, n.created_at, n.updated_at,
           v.data as venda_data, v.deleted_at as venda_excluida_em, d.deleted_at as devolucao_excluida_em,
           d.tipo as devolucao_tipo, d.cfop as devolucao_cfop,
           a.razao_social as artesao_razao_social, a.nome_fantasia as artesao_nome_fantasia, a.nome as artesao_nome,
           n.devolucao_cliente_id, dc.venda_id as devolucao_cliente_venda_id, dc.cliente_nome,
           dc.deleted_at as devolucao_cliente_excluida_em,
           (SELECT COUNT(*) FROM notas_fiscais t
              WHERE t.venda_id IS n.venda_id AND t.devolucao_id IS n.devolucao_id
                AND t.devolucao_cliente_id IS n.devolucao_cliente_id) as tentativas
    FROM notas_fiscais n
    LEFT JOIN vendas v ON v.id = n.venda_id
    LEFT JOIN devolucoes_artesao d ON d.id = n.devolucao_id
    LEFT JOIN artesoes a ON a.id = d.artesao_id
    LEFT JOIN devolucoes_cliente dc ON dc.id = n.devolucao_cliente_id
    WHERE n.id = (SELECT MAX(t.id) FROM notas_fiscais t
                    WHERE t.venda_id IS n.venda_id AND t.devolucao_id IS n.devolucao_id
                      AND t.devolucao_cliente_id IS n.devolucao_cliente_id) ${where}
    ORDER BY n.created_at DESC, n.id DESC
  `).all(...params)
}

/** Status em que o número foi de fato usado por uma nota na SEFAZ. */
const STATUS_NUMERO_USADO = ['autorizado', 'cancelado', 'denegado']

/**
 * Números pulados na sequência de cada modelo/série do ambiente: entre o menor e o maior número usado,
 * os que não têm nota autorizada/cancelada/denegada nem foram inutilizados. Agrupa em faixas.
 */
function listarBuracosNumeracao(ambiente) {
  const usados = db.prepare(`
    SELECT modelo, serie, CAST(numero AS INTEGER) as numero FROM notas_fiscais
    WHERE ambiente = ? AND numero IS NOT NULL AND serie IS NOT NULL
      AND status IN (${STATUS_NUMERO_USADO.map(() => '?').join(',')})
  `).all(String(ambiente), ...STATUS_NUMERO_USADO)
  const inutilizadas = db.prepare('SELECT * FROM inutilizacoes WHERE ambiente = ?').all(String(ambiente))
  const grupos = new Map()
  for (const u of usados) {
    const chave = `${u.modelo}|${u.serie}`
    if (!grupos.has(chave)) grupos.set(chave, new Set())
    grupos.get(chave).add(u.numero)
  }
  const faixas = []
  for (const [chave, numeros] of grupos) {
    const [modelo, serie] = chave.split('|')
    const lista = [...numeros].sort((a, b) => a - b)
    const pulados = (n) =>
      !numeros.has(n) &&
      !inutilizadas.some((i) => i.modelo === modelo && i.serie === serie && n >= i.numero_inicial && n <= i.numero_final)
    let inicio = null
    for (let n = lista[0]; n <= lista[lista.length - 1] + 1; n += 1) {
      if (n <= lista[lista.length - 1] && pulados(n)) {
        if (inicio == null) inicio = n
      } else if (inicio != null) {
        faixas.push({ modelo, serie, numero_inicial: inicio, numero_final: n - 1 })
        inicio = null
      }
    }
  }
  return faixas
}

function registrarInutilizacao(dados) {
  db.prepare(`
    INSERT INTO inutilizacoes (modelo, serie, numero_inicial, numero_final, ambiente, justificativa, protocolo, caminho_xml)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    dados.modelo,
    String(dados.serie),
    dados.numero_inicial,
    dados.numero_final,
    String(dados.ambiente),
    dados.justificativa || null,
    dados.protocolo || null,
    dados.caminho_xml || null,
  )
}

function listarInutilizacoes() {
  return db.prepare('SELECT * FROM inutilizacoes ORDER BY id DESC').all()
}

/** 'DD/MM/AAAA' ou 'AAAA-MM-DD' → 'AAAA-MM-DD'. */
function dataIbptIso(texto) {
  const s = String(texto || '').trim()
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return br ? `${br[3]}-${br[2]}-${br[1]}` : s.slice(0, 10)
}

/**
 * Importa o CSV do IBPT (De Olho no Imposto), separado por ';':
 * codigo;ex;tipo;descricao;nacionalfederal;importadosfederal;estadual;municipal;vigenciainicio;vigenciafim;chave;versao;fonte
 * Só as linhas de tipo 0 (NCM). Substitui a tabela inteira.
 */
function importarTabelaIbpt(conteudo) {
  const linhas = String(conteudo || '').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  if (linhas.length < 2) throw new Error('Arquivo do IBPT vazio.')
  const cabecalho = linhas[0].toLowerCase().split(';').map((c) => c.trim())
  const col = (nome) => cabecalho.indexOf(nome)
  const idx = {
    codigo: col('codigo'),
    ex: col('ex'),
    tipo: col('tipo'),
    nacional: col('nacionalfederal'),
    importados: col('importadosfederal'),
    estadual: col('estadual'),
    municipal: col('municipal'),
    fim: col('vigenciafim'),
    versao: col('versao'),
    fonte: col('fonte'),
  }
  if (idx.codigo < 0 || idx.nacional < 0 || idx.estadual < 0) {
    throw new Error('Este arquivo não parece ser a tabela do IBPT (faltam as colunas codigo/nacionalfederal/estadual).')
  }
  const numero = (v) => Number(String(v ?? '').replace(',', '.')) || 0
  const inserir = db.prepare(`
    INSERT OR REPLACE INTO ibpt (ncm, ex, nacional_federal, importados_federal, estadual, municipal, vigencia_fim, versao, fonte)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  let total = 0
  let vigencia = null
  let versao = null
  db.transaction(() => {
    db.prepare('DELETE FROM ibpt').run()
    for (const linha of linhas.slice(1)) {
      const c = linha.split(';')
      if (idx.tipo >= 0 && String(c[idx.tipo]).trim() !== '0') continue
      const ncm = String(c[idx.codigo] || '').replace(/\D/g, '')
      if (ncm.length !== 8) continue
      vigencia = idx.fim >= 0 ? dataIbptIso(c[idx.fim]) : null
      versao = idx.versao >= 0 ? String(c[idx.versao] || '').trim() : null
      inserir.run(
        ncm,
        idx.ex >= 0 ? String(c[idx.ex] || '').trim() : '',
        numero(c[idx.nacional]),
        idx.importados >= 0 ? numero(c[idx.importados]) : numero(c[idx.nacional]),
        numero(c[idx.estadual]),
        idx.municipal >= 0 ? numero(c[idx.municipal]) : 0,
        vigencia,
        versao,
        idx.fonte >= 0 ? String(c[idx.fonte] || '').trim() : 'IBPT',
      )
      total += 1
    }
  })()
  if (total === 0) throw new Error('Nenhum NCM encontrado no arquivo.')
  return { total, vigencia_fim: vigencia, versao }
}

function situacaoTabelaIbpt() {
  return db.prepare('SELECT COUNT(*) as total, MAX(vigencia_fim) as vigencia_fim, MAX(versao) as versao FROM ibpt').get()
}

/** Alíquotas do IBPT para os NCMs pedidos (sem exceção tarifária). */
function aliquotasIbpt(ncms) {
  const lista = [...new Set((ncms || []).map((n) => String(n || '').replace(/\D/g, '')).filter((n) => n.length === 8))]
  if (lista.length === 0) return {}
  const rows = db
    .prepare(`SELECT * FROM ibpt WHERE ex = '' AND ncm IN (${lista.map(() => '?').join(',')})`)
    .all(...lista)
  return Object.fromEntries(rows.map((r) => [r.ncm, r]))
}

/**
 * Cupons de venda que ficaram sem resposta (sem internet, Focus fora) nos últimos dias, para reenviar sozinho.
 * Ignora os que mudaram há menos de 2 minutos (podem estar sendo enviados agora).
 */
function listarNfcePendentesReenvio(dias = 7) {
  return db.prepare(`
    SELECT n.id, n.venda_id, n.status FROM notas_fiscais n
    JOIN vendas v ON v.id = n.venda_id AND v.deleted_at IS NULL
    WHERE n.modelo = '65'
      AND n.id = (SELECT MAX(t.id) FROM notas_fiscais t WHERE t.venda_id = n.venda_id)
      AND n.status IN ('erro_conexao', 'enviando', 'processando_autorizacao')
      AND datetime(n.updated_at) <= datetime('now', 'localtime', '-2 minutes')
      AND datetime(n.created_at) >= datetime('now', 'localtime', ?)
    ORDER BY n.id
  `).all(`-${Number(dias) || 7} days`)
}

/** Vendas com cupom pendente ou com erro (aviso do Dashboard). */
function contarCuponsPendentes() {
  return db.prepare(`
    SELECT COUNT(*) as n FROM notas_fiscais n
    JOIN vendas v ON v.id = n.venda_id AND v.deleted_at IS NULL
    WHERE n.modelo = '65'
      AND n.id = (SELECT MAX(t.id) FROM notas_fiscais t WHERE t.venda_id = n.venda_id)
      AND n.status IN ('erro_conexao', 'enviando', 'processando_autorizacao', 'erro_autorizacao', 'erro_validacao')
  `).get().n
}

/** CEST mais usado entre os produtos com o mesmo NCM (sugestão no cadastro). */
function sugerirCest(ncm) {
  const digitos = String(ncm ?? '').replace(/\D/g, '')
  if (digitos.length !== 8) return null
  return (
    db.prepare(`
      SELECT cest, COUNT(*) as total FROM produtos
      WHERE ncm = ? AND cest IS NOT NULL AND length(cest) = 7 AND deleted_at IS NULL
      GROUP BY cest ORDER BY total DESC LIMIT 1
    `).get(digitos) || null
  )
}

/** Vendas do período com a última tentativa de NFC-e de cada uma (ou nenhuma). */
function listarVendasComCupom({ dataInicio, dataFim } = {}) {
  return db.prepare(`
    SELECT v.id, v.data, v.valor_total, v.forma_pagamento,
           (SELECT GROUP_CONCAT(p.nome || ' x' || vi.quantidade, ', ')
              FROM vendas_itens vi LEFT JOIN produtos p ON p.id = vi.produto_id
              WHERE vi.venda_id = v.id AND vi.deleted_at IS NULL) as itens_resumo,
           (SELECT GROUP_CONCAT(DISTINCT vp.forma_pagamento)
              FROM vendas_pagamentos vp WHERE vp.venda_id = v.id AND vp.deleted_at IS NULL) as formas_pagamento,
           n.id as nota_id, n.status as nota_status, n.numero as nota_numero, n.serie as nota_serie,
           n.mensagem as nota_mensagem, n.ambiente as nota_ambiente, n.caminho_danfe as nota_caminho_danfe,
           n.autorizada_em as nota_autorizada_em, n.cancelada_em as nota_cancelada_em
    FROM vendas v
    LEFT JOIN notas_fiscais n ON n.id = (SELECT MAX(t.id) FROM notas_fiscais t WHERE t.venda_id = v.id)
    WHERE v.deleted_at IS NULL
      AND date(v.data) >= date(?) AND date(v.data) <= date(?)
    ORDER BY v.data DESC, v.id DESC
  `).all(dataInicio, dataFim)
}

/**
 * Produtos das vendas que impedem a emissão do cupom: sem NCM, ou com ICMS-ST sem CEST.
 * Inclui produtos já excluídos, que não aparecem mais no cadastro.
 */
function pendenciasFiscaisDasVendas(vendaIds) {
  const ids = [...new Set((vendaIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]
  if (ids.length === 0) return []
  const linhas = db.prepare(`
    SELECT DISTINCT p.id, p.nome, p.variacao, p.ncm, p.cest, p.tipo_posse, p.icms_st, p.deleted_at,
           a.nome as artesao_nome
    FROM vendas_itens vi
    JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE vi.venda_id IN (${ids.map(() => '?').join(',')}) AND vi.deleted_at IS NULL
    ORDER BY p.nome
  `).all(...ids)
  const digitos = (v) => String(v ?? '').replace(/\D/g, '')
  return linhas
    .map((p) => ({
      ...p,
      precisa_ncm: digitos(p.ncm).length !== 8,
      precisa_cest: p.tipo_posse === 'proprio' && Boolean(p.icms_st) && digitos(p.cest).length !== 7,
    }))
    .filter((p) => p.precisa_ncm || p.precisa_cest)
}

/** Grava NCM/CEST de um produto, mesmo excluído (para emitir cupom de vendas antigas). */
function definirFiscalProduto(produtoId, { ncm, cest = null } = {}) {
  const ncmDigitos = String(ncm ?? '').replace(/\D/g, '')
  if (ncmDigitos.length !== 8) throw new Error('O NCM precisa ter 8 números.')
  const cestDigitos = String(cest ?? '').replace(/\D/g, '')
  if (cestDigitos && cestDigitos.length !== 7) throw new Error('O CEST precisa ter 7 números.')
  const r = db
    .prepare(`UPDATE produtos SET ncm = ?, cest = COALESCE(?, cest), sync_status = 'pending' WHERE id = ?`)
    .run(ncmDigitos, cestDigitos || null, Number(produtoId))
  if (r.changes === 0) throw new Error('Produto não encontrado.')
  return { ok: true }
}

/** Venda com itens (inclusive de produtos excluídos), pagamentos e o último cupom. */
function detalharVenda(vendaId) {
  const venda = db.prepare('SELECT * FROM vendas WHERE id = ? AND deleted_at IS NULL').get(vendaId)
  if (!venda) throw new Error('Venda não encontrada.')
  const itens = db.prepare(`
    SELECT vi.produto_id, vi.quantidade, vi.preco_unitario, p.nome, p.variacao, p.codigo_barras, p.ncm,
           p.deleted_at as produto_excluido_em, a.nome as artesao_nome
    FROM vendas_itens vi
    LEFT JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE vi.venda_id = ? AND vi.deleted_at IS NULL
    ORDER BY vi.id ASC
  `).all(vendaId)
  const pagamentos = db.prepare(`
    SELECT forma_pagamento, valor FROM vendas_pagamentos
    WHERE venda_id = ? AND deleted_at IS NULL ORDER BY id ASC
  `).all(vendaId)
  return { venda, itens, pagamentos, nota: ultimaNotaFiscalDaVenda(vendaId) || null }
}

/** Impede alterar ou excluir uma venda que já tem cupom fiscal autorizado. */
function exigirVendaSemNfceAutorizada(vendaId, acao) {
  const nota = ultimaNotaFiscalDaVenda(vendaId)
  if (nota && nota.status === 'autorizado') {
    throw new Error(`Esta venda tem cupom fiscal autorizado (nº ${nota.numero}). Cancele o cupom em Vendas antes de ${acao}.`)
  }
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
  emitir_nfce: '0',
  prazo_cancelamento_nfce: '30',
  limite_identificacao_nfce: '10000',
  usar_ibpt: '0',
  focus_token_homologacao: '',
  focus_token_producao: '',
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
    emitir_nfce: data?.emitir_nfce === '1' || data?.emitir_nfce === true ? '1' : '0',
    prazo_cancelamento_nfce: inteiroPositivoConfig(data?.prazo_cancelamento_nfce || '30', 'o prazo de cancelamento do cupom'),
    limite_identificacao_nfce: inteiroPositivoConfig(
      data?.limite_identificacao_nfce || '10000',
      'o valor a partir do qual o cupom exige CPF',
    ),
    usar_ibpt: data?.usar_ibpt === '1' || data?.usar_ibpt === true ? '1' : '0',
    focus_token_homologacao: texto('focus_token_homologacao'),
    focus_token_producao: texto('focus_token_producao'),
  }
  if (registro.emitir_nfce === '1') {
    if (cnpj.length !== 14) throw new Error('Para emitir NFC-e, informe o CNPJ da loja.')
    const tokenAmbiente = ambiente === '1' ? registro.focus_token_producao : registro.focus_token_homologacao
    if (!tokenAmbiente) {
      throw new Error(`Para emitir NFC-e, informe o token de ${ambiente === '1' ? 'produção' : 'homologação'} da Focus NFe.`)
    }
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
  atualizarFiscalEmLote,
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
  listarVinculosNotaEntrada,
  registrarDevolucaoArtesao,
  listarDevolucoesArtesao,
  cancelarDevolucaoArtesao,
  obterVendaParaNfce,
  criarNotaFiscal,
  atualizarNotaFiscal,
  obterNotaFiscal,
  ultimaNotaFiscalDaVenda,
  contarTentativasNotaFiscal,
  listarNotasFiscais,
  listarVendasComCupom,
  sugerirCest,
  pendenciasFiscaisDasVendas,
  definirFiscalProduto,
  detalharVenda,
  listarBuracosNumeracao,
  registrarInutilizacao,
  listarInutilizacoes,
  importarTabelaIbpt,
  situacaoTabelaIbpt,
  aliquotasIbpt,
  listarNfcePendentesReenvio,
  contarCuponsPendentes,
  calcularDevolucaoSimbolica,
  registrarDevolucaoSimbolica,
  obterVendaParaDevolucaoCliente,
  registrarDevolucaoCliente,
  listarNotasParaXml,
  listarXmlsEntrada,
  resumoFiscalPeriodo,
  obterDevolucaoClienteParaNfe,
  ultimaNotaFiscalDaDevolucaoCliente,
  contarTentativasNotaFiscalDevolucaoCliente,
  ultimaNotaFiscalDaDevolucao,
  contarTentativasNotaFiscalDevolucao,
  obterDevolucaoParaNfe,
  definirStatusDevolucao,
}