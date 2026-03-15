const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { syncWithSupabase, iniciarSyncTimer } = require('./services/syncService')
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

  win.loadURL('http://localhost:5173')

  win.once('ready-to-show', () => {
    win.show()
  })
}

// Usuarios
ipcMain.handle('validar-login', (_, login, senha) => validarLogin(login, senha))
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
ipcMain.handle('listar-vendas-por-periodo', (_, dataInicio, dataFim) => listarVendasPorPeriodo(dataInicio, dataFim))
ipcMain.handle('excluir-venda', (_, id) => excluirVenda(id))

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
