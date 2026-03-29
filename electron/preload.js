const { contextBridge, ipcRenderer } = require('electron')

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args)
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Usuários e janela de login
  validarLogin: (login, senha) => invoke('validar-login', login, senha),
  loginSuccessResize: () => invoke('login-success-resize'),
  loginShowResize: () => invoke('login-show-resize'),

  // Artesãos
  criarArtesao: (data) => invoke('criar-artesao', data),
  listarArtesoes: () => invoke('listar-artesoes'),
  atualizarArtesao: (id, data) => invoke('atualizar-artesao', id, data),
  excluirArtesao: (id) => invoke('excluir-artesao', id),

  // Produtos
  criarProduto: (data) => invoke('criar-produto', data),
  listarProdutos: () => invoke('listar-produtos'),
  atualizarProduto: (id, data) => invoke('atualizar-produto', id, data),
  excluirProduto: (id) => invoke('excluir-produto', id),
  buscarProdutoPorCodigo: (codigo) => invoke('buscar-produto-por-codigo', codigo),

  // Variações (tipos e valores)
  listarTiposVariacao: () => invoke('listar-tipos-variacao'),
  criarTipoVariacao: (data) => invoke('criar-tipo-variacao', data),
  atualizarTipoVariacao: (id, data) => invoke('atualizar-tipo-variacao', id, data),
  excluirTipoVariacao: (id) => invoke('excluir-tipo-variacao', id),
  criarValorVariacao: (data) => invoke('criar-valor-variacao', data),
  atualizarValorVariacao: (id, data) => invoke('atualizar-valor-variacao', id, data),
  excluirValorVariacao: (id) => invoke('excluir-valor-variacao', id),
  listarTodosValoresVariacao: () => invoke('listar-todos-valores-variacao'),

  // Vendas
  criarVenda: (data) => invoke('criar-venda', data),
  listarVendas: () => invoke('listar-vendas'),

  // Caixa e vendas por período
  listarPagamentosCaixaPorPeriodo: (dataInicio, dataFim) =>
    invoke('listar-pagamentos-caixa-por-periodo', dataInicio, dataFim),
  listarPagamentosCaixaPorPeriodoEProduto: (dataInicio, dataFim, produtoId) =>
    invoke('listar-pagamentos-caixa-por-periodo-e-produto', dataInicio, dataFim, produtoId),
  listarVendasPorPeriodo: (dataInicio, dataFim) =>
    invoke('listar-vendas-por-periodo', dataInicio, dataFim),
  listarVendasPorPeriodoEArtesao: (dataInicio, dataFim, artesaoId) =>
    invoke('listar-vendas-por-periodo-e-artesao', dataInicio, dataFim, artesaoId),
  excluirVenda: (id) => invoke('excluir-venda', id),
  obterVendaParaEdicao: (id) => invoke('obter-venda-para-edicao', id),
  atualizarVenda: (id, data) => invoke('atualizar-venda', id, data),
  salvarRelatorioPDF: (pdfBase64, filename) => invoke('salvar-relatorio-pdf', pdfBase64, filename),

  // Estoque
  adicionarEstoque: (produtoId, quantidade, origem) =>
    invoke('adicionar-estoque', produtoId, quantidade, origem),
  listarMovimentacoesPorPeriodo: (dataInicio, dataFim) =>
    invoke('listar-movimentacoes-por-periodo', dataInicio, dataFim),
  listarProdutosMaisVendidosPorPeriodo: (dataInicio, dataFim) =>
    invoke('listar-produtos-mais-vendidos-por-periodo', dataInicio, dataFim),

  // Relatórios
  obterResumoVendasPeriodo: (dataInicio, dataFim, artesaoId) =>
    invoke('obter-resumo-vendas-periodo', dataInicio, dataFim, artesaoId),
  obterVendasPorDia: (dataInicio, dataFim, artesaoId) =>
    invoke('obter-vendas-por-dia', dataInicio, dataFim, artesaoId),
  obterTotalVendasHoje: () => invoke('obter-total-vendas-hoje'),
  obterLucroPeriodo: (dataInicio, dataFim) => invoke('obter-lucro-periodo', dataInicio, dataFim),
  listarProdutosMaisVendidosPorPeriodoEArtesao: (dataInicio, dataFim, artesaoId) =>
    invoke('listar-produtos-mais-vendidos-por-periodo-e-artesao', dataInicio, dataFim, artesaoId),
  contarProdutosPorArtesao: (artesaoId) => invoke('contar-produtos-por-artesao', artesaoId),
  obterRelatorioCustoVendasPeriodo: (dataInicio, dataFim, artesaoId) =>
    invoke('obter-relatorio-custo-vendas-periodo', dataInicio, dataFim, artesaoId),
  obterTotaisPagamentosPorPeriodo: (dataInicio, dataFim) =>
    invoke('obter-totais-pagamentos-por-periodo', dataInicio, dataFim),

  sincronizarAgora: () => invoke('sync-agora'),
})
