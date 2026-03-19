// Seed de 100 produtos rodando no runtime do Electron
// Rode com: npm run seed:produtos

const path = require('path')
const { app } = require('electron')

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

function randomPrice(min, max) {
  const valor = Math.random() * (max - min) + min
  return Math.round(valor * 100) / 100
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function gerarNomeProduto() {
  const categorias = [
    'Vaso', 'Escultura', 'Quadro', 'Porta-chaves', 'Caixa', 'Pulseira', 'Colar',
    'Caneca', 'Tapete', 'Almofada', 'Caderno', 'Agenda', 'Bolsa', 'Carteira',
    'Sabonete', 'Vela', 'Enfeite', 'Painel', 'Centro de Mesa', 'Móbile',
  ]

  const materiais = [
    'de Barro', 'de Cerâmica', 'de Madeira', 'em Macramê', 'em Crochê',
    'de Vidro', 'de Tecido', 'em Resina', 'em MDF', 'em Bambu', 'Artesanal',
  ]

  const temas = [
    'Floral', 'Minimalista', 'Rústico', 'Colorido', 'Boho', 'Geométrico',
    'Vintage', 'Moderno', 'Praia', 'Folhagens', 'Café', 'Corações',
  ]

  const cat = randomChoice(categorias)
  const mat = randomChoice(materiais)

  if (Math.random() < 0.5) {
    const tema = randomChoice(temas)
    return `${cat} ${mat} ${tema}`
  }

  return `${cat} ${mat}`
}

function garantirArtesaoPadrao() {
  try {
    const lista = db.listarArtesoes()
    if (lista && lista.length > 0) {
      logInfo(`Encontrados ${lista.length} artesãos. Usando o primeiro (id=${lista[0].id}).`)
      return lista[0].id
    }
  } catch (err) {
    logError('Erro ao listar artesãos', err)
  }

  logInfo('Nenhum artesão encontrado. Criando artesão padrão "Artesão Seed"...')
  const novo = db.criarArtesao({
    nome: 'Artesão Seed',
    telefone_whats: null,
  })
  logInfo(`Artesão criado com id=${novo.id}.`)
  return novo.id
}

async function executarSeed() {
  logInfo('Iniciando seed de 100 produtos (Electron)...')

  const artesaoId = garantirArtesaoPadrao()
  const quantidade = 100
  let criados = 0

  for (let i = 0; i < quantidade; i++) {
    const nome = gerarNomeProduto()
    const precoCusto = randomPrice(5, 50)
    const margem = randomPrice(1.2, 2.5)
    const precoVenda = Math.round(precoCusto * margem * 100) / 100
    const estoque = randomInt(1, 50)

    try {
      const produto = db.criarProduto({
        nome,
        variacao: null,
        preco_custo: precoCusto,
        preco_venda: precoVenda,
        estoque,
        artesao_id: artesaoId,
      })
      criados++
      logInfo(
        `Produto #${criados} criado: ` +
          `${produto.nome} | custo=R$ ${precoCusto.toFixed(2)} | ` +
          `venda=R$ ${precoVenda.toFixed(2)} | estoque=${estoque} | ` +
          `código=${produto.codigo_barras}`,
      )
    } catch (err) {
      logError(`Falha ao criar produto ${i + 1}`, err)
    }
  }

  logInfo(`Seed concluído. Produtos criados com sucesso: ${criados}/${quantidade}.`)
  app.exit(0)
}

app.whenReady().then(executarSeed).catch((err) => {
  logError('Erro inesperado ao executar seed de produtos', err)
  app.exit(1)
})

