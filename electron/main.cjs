const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const {
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
} = require('./database')

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadURL('http://localhost:5173')
}

// IPC Handlers
ipcMain.handle('criar-artesao', (_, data) => criarArtesao(data))
ipcMain.handle('listar-artesoes', () => listarArtesoes())

ipcMain.handle('criar-produto', (_, data) => criarProduto(data))
ipcMain.handle('listar-produtos', () => listarProdutos())
ipcMain.handle('atualizar-produto', (_, id, data) => atualizarProduto(id, data))
ipcMain.handle('excluir-produto', (_, id) => excluirProduto(id))
ipcMain.handle('buscar-produto-por-codigo', (_, codigo) => buscarProdutoPorCodigo(codigo))

ipcMain.handle('criar-venda', (_, data) => criarVenda(data))
ipcMain.handle('listar-vendas', () => listarVendas())
ipcMain.handle('listar-vendas-do-dia', () => listarVendasDoDia())
ipcMain.handle('criar-movimentacao-caixa', (_, data) => criarMovimentacaoCaixa(data))

//caixa filtro por data
ipcMain.handle('listar-vendas-por-data', (_, data) => listarVendasPorData(data))
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

app.whenReady().then(createWindow)
