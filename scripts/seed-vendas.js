// Script para cadastrar 50 vendas aleatórias usando o backend do app
// Rode com: npm run seed:vendas

import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dbModulePath = path.join(__dirname, '..', 'electron', 'database.js')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = require(dbModulePath)

function logInfo(msg) {
  console.log(`[INFO] ${msg}`)
}

function logError(msg, err) {
  console.error(`[ERROR] ${msg}`)
  if (err) console.error(err)
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

const FORMAS_PAGAMENTO = ['dinheiro', 'credito', 'debito', 'pix']

function carregarProdutosVendaveis() {
  const todos = db.listarProdutos()
  return todos.filter((p) => (p.estoque || 0) > 0)
}

function criarVendaAleatoria(idx, produtosDisponiveis) {
  // Clona estoques em memória para montar itens da venda sem estourar estoque
  const estoqueLocal = new Map()
  for (const p of produtosDisponiveis) {
    estoqueLocal.set(p.id, p.estoque)
  }

  const itens = []
  const qtdItens = randomInt(1, 5)

  for (let i = 0; i < qtdItens; i++) {
    const candidatos = produtosDisponiveis.filter((p) => (estoqueLocal.get(p.id) || 0) > 0)
    if (candidatos.length === 0) break

    const produto = randomChoice(candidatos)
    const estoqueAtual = estoqueLocal.get(produto.id) || 0
    if (estoqueAtual <= 0) continue

    const quantidade = randomInt(1, Math.min(5, estoqueAtual))
    estoqueLocal.set(produto.id, estoqueAtual - quantidade)

    const precoUnitario = produto.preco_venda || 0
    itens.push({
      produto_id: produto.id,
      quantidade,
      preco_unitario: precoUnitario,
      nome: produto.nome,
      variacao: produto.variacao,
    })
  }

  if (itens.length === 0) {
    logInfo(`Venda #${idx}: nenhum item com estoque suficiente, pulando...`)
    return null
  }

  const forma_pagamento = randomChoice(FORMAS_PAGAMENTO)
  const valor_total = itens.reduce(
    (acc, item) => acc + item.quantidade * item.preco_unitario,
    0,
  )

  const venda = db.criarVenda({
    itens: itens.map(({ produto_id, quantidade, preco_unitario }) => ({
      produto_id,
      quantidade,
      preco_unitario,
    })),
    forma_pagamento,
    valor_total,
  })

  logInfo(
    `Venda criada #${idx}: id=${venda.id}, forma=${forma_pagamento}, ` +
      `total=R$ ${valor_total.toFixed(2)} | itens=` +
      itens
        .map(
          (it) =>
            `${it.nome}${it.variacao ? ` (${it.variacao})` : ''} x${it.quantidade}` +
            ` @ R$ ${it.preco_unitario.toFixed(2)}`,
        )
        .join('; '),
  )

  return venda
}

async function main() {
  try {
    logInfo('Iniciando seed de 50 vendas aleatórias...')

    const produtosVendaveis = carregarProdutosVendaveis()
    if (produtosVendaveis.length === 0) {
      logInfo('Não há produtos com estoque > 0. Cadastre produtos/estoque antes de gerar vendas.')
      process.exit(0)
      return
    }

    const TOTAL_VENDAS = 50
    let criadas = 0

    for (let i = 1; i <= TOTAL_VENDAS; i++) {
      try {
        const venda = criarVendaAleatoria(i, produtosVendaveis)
        if (venda) criadas++
      } catch (err) {
        logError(`Erro ao criar venda #${i}`, err)
      }
    }

    logInfo(`Seed de vendas concluído. Vendas criadas com sucesso: ${criadas}/${TOTAL_VENDAS}.`)
    process.exit(0)
  } catch (err) {
    logError('Erro inesperado ao executar seed de vendas', err)
    process.exit(1)
  }
}

main()

