const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const {
  criarArtesao,
  listarArtesoes,
  criarProduto,
  listarProdutos,
  criarVenda,
  listarVendas,
  criarMovimentacaoCaixa,
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
ipcMain.handle('criar-venda', (_, data) => criarVenda(data))
ipcMain.handle('listar-vendas', () => listarVendas())
ipcMain.handle('criar-movimentacao-caixa', (_, data) => criarMovimentacaoCaixa(data))

app.whenReady().then(createWindow)