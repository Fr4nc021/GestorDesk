const Database = require('better-sqlite3')
const path = require('path')

const dbPath = path.join(__dirname, '..', 'database.db')
const db = new Database(dbPath)

db.pragma('foreign_keys = ON')

/**
 * Gera dígito verificador EAN-13
 */
function calcularDigitoVerificadorEAN13(codigo12) {
  const pesos = [1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3]
  let soma = 0
  for (let i = 0; i < 12; i++) {
    soma += parseInt(codigo12[i]) * pesos[i]
  }
  const resto = soma % 10
  return resto === 0 ? 0 : 10 - resto
}

/**
 * Gera código de barras EAN-13 único para o produto
 */
function gerarCodigoBarras() {
  const base = Date.now().toString().slice(-11).padStart(12, '78900000000')
  const digito = calcularDigitoVerificadorEAN13(base)
  return base + digito
}

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS artesoes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      telefone_whats TEXT,
      synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
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
      FOREIGN KEY (artesao_id) REFERENCES artesoes(id)
    );

    CREATE TABLE IF NOT EXISTS vendas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      data TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      valor_total REAL NOT NULL DEFAULT 0,
      forma_pagamento TEXT NOT NULL CHECK(forma_pagamento IN ('dinheiro','credito','debito','pix')),
      synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vendas_itens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      venda_id INTEGER NOT NULL,
      produto_id INTEGER NOT NULL,
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      synced INTEGER DEFAULT 0,
      FOREIGN KEY (venda_id) REFERENCES vendas(id),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

     CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      produto_id INTEGER NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),
      quantidade INTEGER NOT NULL,
      origem TEXT DEFAULT 'admin',
      data TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );

    CREATE TABLE IF NOT EXISTS movimentacoes_caixa (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada','saida')),
      valor REAL NOT NULL,
      forma_pagamento TEXT NOT NULL CHECK(forma_pagamento IN ('dinheiro','credito','debito','pix')),
      descricao TEXT,
      data TEXT NOT NULL DEFAULT (datetime('now')),
      synced INTEGER DEFAULT 0
    );
  `)
}

initDatabase()

try {
  db.exec(`ALTER TABLE movimentacoes_estoque ADD COLUMN origem TEXT DEFAULT 'admin'`)
} catch (_) {
  // coluna origem já existe
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
    LEFT JOIN produtos p ON p.artesao_id = a.id
    GROUP BY a.id
    ORDER BY a.nome
  `)
  return stmt.all()
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
    ORDER BY p.nome
  `)
  return stmt.all()
}

function atualizarProduto(id, { nome, variacao = null, preco_custo = 0, preco_venda = 0, estoque = 0, artesao_id }) {
  const stmt = db.prepare(`
    UPDATE produtos SET nome = ?, variacao = ?, preco_custo = ?, preco_venda = ?, estoque = ?, artesao_id = ?
    WHERE id = ?
  `)
  stmt.run(nome, variacao, preco_custo, preco_venda, estoque, artesao_id, id)
  return { id }
}

function excluirProduto(id) {
  const stmt = db.prepare('DELETE FROM produtos WHERE id = ?')
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

  function listarVendasPorData(dataISO) {
    const vendas = db.prepare(`
      SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
             (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
      FROM vendas v
      LEFT JOIN vendas_itens vi ON vi.venda_id = v.id
      LEFT JOIN produtos p ON p.id = vi.produto_id
      WHERE date(v.data) = date(?)
      GROUP BY v.id
      ORDER BY v.data DESC
    `).all(dataISO)
    return vendas
  }

// --- Vendas ---

function criarVenda({ itens, forma_pagamento, valor_total: valorTotalInformado }) {
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
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem)
    VALUES (?, 'saida', ?, 'pdv')
  `)

  const criarVendaComItens = db.transaction(() => {
    const result = insertVenda.run(valor_total, forma_pagamento)
    const vendaId = result.lastInsertRowid

    for (const item of itens) {
      insertItem.run(vendaId, item.produto_id, item.quantidade, item.preco_unitario)
      updateEstoque.run(item.quantidade, item.produto_id)
      insertMovEstoque.run(item.produto_id, item.quantidade)
    }

    return vendaId
  })

  const vendaId = criarVendaComItens()
  return { id: vendaId, valor_total, forma_pagamento }
}

function listarVendas() {
  const vendas = db.prepare(`
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    GROUP BY v.id
    ORDER BY v.data DESC
  `).all()
  return vendas
}

function listarVendasDoDia() {
  const vendas = db.prepare(`
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE date(v.data) = date('now', 'localtime')
    GROUP BY v.id
    ORDER BY v.data ASC
  `).all()
  return vendas
}

function listarVendasPorData(dataISO) {
  const vendas = db.prepare(`
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE date(v.data) = date(?)
    GROUP BY v.id
    ORDER BY v.data DESC
  `).all(dataISO)
  return vendas
}

function listarVendasPorPeriodo(dataInicio, dataFim) {
  const vendas = db.prepare(`
    SELECT v.*, GROUP_CONCAT(p.nome || ' x' || vi.quantidade) as itens_resumo,
           (SELECT SUM(quantidade) FROM vendas_itens WHERE venda_id = v.id) as qtd_itens
    FROM vendas v
    LEFT JOIN vendas_itens vi ON vi.venda_id = v.id
    LEFT JOIN produtos p ON p.id = vi.produto_id
    WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
    GROUP BY v.id
    ORDER BY v.data DESC
  `).all(dataInicio, dataFim)
  return vendas
}

function excluirVenda(id) {
  const updateEstoque = db.prepare(`
    UPDATE produtos SET estoque = estoque + ? WHERE id = ?
  `)
  const insertMovEstoque = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem)
    VALUES (?, 'entrada', ?, 'estorno')
  `)
  const deleteItens = db.prepare('DELETE FROM vendas_itens WHERE venda_id = ?')
  const deleteVenda = db.prepare('DELETE FROM vendas WHERE id = ?')
  const getItens = db.prepare('SELECT produto_id, quantidade FROM vendas_itens WHERE venda_id = ?')

  db.transaction(() => {
    const itens = getItens.all(id)
    for (const item of itens) {
      updateEstoque.run(item.quantidade, item.produto_id)
      insertMovEstoque.run(item.produto_id, item.quantidade)
    }
    deleteItens.run(id)
    deleteVenda.run(id)
  })()
  return { id }
}

// --- Caixa ---

function criarMovimentacaoCaixa({ tipo, valor, forma_pagamento, descricao = null }) {
  const stmt = db.prepare(`
    INSERT INTO movimentacoes_caixa (tipo, valor, forma_pagamento, descricao) VALUES (?, ?, ?, ?)
  `)
  const result = stmt.run(tipo, valor, forma_pagamento, descricao)
  return { id: result.lastInsertRowid, tipo, valor, forma_pagamento, descricao }
}

// --- Estoque ---
// Adicionar estoque e registrar movimentação
function adicionarEstoque(produto_id, quantidade, origem = 'admin') {
  const insertMov = db.prepare(`
    INSERT INTO movimentacoes_estoque (produto_id, tipo, quantidade, origem)
    VALUES (?, 'entrada', ?, ?)
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

// Listar histórico recente
function listarMovimentacoesRecentes(limite = 20) {
  return db.prepare(`
    SELECT m.*, p.nome as produto_nome, p.codigo_barras
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id
    ORDER BY m.data DESC
    LIMIT ?
  `).all(limite)
}

// Produtos mais vendidos (maior → menor)
function listarProdutosMaisVendidos() {
  return db.prepare(`
    SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, SUM(vi.quantidade) as total_vendido
    FROM vendas_itens vi
    JOIN produtos p ON p.id = vi.produto_id
    GROUP BY vi.produto_id
    ORDER BY total_vendido DESC
  `).all()
}

// Movimentações por período (data em formato YYYY-MM-DD)
function listarMovimentacoesPorPeriodo(dataInicio, dataFim) {
  return db.prepare(`
    SELECT m.*, p.nome as produto_nome, p.codigo_barras
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id
    WHERE date(m.data) >= date(?) AND date(m.data) <= date(?)
    ORDER BY m.data DESC
  `).all(dataInicio, dataFim)
}

// Produtos mais vendidos por período (maior → menor)
function listarProdutosMaisVendidosPorPeriodo(dataInicio, dataFim) {
  return db.prepare(`
    SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, p.artesao_id, a.nome as artesao_nome, SUM(vi.quantidade) as total_vendido
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
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
        COALESCE((SELECT SUM(vi.quantidade) FROM vendas_itens vi JOIN vendas v2 ON v2.id = vi.venda_id WHERE date(v2.data) >= date(?) AND date(v2.data) <= date(?)), 0) as qtd_itens
      FROM vendas v
      WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
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
    JOIN vendas v ON v.id = vi.venda_id
    JOIN produtos p ON p.id = vi.produto_id
    WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
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
          (SELECT COALESCE(SUM(vi.quantidade), 0) FROM vendas_itens vi WHERE vi.venda_id = v.id)
        ), 0) as qtd_itens
      FROM vendas v
      WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
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
    JOIN vendas v ON v.id = vi.venda_id
    JOIN produtos p ON p.id = vi.produto_id
    WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
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
      COALESCE((SELECT SUM(vi.quantidade) FROM vendas_itens vi JOIN vendas v2 ON v2.id = vi.venda_id WHERE date(v2.data) = date('now', 'localtime')), 0) as qtd_itens
    FROM vendas v
    WHERE date(v.data) = date('now', 'localtime')
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
      COALESCE(SUM((vi.preco_unitario - p.preco_custo) * vi.quantidade), 0) as lucro,
      COALESCE(SUM(vi.preco_unitario * vi.quantidade), 0) as total_vendas,
      COALESCE(SUM(p.preco_custo * vi.quantidade), 0) as total_custo,
      COALESCE(SUM(vi.quantidade), 0) as qtd_itens
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    JOIN produtos p ON p.id = vi.produto_id
    WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
  `).get(dataInicio, dataFim)
  return {
    lucro: row.lucro ?? 0,
    totalVendas: row.total_vendas ?? 0,
    totalCusto: row.total_custo ?? 0,
    qtdItens: row.qtd_itens ?? 0,
  }
}

/**
 * Produtos mais vendidos no período, opcionalmente filtrado por artesão.
 * @param {string} dataInicio - YYYY-MM-DD
 * @param {string} dataFim - YYYY-MM-DD
 * @param {number|null} artesaoId - ID do artesão ou null para ranking geral
 * @returns {Array}
 */
function listarProdutosMaisVendidosPorPeriodoEArtesao(dataInicio, dataFim, artesaoId = null) {
  if (artesaoId == null) {
    return db.prepare(`
      SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, p.artesao_id, a.nome as artesao_nome, SUM(vi.quantidade) as total_vendido
      FROM vendas_itens vi
      JOIN vendas v ON v.id = vi.venda_id
      JOIN produtos p ON p.id = vi.produto_id
      LEFT JOIN artesoes a ON a.id = p.artesao_id
      WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
      GROUP BY vi.produto_id
      ORDER BY total_vendido DESC
    `).all(dataInicio, dataFim)
  }

  return db.prepare(`
    SELECT p.id, p.nome, p.codigo_barras, p.estoque, p.variacao, p.artesao_id, a.nome as artesao_nome, SUM(vi.quantidade) as total_vendido
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
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
        COALESCE(SUM(vi.preco_unitario * vi.quantidade), 0) as total_vendas,
        COALESCE(SUM(p.preco_custo * vi.quantidade), 0) as total_custo
      FROM vendas_itens vi
      JOIN vendas v ON v.id = vi.venda_id
      JOIN produtos p ON p.id = vi.produto_id
      WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
    `).get(dataInicio, dataFim)
    const produtos = db.prepare(`
      SELECT
        p.id, p.nome, p.variacao, a.nome as artesao_nome, p.preco_custo,
        SUM(vi.quantidade) as total_vendido,
        SUM(p.preco_custo * vi.quantidade) as total_custo_produto
      FROM vendas_itens vi
      JOIN vendas v ON v.id = vi.venda_id
      JOIN produtos p ON p.id = vi.produto_id
      LEFT JOIN artesoes a ON a.id = p.artesao_id
      WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
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
      COALESCE(SUM(vi.preco_unitario * vi.quantidade), 0) as total_vendas,
      COALESCE(SUM(p.preco_custo * vi.quantidade), 0) as total_custo
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    JOIN produtos p ON p.id = vi.produto_id
    WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
      AND p.artesao_id = ?
  `).get(dataInicio, dataFim, artesaoId)
  const produtos = db.prepare(`
    SELECT
      p.id, p.nome, p.variacao, a.nome as artesao_nome, p.preco_custo,
      SUM(vi.quantidade) as total_vendido,
      SUM(p.preco_custo * vi.quantidade) as total_custo_produto
    FROM vendas_itens vi
    JOIN vendas v ON v.id = vi.venda_id
    JOIN produtos p ON p.id = vi.produto_id
    LEFT JOIN artesoes a ON a.id = p.artesao_id
    WHERE date(v.data) >= date(?) AND date(v.data) <= date(?)
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

// --- Exportações ---

module.exports = {
  db,
  criarArtesao,
  listarArtesoes,
  criarProduto,
  listarProdutos,
  atualizarProduto,
  excluirProduto,
  buscarProdutoPorCodigo,
  criarVenda,
  listarVendas,
  listarVendasDoDia,
  listarVendasPorData,
  listarVendasPorPeriodo,
  excluirVenda,
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
}