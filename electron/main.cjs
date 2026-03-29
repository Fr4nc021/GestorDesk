const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

const DEFAULT_ENV_CONTENT = [
  'SUPABASE_URL=https://jevbemunxafaauyfdikj.supabase.co',
  'SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpldmJlbXVueGFmYWF1eWZkaWtqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNzY4ODEsImV4cCI6MjA4ODg1Mjg4MX0.Jnf3Dyod6aVHdeb8O48IHgtVeK4oW0f99eLF9nu7vmc',
  'SUPABASE_AUTH_DOMAIN=gestordesk.local',
  '',
].join('\n')

function resolveGestorDeskEnvPath() {
  const appDataDir = process.env.APPDATA || app.getPath('appData')
  const configDir = path.join(appDataDir, 'gestordesk')
  const envPath = path.join(configDir, '.env')
  return { configDir, envPath }
}

function ensureEnvInAppData() {
  try {
    const { configDir, envPath } = resolveGestorDeskEnvPath()
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
      console.log(`[ENV] Pasta criada: ${configDir}`)
    }

    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, DEFAULT_ENV_CONTENT, { encoding: 'utf8', flag: 'wx' })
      console.log(`[ENV] Arquivo .env criado em: ${envPath}`)
    } else {
      console.log(`[ENV] Arquivo .env já existe em: ${envPath}`)
    }

    return envPath
  } catch (err) {
    console.error('[ENV] Falha ao garantir .env no AppData:', err?.message || err)
    return null
  }
}

// Em produção, não confie em .env dentro da pasta de instalação.
// Preferimos carregar do diretório de dados do usuário (Windows: AppData\Roaming\<productName>).
function loadEnv() {
  const fallbackPath = path.join(__dirname, '..', '.env')
  const appDataEnvPath = ensureEnvInAppData()
  try {
    if (appDataEnvPath && fs.existsSync(appDataEnvPath)) {
      require('dotenv').config({ path: appDataEnvPath })
      return
    }
  } catch (_) {
    // Se app.getPath falhar por qualquer motivo, usamos o fallback.
  }
  require('dotenv').config({ path: fallbackPath })
}

loadEnv()

// Banco sempre em userData (dev e instalado): atualizar o app nao troca esse arquivo.
// Sobrescreva com GESTORDESK_DB_PATH no ambiente se precisar de outro caminho.
{
  const userDataDir = app.getPath('userData')
  if (!process.env.GESTORDESK_DB_PATH) {
    process.env.GESTORDESK_DB_PATH = path.join(userDataDir, 'database.db')
  }
  if (!process.env.GESTORDESK_USER_DATA_DIR) {
    process.env.GESTORDESK_USER_DATA_DIR = userDataDir
  }
}

const { syncWithSupabase, iniciarSyncTimer } = require('./services/syncService')
const { setSupabaseAuthFromAppLogin } = require('./services/supabaseClient')
const {
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
} = require('./database')

// CLI: criar usuário e sair — node electron/main.cjs não funciona; use: npx electron . criar-usuario LOGIN SENHA
if (process.argv[2] === 'criar-usuario' && process.argv[3] && process.argv[4]) {
  const login = process.argv[3]
  const senha = process.argv[4]
  try {
    criarUsuario(login, senha)
    console.log('Usuário "%s" criado com sucesso.', login)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
  process.exit(0)
}

function createWindow() {
  const win = new BrowserWindow({
    width: 420,
    height: 550,
    show: false,
    backgroundColor: '#f0f0f0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (app.isPackaged) {
    // Em produção, carrega o index.html gerado pelo Vite
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    win.loadFile(indexPath)
  } else {
    // Em desenvolvimento, usa o servidor do Vite
    win.loadURL('http://localhost:5173')
  }

  win.once('ready-to-show', () => {
    win.show()
  })
}

// Usuarios
ipcMain.handle('validar-login', async (_, login, senha) => {
  const user = validarLogin(login, senha)
  if (user) {
    setSupabaseAuthFromAppLogin(login, senha)
    // Aguarda o sync terminar antes de liberar o app — assim variações e demais dados do Supabase
    // já estarão no banco local quando o usuário navegar para Produtos/Dashboard.
    await syncWithSupabase().catch(() => {})
  }
  return user
})
ipcMain.handle('criar-usuario', (_, login, senha) => criarUsuario(login, senha))
ipcMain.handle('login-success-resize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setSize(1200, 800)
    win.center()
  }
})
ipcMain.handle('login-show-resize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setSize(420, 550)
    win.center()
  }
})


// IPC Handlers
ipcMain.handle('criar-artesao', (_, data) => criarArtesao(data))
ipcMain.handle('listar-artesoes', () => listarArtesoes())
ipcMain.handle('atualizar-artesao', (_, id, data) => atualizarArtesao(id, data))
ipcMain.handle('excluir-artesao', (_, id) => excluirArtesao(id))

ipcMain.handle('criar-produto', (_, data) => criarProduto(data))
ipcMain.handle('listar-produtos', () => listarProdutos())
ipcMain.handle('atualizar-produto', (_, id, data) => atualizarProduto(id, data))
ipcMain.handle('excluir-produto', (_, id) => excluirProduto(id))
ipcMain.handle('buscar-produto-por-codigo', (_, codigo) => buscarProdutoPorCodigo(codigo))

ipcMain.handle('listar-tipos-variacao', () => listarTiposVariacao())
ipcMain.handle('criar-tipo-variacao', (_, data) => criarTipoVariacao(data))
ipcMain.handle('atualizar-tipo-variacao', (_, id, data) => atualizarTipoVariacao(id, data))
ipcMain.handle('excluir-tipo-variacao', (_, id) => excluirTipoVariacao(id))
ipcMain.handle('listar-valores-variacao', (_, tipoVariacaoId) => listarValoresVariacao(tipoVariacaoId))
ipcMain.handle('criar-valor-variacao', (_, data) => criarValorVariacao(data))
ipcMain.handle('atualizar-valor-variacao', (_, id, data) => atualizarValorVariacao(id, data))
ipcMain.handle('excluir-valor-variacao', (_, id) => excluirValorVariacao(id))
ipcMain.handle('listar-todos-valores-variacao', () => listarTodosValoresVariacao())

ipcMain.handle('criar-venda', (_, data) => criarVenda(data))
ipcMain.handle('listar-vendas', () => listarVendas())
ipcMain.handle('listar-vendas-do-dia', () => listarVendasDoDia())
ipcMain.handle('criar-movimentacao-caixa', (_, data) => criarMovimentacaoCaixa(data))

//caixa filtro por data
ipcMain.handle('listar-vendas-por-data', (_, data) => listarVendasPorData(data))
ipcMain.handle('listar-pagamentos-caixa-por-data', (_, data) => listarPagamentosCaixaPorData(data))
ipcMain.handle('listar-pagamentos-caixa-por-periodo', (_, dataInicio, dataFim) =>
  listarPagamentosCaixaPorPeriodo(dataInicio, dataFim),
)
ipcMain.handle('listar-pagamentos-caixa-por-periodo-e-produto', (_, dataInicio, dataFim, produtoId) =>
  listarPagamentosCaixaPorPeriodoEProduto(dataInicio, dataFim, produtoId),
)
ipcMain.handle('listar-vendas-por-periodo', (_, dataInicio, dataFim) => listarVendasPorPeriodo(dataInicio, dataFim))
ipcMain.handle('listar-vendas-por-periodo-e-artesao', (_, dataInicio, dataFim, artesaoId) =>
  listarVendasPorPeriodoEArtesao(dataInicio, dataFim, artesaoId ?? null),
)
ipcMain.handle('excluir-venda', (_, id) => excluirVenda(id))
ipcMain.handle('obter-venda-para-edicao', (_, id) => obterVendaParaEdicao(id))
ipcMain.handle('atualizar-venda', (_, id, data) => atualizarVenda(id, data))

ipcMain.handle('imprimir-etiquetas', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || !win.webContents) return { error: 'Janela não encontrada' }
  return win.webContents.print({
    silent: false,
    printBackground: true,
  })
})

ipcMain.handle('salvar-relatorio-pdf', async (event, pdfBase64, filename) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win, {
    defaultPath: filename,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (result.canceled) return { canceled: true }
  const buffer = Buffer.from(pdfBase64, 'base64')
  fs.writeFileSync(result.filePath, buffer)
  return { ok: true, path: result.filePath }
})

// Estoque
ipcMain.handle('adicionar-estoque', (_, produtoId, quantidade, origem) => 
  adicionarEstoque(produtoId, quantidade, origem))
ipcMain.handle('listar-movimentacoes-recentes', (_, limite) => 
  listarMovimentacoesRecentes(limite))
ipcMain.handle('listar-produtos-mais-vendidos', () => 
  listarProdutosMaisVendidos())
ipcMain.handle('listar-movimentacoes-por-periodo', (_, dataInicio, dataFim) => 
  listarMovimentacoesPorPeriodo(dataInicio, dataFim))
ipcMain.handle('listar-produtos-mais-vendidos-por-periodo', (_, dataInicio, dataFim) => 
  listarProdutosMaisVendidosPorPeriodo(dataInicio, dataFim))

// Relatórios
ipcMain.handle('obter-resumo-vendas-periodo', (_, dataInicio, dataFim, artesaoId) => 
  obterResumoVendasPeriodo(dataInicio, dataFim, artesaoId ?? null))
ipcMain.handle('obter-vendas-por-dia', (_, dataInicio, dataFim, artesaoId) => 
  obterVendasPorDia(dataInicio, dataFim, artesaoId ?? null))
ipcMain.handle('obter-total-vendas-hoje', () => obterTotalVendasHoje())
ipcMain.handle('obter-lucro-periodo', (_, dataInicio, dataFim) => 
  obterLucroPeriodo(dataInicio, dataFim))
ipcMain.handle('listar-produtos-mais-vendidos-por-periodo-e-artesao', (_, dataInicio, dataFim, artesaoId) => 
  listarProdutosMaisVendidosPorPeriodoEArtesao(dataInicio, dataFim, artesaoId ?? null))
ipcMain.handle('contar-produtos-por-artesao', (_, artesaoId) => 
  contarProdutosPorArtesao(artesaoId))
ipcMain.handle('obter-relatorio-custo-vendas-periodo', (_, dataInicio, dataFim, artesaoId) => 
  obterRelatorioCustoVendasPeriodo(dataInicio, dataFim, artesaoId ?? null))
ipcMain.handle('obter-totais-pagamentos-por-periodo', (_, dataInicio, dataFim) =>
  obterTotaisPagamentosPorPeriodo(dataInicio, dataFim))

// Sincronização manual disparada pela interface
ipcMain.handle('sync-agora', async () => {
  try {
    const resultado = await syncWithSupabase()
    return resultado
  } catch (err) {
    return { success: false, error: err?.message || String(err) }
  }
})

// Sincronização ao fechar: tenta enviar pendentes antes de encerrar
let syncOnQuitDone = false
app.on('before-quit', (event) => {
  if (syncOnQuitDone) return
  event.preventDefault()
  syncOnQuitDone = true
  syncWithSupabase().finally(() => app.quit())
})

app.whenReady().then(() => {
  createWindow()
  iniciarSyncTimer()
})
