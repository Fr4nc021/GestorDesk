const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Artesãos
  criarArtesao: (data) => ipcRenderer.invoke('criar-artesao', data),
  listarArtesoes: () => ipcRenderer.invoke('listar-artesoes'),
  atualizarArtesao: (id, data) => ipcRenderer.invoke('atualizar-artesao', id, data),
  excluirArtesao: (id) => ipcRenderer.invoke('excluir-artesao', id),

  // Produtos
  criarProduto: (data) => ipcRenderer.invoke('criar-produto', data),
  listarProdutos: () => ipcRenderer.invoke('listar-produtos'),
  atualizarProduto: (id, data) => ipcRenderer.invoke('atualizar-produto', id, data),
  excluirProduto: (id) => ipcRenderer.invoke('excluir-produto', id),
  buscarProdutoPorCodigo: (codigo) => ipcRenderer.invoke('buscar-produto-por-codigo', codigo),

  // Vendas
  criarVenda: (data) => ipcRenderer.invoke('criar-venda', data),
  listarVendas: () => ipcRenderer.invoke('listar-vendas'),
  listarVendasDoDia: () => ipcRenderer.invoke('listar-vendas-do-dia'),

  // Caixa
  criarMovimentacaoCaixa: (data) => ipcRenderer.invoke('criar-movimentacao-caixa', data),
  listarVendasPorData: (data) => ipcRenderer.invoke('listar-vendas-por-data', data),
  listarVendasPorPeriodo: (dataInicio, dataFim) => ipcRenderer.invoke('listar-vendas-por-periodo', dataInicio, dataFim),
  salvarRelatorioPDF: (pdfBase64, filename) => ipcRenderer.invoke('salvar-relatorio-pdf', pdfBase64, filename),

  // Impressão
  imprimirEtiquetas: () => ipcRenderer.invoke('imprimir-etiquetas'),

  // Estoque
  adicionarEstoque: (produtoId, quantidade, origem) => 
    ipcRenderer.invoke('adicionar-estoque', produtoId, quantidade, origem),
  listarMovimentacoesRecentes: (limite) => 
    ipcRenderer.invoke('listar-movimentacoes-recentes', limite),
  listarProdutosMaisVendidos: () => 
    ipcRenderer.invoke('listar-produtos-mais-vendidos'),
  listarMovimentacoesPorPeriodo: (dataInicio, dataFim) => 
    ipcRenderer.invoke('listar-movimentacoes-por-periodo', dataInicio, dataFim),
  listarProdutosMaisVendidosPorPeriodo: (dataInicio, dataFim) => 
    ipcRenderer.invoke('listar-produtos-mais-vendidos-por-periodo', dataInicio, dataFim),
})