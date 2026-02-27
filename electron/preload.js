const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Artesãos
  criarArtesao: (data) => ipcRenderer.invoke('criar-artesao', data),
  listarArtesoes: () => ipcRenderer.invoke('listar-artesoes'),

  // Produtos
  criarProduto: (data) => ipcRenderer.invoke('criar-produto', data),
  listarProdutos: () => ipcRenderer.invoke('listar-produtos'),

  // Vendas
  criarVenda: (data) => ipcRenderer.invoke('criar-venda', data),
  listarVendas: () => ipcRenderer.invoke('listar-vendas'),

  // Caixa
  criarMovimentacaoCaixa: (data) => ipcRenderer.invoke('criar-movimentacao-caixa', data),
})