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
  atualizarFiscalEmLote: (ids, data) => invoke('atualizar-fiscal-em-lote', ids, data),
  excluirProduto: (id) => invoke('excluir-produto', id),
  buscarProdutoPorCodigo: (codigo) => invoke('buscar-produto-por-codigo', codigo),
  refazerCodigoBarras: (id) => invoke('refazer-codigo-barras', id),

  // Variações (tipos e valores)
  listarTiposVariacao: () => invoke('listar-tipos-variacao'),
  criarTipoVariacao: (data) => invoke('criar-tipo-variacao', data),
  atualizarTipoVariacao: (id, data) => invoke('atualizar-tipo-variacao', id, data),
  excluirTipoVariacao: (id) => invoke('excluir-tipo-variacao', id),
  criarValorVariacao: (data) => invoke('criar-valor-variacao', data),
  atualizarValorVariacao: (id, data) => invoke('atualizar-valor-variacao', id, data),
  excluirValorVariacao: (id) => invoke('excluir-valor-variacao', id),
  listarTodosValoresVariacao: () => invoke('listar-todos-valores-variacao'),
  obterFormacaoPreco: () => invoke('obter-formacao-preco'),
  salvarFormacaoPreco: (data) => invoke('salvar-formacao-preco', data),
  aplicarPrecoFormacaoEmTodos: (multiplicador) => invoke('aplicar-preco-formacao-em-todos', multiplicador),
  obterRelatoriosPeriodoPadrao: () => invoke('obter-relatorios-periodo-padrao'),
  salvarRelatoriosPeriodoPadrao: (data) => invoke('salvar-relatorios-periodo-padrao', data),

  // Fiscal (emitente da NFC-e / NF-e)
  obterConfigFiscal: () => invoke('obter-config-fiscal'),
  salvarConfigFiscal: (data) => invoke('salvar-config-fiscal', data),
  exportarConfigFiscal: () => invoke('exportar-config-fiscal'),
  importarConfigFiscal: () => invoke('importar-config-fiscal'),

  // Notas de entrada (XML de NF-e do fornecedor)
  buscarArtesaoPorDocumento: (documento) => invoke('buscar-artesao-por-documento', documento),
  buscarNotaEntradaPorChave: (chave) => invoke('buscar-nota-entrada-por-chave', chave),
  importarNotaEntrada: (data) => invoke('importar-nota-entrada', data),
  listarNotasEntrada: () => invoke('listar-notas-entrada'),
  listarItensNotaEntrada: (notaId) => invoke('listar-itens-nota-entrada', notaId),
  excluirNotaEntrada: (id) => invoke('excluir-nota-entrada', id),
  listarVinculosNotaEntrada: (artesaoId) => invoke('listar-vinculos-nota-entrada', artesaoId),
  registrarDevolucaoArtesao: (dados) => invoke('registrar-devolucao-artesao', dados),
  listarDevolucoesArtesao: (notaEntradaId) => invoke('listar-devolucoes-artesao', notaEntradaId),
  cancelarDevolucaoArtesao: (id) => invoke('cancelar-devolucao-artesao', id),

  // NFC-e (Focus NFe)
  emitirNfceVenda: (vendaId, opcoes) => invoke('emitir-nfce-venda', vendaId, opcoes),
  emitirNfeDevolucao: (devolucaoId) => invoke('emitir-nfe-devolucao', devolucaoId),
  atualizarSituacaoNota: (notaId) => invoke('atualizar-situacao-nota', notaId),
  cancelarNfce: (notaId, justificativa) => invoke('cancelar-nfce', notaId, justificativa),
  listarNotasFiscais: (filtros) => invoke('listar-notas-fiscais', filtros),
  listarVendasComCupom: (filtros) => invoke('listar-vendas-com-cupom', filtros),
  sugerirCest: (ncm) => invoke('sugerir-cest', ncm),
  buracosNumeracao: () => invoke('buracos-numeracao'),
  contarCuponsPendentes: () => invoke('contar-cupons-pendentes'),
  calcularDevolucaoSimbolica: (filtros) => invoke('calcular-devolucao-simbolica', filtros),
  registrarDevolucaoSimbolica: (dados) => invoke('registrar-devolucao-simbolica', dados),
  obterVendaParaDevolucaoCliente: (vendaId) => invoke('obter-venda-para-devolucao-cliente', vendaId),
  registrarDevolucaoCliente: (dados) => invoke('registrar-devolucao-cliente', dados),
  emitirNfeDevolucaoCliente: (id) => invoke('emitir-nfe-devolucao-cliente', id),
  resumoFiscalPeriodo: (dataInicio, dataFim) => invoke('resumo-fiscal-periodo', dataInicio, dataFim),
  exportarXmlsPeriodo: (dataInicio, dataFim) => invoke('exportar-xmls-periodo', dataInicio, dataFim),
  inutilizarNumeracao: (dados) => invoke('inutilizar-numeracao', dados),
  listarInutilizacoes: () => invoke('listar-inutilizacoes'),
  situacaoTabelaIbpt: () => invoke('situacao-tabela-ibpt'),
  importarTabelaIbpt: () => invoke('importar-tabela-ibpt'),
  visualizarNota: (notaId) => invoke('visualizar-nota', notaId),
  imprimirNfce: (notaId) => invoke('imprimir-nfce', notaId),
  buscarNotasRecebidas: () => invoke('buscar-notas-recebidas'),
  baixarXmlNotaRecebida: (chave) => invoke('baixar-xml-nota-recebida', chave),

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
  copiarTexto: (texto) => invoke('copiar-texto', texto),

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

  atualizacaoEstado: () => invoke('atualizacao:estado'),
  atualizacaoVerificar: () => invoke('atualizacao:verificar'),
  atualizacaoInstalar: () => invoke('atualizacao:instalar'),
  onAtualizacao: (callback) => {
    if (typeof callback !== 'function') return () => {}
    const listener = (_event, payload) => {
      if (!payload || typeof payload.status !== 'string') return
      callback({
        status: payload.status,
        versaoAtual: typeof payload.versaoAtual === 'string' ? payload.versaoAtual : '',
        versaoNova: typeof payload.versaoNova === 'string' ? payload.versaoNova : null,
        progresso: typeof payload.progresso === 'number' ? payload.progresso : null,
        mensagem: typeof payload.mensagem === 'string' ? payload.mensagem : '',
      })
    }
    ipcRenderer.on('atualizacao:evento', listener)
    return () => ipcRenderer.removeListener('atualizacao:evento', listener)
  },
})
