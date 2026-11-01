import { useEffect, useMemo, useRef, useState } from 'react'
import { rotuloNomeFantasia } from '../utils/artesao'
import { formatarCpfCnpj } from '../utils/documento'
import { calcularFormacao, formatarMoeda, precoSugerido } from '../utils/formacaoPreco'
import { formatarNcm } from '../utils/fiscal'
import { TIPOS_NOTA_ENTRADA, lerNfeXml } from '../utils/nfeXml'
import { mensagemErro } from '../utils/erros'
import BotaoAcao from '../components/BotaoAcao'
import { ORIGEM_CASAMENTO, encontrarProduto, semelhanca } from '../utils/casamentoProdutos'

function formatarData(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function dataIso(ano, mes, dia) {
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Mês das vendas que a nota de acerto paga: o anterior se ela saiu até o dia 15, senão o próprio mês. */
function periodoAcertoPadrao(dataEmissao) {
  const base = dataEmissao ? new Date(dataEmissao) : new Date()
  const d = Number.isNaN(base.getTime()) ? new Date() : base
  let ano = d.getFullYear()
  let mes = d.getMonth() + 1
  if (d.getDate() <= 15) {
    mes -= 1
    if (mes === 0) {
      mes = 12
      ano -= 1
    }
  }
  const ultimoDia = new Date(ano, mes, 0).getDate()
  return { inicio: dataIso(ano, mes, 1), fim: dataIso(ano, mes, ultimoDia) }
}

function formatarQuantidade(n) {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

function parsePreco(valor) {
  const texto = String(valor ?? '').trim()
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto
  const n = parseFloat(normalizado)
  return Number.isFinite(n) ? n : 0
}

function precoParaInput(valor) {
  return Number(valor || 0).toFixed(2).replace('.', ',')
}

/** Pessoa física tem CPF; MEI e empresa têm CNPJ. Nota de artesão costuma vir de MEI (CRT 4). */
function tipoPessoaDoEmitente(emitente) {
  const doc = String(emitente.cpf_cnpj || '').replace(/\D/g, '')
  if (doc.length === 11) return 'pf'
  return emitente.crt === '4' ? 'mei' : 'empresa'
}

function novoArtesaoDoEmitente(emitente) {
  return {
    nome: emitente.razao_social,
    razao_social: emitente.razao_social,
    nome_fantasia: emitente.nome_fantasia || null,
    tipo_pessoa: tipoPessoaDoEmitente(emitente),
    cpf_cnpj: String(emitente.cpf_cnpj || '').replace(/\D/g, '') || null,
    inscricao_estadual: emitente.inscricao_estadual || null,
    cep: String(emitente.cep || '').replace(/\D/g, '') || null,
    logradouro: emitente.logradouro || null,
    numero: emitente.numero || null,
    complemento: emitente.complemento || null,
    bairro: emitente.bairro || null,
    cidade: emitente.cidade || null,
    uf: emitente.uf || null,
    codigo_municipio: emitente.codigo_municipio || null,
    telefone_whats: emitente.telefone || null,
  }
}

export default function NotasEntrada() {
  const [notas, setNotas] = useState([])
  const [recebidas, setRecebidas] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [produtos, setProdutos] = useState([])
  const [artesoes, setArtesoes] = useState([])
  const [multiplicador, setMultiplicador] = useState(null)
  const [cnpjLoja, setCnpjLoja] = useState('')

  const [previa, setPrevia] = useState(null)
  const [artesaoEscolhido, setArtesaoEscolhido] = useState('')
  const [itensPrevia, setItensPrevia] = useState([])
  const [importando, setImportando] = useState(false)
  const [erroPrevia, setErroPrevia] = useState('')

  const [acertoPeriodo, setAcertoPeriodo] = useState({ inicio: '', fim: '' })
  const [acertoConferencia, setAcertoConferencia] = useState(null)

  const [notaDetalhe, setNotaDetalhe] = useState(null)
  const [itensDetalhe, setItensDetalhe] = useState([])
  const [devolucoesDetalhe, setDevolucoesDetalhe] = useState([])

  const [devolucao, setDevolucao] = useState(null)
  const [salvandoDevolucao, setSalvandoDevolucao] = useState(false)
  const [erroDevolucao, setErroDevolucao] = useState('')
  const [emitindoDevolucaoId, setEmitindoDevolucaoId] = useState(null)
  const [mensagem, setMensagem] = useState({ tipo: '', texto: '' })
  const inputArquivoRef = useRef(null)

  useEffect(() => {
    carregarNotas()
    carregarCadastros()
  }, [])

  async function carregarNotas() {
    if (!window.electronAPI?.listarNotasEntrada) {
      setCarregando(false)
      return
    }
    try {
      setNotas(await window.electronAPI.listarNotasEntrada())
    } catch (err) {
      console.error('[Notas de entrada] Erro ao listar notas:', err)
      setMensagem({ tipo: 'error', texto: err?.message || 'Erro ao carregar as notas.' })
    } finally {
      setCarregando(false)
    }
  }

  async function carregarCadastros() {
    if (!window.electronAPI) return
    try {
      const [listaProdutos, listaArtesoes, formacao, fiscal] = await Promise.all([
        window.electronAPI.listarProdutos(),
        window.electronAPI.listarArtesoes(),
        window.electronAPI.obterFormacaoPreco?.(),
        window.electronAPI.obterConfigFiscal?.(),
      ])
      const calc = formacao ? calcularFormacao(formacao) : null
      const mult = calc?.ok ? calc.multiplicador : null
      setProdutos(listaProdutos || [])
      setArtesoes(listaArtesoes || [])
      setMultiplicador(mult)
      setCnpjLoja(String(fiscal?.cnpj || '').replace(/\D/g, ''))
      return { produtos: listaProdutos || [], artesoes: listaArtesoes || [], multiplicador: mult }
    } catch (err) {
      console.error('[Notas de entrada] Erro ao carregar cadastros:', err)
      return { produtos, artesoes, multiplicador }
    }
  }

  function escolherArquivo() {
    setMensagem({ tipo: '', texto: '' })
    inputArquivoRef.current?.click()
  }

  async function handleArquivo(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    try {
      await processarXml(await arquivo.text())
    } catch (err) {
      console.error('[Notas de entrada] Erro ao ler XML:', err)
      setMensagem({ tipo: 'error', texto: err?.message || 'Não foi possível ler o XML.' })
    }
  }

  /** Busca na SEFAZ (pela Focus) as notas emitidas para a loja, sem precisar do arquivo. */
  async function buscarRecebidas() {
    setMensagem({ tipo: '', texto: '' })
    setRecebidas({ carregando: true, lista: [], erro: '', baixando: null })
    try {
      const lista = await window.electronAPI.buscarNotasRecebidas()
      setRecebidas({ carregando: false, lista: lista || [], erro: '', baixando: null })
    } catch (err) {
      setRecebidas({ carregando: false, lista: [], erro: mensagemErro(err, 'Não foi possível buscar as notas.'), baixando: null })
    }
  }

  async function importarRecebida(nota) {
    setRecebidas((prev) => ({ ...prev, erro: '', baixando: nota.chave }))
    try {
      const xml = await window.electronAPI.baixarXmlNotaRecebida(nota.chave)
      setRecebidas(null)
      await processarXml(xml)
    } catch (err) {
      setRecebidas((prev) => prev && { ...prev, erro: mensagemErro(err, 'Não foi possível baixar a nota.'), baixando: null })
    }
  }

  async function processarXml(xml) {
    try {
      const nota = lerNfeXml(xml)
      const existente = await window.electronAPI.buscarNotaEntradaPorChave(nota.chave)
      if (existente) {
        setMensagem({ tipo: 'error', texto: `A nota nº ${nota.numero} já foi importada.` })
        return
      }
      const cadastros = await carregarCadastros()
      let artesao = await window.electronAPI.buscarArtesaoPorDocumento(nota.emitente.cpf_cnpj)
      const porNome = artesao ? null : artesaoPeloNome(cadastros.artesoes, nota.emitente.razao_social)
      if (porNome) artesao = porNome
      // O artesão MEI fatura o acerto com 5.102 em vez de 5.113: se ele já tem peças consignadas aqui, é acerto.
      const temConsignados =
        artesao && cadastros.produtos.some((p) => p.artesao_id === artesao.id && p.tipo_posse !== 'proprio')
      if (nota.tipo === 'compra' && temConsignados) nota.tipo = 'faturamento_consignacao'
      const vinculos = artesao ? (await window.electronAPI.listarVinculosNotaEntrada?.(artesao.id)) || [] : []
      montarPrevia(nota, xml, artesao, { ...cadastros, vinculos }, Boolean(porNome))
    } catch (err) {
      console.error('[Notas de entrada] Erro ao ler XML:', err)
      setMensagem({ tipo: 'error', texto: err?.message || 'Não foi possível ler o XML.' })
    }
  }

  /** Liga cada item da nota a um produto do fornecedor; o que não tiver par seguro fica para a pessoa decidir. */
  function casarItens(itensNota, regra, produtosDoArtesao, vinculos, mult) {
    return itensNota.map((item) => {
      const { produto, origem } = encontrarProduto(item, produtosDoArtesao, vinculos)
      const sugerido = mult ? precoSugerido(item.valor_unitario, mult) : null
      let acao = 'ignorar'
      if (produto) acao = 'vincular'
      else if (regra.movimentaEstoque) acao = produtosDoArtesao.length > 0 ? 'escolher' : 'criar'
      return {
        ...item,
        acao,
        origem,
        produto_id: produto ? String(produto.id) : '',
        // Se o produto já tem estoque, provavelmente são as mesmas peças: por padrão não soma de novo.
        somar_estoque: !produto || Number(produto.estoque || 0) <= 0,
        nome: item.descricao,
        preco_venda: precoParaInput(sugerido ?? item.valor_unitario),
      }
    })
  }

  /** Fornecedor ainda sem CPF/CNPJ no cadastro, reconhecido pelo nome igual (ordem das palavras não importa). */
  function artesaoPeloNome(lista, nomeEmitente) {
    let melhor = null
    let pontos = 0
    for (const a of lista || []) {
      const s = Math.max(semelhanca(a.razao_social, nomeEmitente), semelhanca(a.nome, nomeEmitente))
      if (s > pontos) {
        melhor = a
        pontos = s
      }
    }
    return pontos >= 0.8 ? melhor : null
  }

  function montarPrevia(nota, xml, artesao, cadastros, artesaoPorNome = false) {
    const regra = TIPOS_NOTA_ENTRADA[nota.tipo]
    const produtosDoArtesao = artesao ? cadastros.produtos.filter((p) => p.artesao_id === artesao.id) : []
    setPrevia({ nota, xml, artesaoEncontrado: artesao, artesaoPorNome })
    setArtesaoEscolhido(artesao ? String(artesao.id) : 'novo')
    setErroPrevia('')
    setAcertoPeriodo(periodoAcertoPadrao(nota.data_emissao))
    setItensPrevia(casarItens(nota.itens, regra, produtosDoArtesao, cadastros.vinculos || [], cadastros.multiplicador))
  }

  /** Trocar o fornecedor refaz a ligação dos itens com os produtos dele. */
  async function trocarArtesao(valor) {
    setArtesaoEscolhido(valor)
    if (!previa) return
    const id = Number(valor)
    const regra = TIPOS_NOTA_ENTRADA[previa.nota.tipo]
    const produtosDoArtesao = id ? produtos.filter((p) => p.artesao_id === id) : []
    let vinculos = []
    try {
      vinculos = id ? (await window.electronAPI.listarVinculosNotaEntrada?.(id)) || [] : []
    } catch (err) {
      console.error('[Notas de entrada] Erro ao carregar vínculos:', err)
    }
    setItensPrevia(casarItens(previa.nota.itens, regra, produtosDoArtesao, vinculos, multiplicador))
  }

  /** Trocar a operação (ex.: acerto que veio com CFOP de compra) refaz a ligação dos itens. */
  async function trocarTipo(tipo) {
    if (!previa) return
    setPrevia((prev) => ({ ...prev, nota: { ...prev.nota, tipo } }))
    setAcertoPeriodo(periodoAcertoPadrao(previa.nota.data_emissao))
    const id = Number(artesaoEscolhido)
    const produtosDoArtesao = id ? produtos.filter((p) => p.artesao_id === id) : []
    let vinculos = []
    try {
      vinculos = id ? (await window.electronAPI.listarVinculosNotaEntrada?.(id)) || [] : []
    } catch (err) {
      console.error('[Notas de entrada] Erro ao carregar vínculos:', err)
    }
    setItensPrevia(casarItens(previa.nota.itens, TIPOS_NOTA_ENTRADA[tipo], produtosDoArtesao, vinculos, multiplicador))
  }

  function escolherProduto(indice, produtoId) {
    const produto = produtos.find((p) => String(p.id) === String(produtoId))
    setItensPrevia((prev) =>
      prev.map((item, i) =>
        i === indice
          ? { ...item, produto_id: produtoId, origem: null, somar_estoque: !produto || Number(produto.estoque || 0) <= 0 }
          : item,
      ),
    )
    setErroPrevia('')
  }

  function atualizarItem(indice, campo, valor) {
    setItensPrevia((prev) => prev.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)))
    setErroPrevia('')
  }

  const ehAcerto = previa?.nota.tipo === 'faturamento_consignacao'
  const chaveConferencia = `${artesaoEscolhido}|${acertoPeriodo.inicio}|${acertoPeriodo.fim}`
  const conferenciaAtual = acertoConferencia?.chave === chaveConferencia ? acertoConferencia : null

  useEffect(() => {
    const artesaoId = Number(artesaoEscolhido)
    if (!ehAcerto || !artesaoId || !acertoPeriodo.inicio || !acertoPeriodo.fim) return
    if (!window.electronAPI?.obterRelatorioCustoVendasPeriodo) return
    let cancelado = false
    window.electronAPI
      .obterRelatorioCustoVendasPeriodo(acertoPeriodo.inicio, acertoPeriodo.fim, artesaoId)
      .then((rel) => {
        if (!cancelado) setAcertoConferencia({ chave: chaveConferencia, totalCusto: Number(rel?.totalCusto) || 0 })
      })
      .catch((err) => console.error('[Notas de entrada] Erro ao conferir acerto:', err))
    return () => {
      cancelado = true
    }
  }, [ehAcerto, artesaoEscolhido, acertoPeriodo.inicio, acertoPeriodo.fim, chaveConferencia])

  const produtosParaVincular = useMemo(() => {
    const id = Number(artesaoEscolhido)
    const lista = id ? produtos.filter((p) => p.artesao_id === id) : produtos
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [produtos, artesaoEscolhido])

  async function confirmarImportacao() {
    if (!previa) return
    const { nota, xml } = previa
    const regra = TIPOS_NOTA_ENTRADA[nota.tipo]

    for (const item of itensPrevia) {
      if (item.acao === 'escolher') {
        setErroPrevia(`Item ${item.numero_item} (${item.descricao}): diga se é um produto que já existe ou um novo.`)
        return
      }
      if (item.acao === 'vincular' && !item.produto_id) {
        setErroPrevia(`Item ${item.numero_item}: escolha o produto a vincular.`)
        return
      }
      if (item.acao === 'criar' && !String(item.nome).trim()) {
        setErroPrevia(`Item ${item.numero_item}: informe o nome do produto.`)
        return
      }
      if (item.acao === 'criar' && parsePreco(item.preco_venda) <= 0) {
        setErroPrevia(`Item ${item.numero_item}: informe o preço de venda.`)
        return
      }
    }

    setImportando(true)
    try {
      const resultado = await window.electronAPI.importarNotaEntrada({
        nota: {
          chave: nota.chave,
          modelo: nota.modelo,
          serie: nota.serie,
          numero: nota.numero,
          data_emissao: nota.data_emissao,
          natureza_operacao: nota.natureza_operacao,
          cfop: nota.cfop,
          tipo: nota.tipo,
          emitente_cpf_cnpj: nota.emitente.cpf_cnpj,
          emitente_nome: nota.emitente.razao_social,
          valor_total: nota.valor_total,
          acerto_inicio: ehAcerto ? acertoPeriodo.inicio : null,
          acerto_fim: ehAcerto ? acertoPeriodo.fim : null,
        },
        artesao_id: artesaoEscolhido !== 'novo' ? Number(artesaoEscolhido) : null,
        novo_artesao: artesaoEscolhido === 'novo' ? novoArtesaoDoEmitente(nota.emitente) : null,
        itens: itensPrevia.map((item) => ({
          numero_item: item.numero_item,
          codigo: item.codigo,
          descricao: item.descricao,
          ncm: item.ncm,
          cest: item.cest,
          cfop: item.cfop,
          unidade: item.unidade,
          quantidade: item.quantidade,
          valor_unitario: item.valor_unitario,
          valor_total: item.valor_total,
          acao: item.acao,
          produto_id: item.acao === 'vincular' ? Number(item.produto_id) : null,
          somar_estoque: item.acao === 'criar' || item.somar_estoque,
          nome: item.nome,
          preco_venda: parsePreco(item.preco_venda),
        })),
        xml,
      })
      setPrevia(null)
      await Promise.all([carregarNotas(), carregarCadastros()])
      const partes = [`Nota nº ${nota.numero} importada.`]
      if (resultado.produtosCriados > 0) partes.push(`${resultado.produtosCriados} produto(s) cadastrado(s).`)
      if (regra.movimentaEstoque) partes.push(`${resultado.unidadesEntrada} peça(s) entraram no estoque.`)
      setMensagem({ tipo: 'success', texto: partes.join(' ') })
    } catch (err) {
      console.error('[Notas de entrada] Erro ao importar nota:', err)
      setErroPrevia(err?.message || 'Erro ao importar a nota.')
    } finally {
      setImportando(false)
    }
  }

  async function abrirDetalhe(nota) {
    setNotaDetalhe(nota)
    setItensDetalhe([])
    setDevolucoesDetalhe([])
    try {
      const [itens, devolucoes] = await Promise.all([
        window.electronAPI.listarItensNotaEntrada(nota.id),
        nota.tipo === 'remessa_consignacao' ? window.electronAPI.listarDevolucoesArtesao?.(nota.id) : [],
      ])
      setItensDetalhe(itens || [])
      setDevolucoesDetalhe(devolucoes || [])
    } catch (err) {
      console.error('[Notas de entrada] Erro ao carregar itens:', err)
    }
  }

  // Peças vinculadas sem "Somar ao estoque" já estavam no estoque: contam pela quantidade da nota.
  function quantidadeDevolvivel(item) {
    return Math.max(Number(item.quantidade_estoque) || 0, Math.round(Number(item.quantidade) || 0))
  }

  async function abrirDevolucao(nota) {
    setMensagem({ tipo: '', texto: '' })
    setErroDevolucao('')
    try {
      const itens = await window.electronAPI.listarItensNotaEntrada(nota.id)
      const linhas = (itens || [])
        .map((item) => ({ ...item, recebidas: quantidadeDevolvivel(item) }))
        .filter((item) => item.produto_id && item.recebidas > 0)
        .map((item) => {
          const restante = item.recebidas - Number(item.quantidade_devolvida || 0)
          return {
            ...item,
            maximo: Math.max(0, Math.min(restante, Number(item.produto_estoque) || 0)),
            restante,
            quantidade: '',
          }
        })
      if (linhas.every((l) => l.maximo === 0)) {
        setMensagem({ tipo: 'error', texto: `Não há peças da nota nº ${nota.numero} no estoque para devolver.` })
        return
      }
      setDevolucao({ nota, linhas, observacao: '' })
    } catch (err) {
      setMensagem({ tipo: 'error', texto: err?.message || 'Erro ao carregar os itens da nota.' })
    }
  }

  function atualizarQuantidadeDevolucao(indice, valor) {
    setDevolucao((prev) => ({
      ...prev,
      linhas: prev.linhas.map((l, i) => (i === indice ? { ...l, quantidade: valor.replace(/\D/g, '') } : l)),
    }))
    setErroDevolucao('')
  }

  function devolverTudo() {
    setDevolucao((prev) => ({
      ...prev,
      linhas: prev.linhas.map((l) => ({ ...l, quantidade: l.maximo > 0 ? String(l.maximo) : '' })),
    }))
    setErroDevolucao('')
  }

  const totalDevolucao = devolucao
    ? devolucao.linhas.reduce((acc, l) => acc + (Number(l.quantidade) || 0) * Number(l.valor_unitario || 0), 0)
    : 0

  async function confirmarDevolucao() {
    if (!devolucao) return
    const itens = devolucao.linhas
      .filter((l) => Number(l.quantidade) > 0)
      .map((l) => ({ nota_item_id: l.id, quantidade: Number(l.quantidade) }))
    const acimaDoMaximo = devolucao.linhas.find((l) => Number(l.quantidade) > l.maximo)
    if (acimaDoMaximo) {
      setErroDevolucao(`"${acimaDoMaximo.produto_nome}": no máximo ${acimaDoMaximo.maximo} peça(s).`)
      return
    }
    if (itens.length === 0) {
      setErroDevolucao('Informe a quantidade de pelo menos uma peça.')
      return
    }
    setSalvandoDevolucao(true)
    try {
      const resultado = await window.electronAPI.registrarDevolucaoArtesao({
        nota_entrada_id: devolucao.nota.id,
        itens,
        observacao: devolucao.observacao.trim() || null,
      })
      const unidades = itens.reduce((acc, i) => acc + i.quantidade, 0)
      setDevolucao(null)
      await Promise.all([carregarNotas(), carregarCadastros()])
      setMensagem({
        tipo: 'success',
        texto: `Devolução registrada: ${unidades} peça(s), ${formatarMoeda(resultado.valor_total)}. As peças saíram do estoque e a nota fiscal de devolução (CFOP 5918) fica pendente.`,
      })
    } catch (err) {
      setErroDevolucao(err?.message || 'Erro ao registrar a devolução.')
    } finally {
      setSalvandoDevolucao(false)
    }
  }

  async function emitirNotaDevolucao(dev) {
    setEmitindoDevolucaoId(dev.id)
    setMensagem({ tipo: '', texto: '' })
    try {
      const nota = await window.electronAPI.emitirNfeDevolucao(dev.id)
      if (nota?.status === 'autorizado') {
        setMensagem({ tipo: 'success', texto: `NF-e de devolução nº ${nota.numero} autorizada.` })
      } else if (nota?.status === 'processando_autorizacao') {
        setMensagem({ tipo: 'success', texto: 'NF-e enviada e ainda em processamento na SEFAZ. Confira em Notas emitidas.' })
      } else {
        setMensagem({ tipo: 'error', texto: nota?.mensagem || 'A NF-e não foi autorizada.' })
      }
      if (notaDetalhe) await abrirDetalhe(notaDetalhe)
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Erro ao emitir a NF-e de devolução.') })
    } finally {
      setEmitindoDevolucaoId(null)
    }
  }

  async function imprimirNotaDevolucao(dev) {
    try {
      await window.electronAPI.imprimirNfce(dev.nota_fiscal.id)
    } catch (err) {
      setMensagem({ tipo: 'error', texto: mensagemErro(err, 'Não foi possível abrir a nota.') })
    }
  }

  async function cancelarDevolucao(dev) {
    if (!window.confirm('Cancelar esta devolução? As peças voltam para o estoque.')) return
    try {
      await window.electronAPI.cancelarDevolucaoArtesao(dev.id)
      await Promise.all([carregarNotas(), carregarCadastros()])
      if (notaDetalhe) await abrirDetalhe(notaDetalhe)
      setMensagem({ tipo: 'success', texto: 'Devolução cancelada. As peças voltaram para o estoque.' })
    } catch (err) {
      setMensagem({ tipo: 'error', texto: err?.message || 'Erro ao cancelar a devolução.' })
    }
  }

  async function excluirNota(nota) {
    const aviso = nota.movimentou_estoque
      ? 'As peças que esta nota lançou saem do estoque. Os produtos cadastrados continuam.'
      : 'O estoque não muda.'
    if (!window.confirm(`Excluir a importação da nota nº ${nota.numero}? ${aviso}`)) return
    try {
      await window.electronAPI.excluirNotaEntrada(nota.id)
      setNotaDetalhe(null)
      await Promise.all([carregarNotas(), carregarCadastros()])
      setMensagem({ tipo: 'success', texto: `Importação da nota nº ${nota.numero} excluída.` })
    } catch (err) {
      setMensagem({ tipo: 'error', texto: err?.message || 'Erro ao excluir a nota.' })
    }
  }

  const regraPrevia = previa ? TIPOS_NOTA_ENTRADA[previa.nota.tipo] : null
  const destinoDiferente =
    previa && cnpjLoja && previa.nota.destinatario_cpf_cnpj && previa.nota.destinatario_cpf_cnpj !== cnpjLoja

  return (
    <div className="produtos notas-entrada">
      <div className="produtos-header">
        <div className="produtos-header-left">
          <h2 className="dashboard-heading">Notas de entrada</h2>
          <p className="dashboard-subtitle">
            Importe o XML da NF-e do artesão ou fornecedor para cadastrar as peças e dar entrada no estoque.
          </p>
        </div>
        <div className="produtos-actions">
          <button type="button" className="notas-entrada-btn-sefaz" onClick={buscarRecebidas}>
            Buscar na SEFAZ
          </button>
          <button type="button" className="produtos-btn-primary" onClick={escolherArquivo}>
            <span>+</span> Importar XML
          </button>
          <input
            ref={inputArquivoRef}
            type="file"
            accept=".xml,text/xml,application/xml"
            onChange={handleArquivo}
            hidden
          />
        </div>
      </div>

      {mensagem.texto && <p className={`config-feedback ${mensagem.tipo}`}>{mensagem.texto}</p>}

      <div className="produtos-table-wrapper">
        <table className="pdv-products-table">
          <thead>
            <tr>
              <th>Emissão</th>
              <th>Nota</th>
              <th>Fornecedor</th>
              <th>Operação</th>
              <th>Itens</th>
              <th>Valor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {carregando ? (
              <tr>
                <td colSpan={7}>Carregando...</td>
              </tr>
            ) : notas.length === 0 ? (
              <tr>
                <td colSpan={7}>Nenhuma nota importada.</td>
              </tr>
            ) : (
              notas.map((nota) => (
                <tr key={nota.id}>
                  <td>{formatarData(nota.data_emissao || nota.created_at)}</td>
                  <td>
                    {nota.numero}
                    {nota.serie ? ` / ${nota.serie}` : ''}
                  </td>
                  <td>
                    {rotuloNomeFantasia(
                      nota.artesao_nome_fantasia,
                      nota.artesao_razao_social,
                      nota.artesao_nome || nota.emitente_nome,
                      '—',
                    )}
                  </td>
                  <td>
                    {TIPOS_NOTA_ENTRADA[nota.tipo]?.label || nota.tipo}
                    <span className="notas-entrada-cfop">CFOP {nota.cfop}</span>
                  </td>
                  <td>
                    {nota.qtd_itens}
                    {nota.movimentou_estoque ? ` (${nota.unidades_estoque} no estoque)` : ''}
                    {nota.unidades_devolvidas > 0 && (
                      <span className="notas-entrada-cfop">{nota.unidades_devolvidas} devolvida(s)</span>
                    )}
                    {nota.acerto_inicio && (
                      <span className="notas-entrada-cfop">
                        Vendas de {formatarData(`${nota.acerto_inicio}T12:00:00`)} a{' '}
                        {formatarData(`${nota.acerto_fim}T12:00:00`)}
                      </span>
                    )}
                  </td>
                  <td>{formatarMoeda(nota.valor_total)}</td>
                  <td>
                    <div className="caixa-acoes-cell">
                      <BotaoAcao icone="ver" onClick={() => abrirDetalhe(nota)}>
                        Ver itens
                      </BotaoAcao>
                      {nota.tipo === 'remessa_consignacao' && (
                        <BotaoAcao icone="devolver" onClick={() => abrirDevolucao(nota)}>
                          Devolver peças
                        </BotaoAcao>
                      )}
                      <BotaoAcao icone="excluir" perigo onClick={() => excluirNota(nota)}>
                        Excluir
                      </BotaoAcao>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {previa && (
        <div className="modal-overlay" onClick={() => !importando && setPrevia(null)}>
          <div className="modal-content notas-entrada-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Importar nota nº {previa.nota.numero}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !importando && setPrevia(null)}
                aria-label="Fechar"
                disabled={importando}
              >
                ×
              </button>
            </div>

            <div className="notas-entrada-resumo">
              <div>
                <span>Emitente</span>
                <strong>{previa.nota.emitente.razao_social}</strong>
                <small>
                  {formatarCpfCnpj(previa.nota.emitente.cpf_cnpj, tipoPessoaDoEmitente(previa.nota.emitente))}
                  {previa.nota.emitente.cidade ? ` · ${previa.nota.emitente.cidade}/${previa.nota.emitente.uf}` : ''}
                </small>
              </div>
              <div>
                <span>Operação</span>
                <select
                  className="notas-entrada-tipo"
                  value={previa.nota.tipo}
                  onChange={(e) => trocarTipo(e.target.value)}
                  aria-label="Operação da nota"
                >
                  {Object.entries(TIPOS_NOTA_ENTRADA).map(([tipo, regra]) => (
                    <option key={tipo} value={tipo}>
                      {regra.label}
                    </option>
                  ))}
                </select>
                <small>
                  CFOP {previa.nota.cfop}
                  {regraPrevia.cfopEntrada ? ` → entrada ${regraPrevia.cfopEntrada}` : ''}
                </small>
              </div>
              <div>
                <span>Emissão</span>
                <strong>{formatarData(previa.nota.data_emissao)}</strong>
                <small>{formatarMoeda(previa.nota.valor_total)}</small>
              </div>
            </div>

            {!previa.nota.autorizada && (
              <p className="config-feedback error">
                Este XML não tem o protocolo de autorização da SEFAZ. Confira se a nota foi autorizada.
              </p>
            )}
            {destinoDiferente && (
              <p className="config-feedback error">
                A nota não foi emitida para o CNPJ da loja cadastrado em Configurações › Fiscal.
              </p>
            )}
            {!regraPrevia.movimentaEstoque && (
              <p className="modal-field-hint">
                {previa.nota.tipo === 'faturamento_consignacao'
                  ? 'Nota de acerto: as peças já saíram na venda, então o estoque não muda. A nota fica registrada para o acerto com o artesão.'
                  : 'Esta operação não dá entrada no estoque. A nota só fica registrada.'}
              </p>
            )}

            {ehAcerto && (
              <div className="notas-entrada-acerto">
                <div className="notas-entrada-acerto-periodo">
                  <span>Vendas que esta nota paga</span>
                  <input
                    type="date"
                    value={acertoPeriodo.inicio}
                    onChange={(e) => setAcertoPeriodo((p) => ({ ...p, inicio: e.target.value }))}
                    aria-label="Início do período"
                  />
                  <span>a</span>
                  <input
                    type="date"
                    value={acertoPeriodo.fim}
                    onChange={(e) => setAcertoPeriodo((p) => ({ ...p, fim: e.target.value }))}
                    aria-label="Fim do período"
                  />
                </div>
                {!Number(artesaoEscolhido) ? (
                  <p className="modal-field-hint">Escolha o fornecedor para conferir o valor com as vendas.</p>
                ) : conferenciaAtual ? (
                  (() => {
                    const diferenca = Number(previa.nota.valor_total) - conferenciaAtual.totalCusto
                    const confere = Math.abs(diferenca) < 0.01
                    return (
                      <p className={`config-feedback ${confere ? 'success' : 'error'}`}>
                        Custo das peças vendidas no período: {formatarMoeda(conferenciaAtual.totalCusto)}. Valor da
                        nota: {formatarMoeda(previa.nota.valor_total)}.{' '}
                        {confere
                          ? 'Os valores conferem.'
                          : `Diferença de ${formatarMoeda(Math.abs(diferenca))} (nota ${diferenca > 0 ? 'maior' : 'menor'} que o relatório). Confira antes de pagar.`}
                      </p>
                    )
                  })()
                ) : (
                  <p className="modal-field-hint">Conferindo com as vendas...</p>
                )}
              </div>
            )}

            <div className="modal-field">
              <label htmlFor="artesaoNota">Fornecedor</label>
              <select
                id="artesaoNota"
                value={artesaoEscolhido}
                onChange={(e) => trocarArtesao(e.target.value)}
              >
                {(!previa.artesaoEncontrado || previa.artesaoPorNome) && (
                  <option value="novo">Cadastrar {previa.nota.emitente.razao_social} como novo fornecedor</option>
                )}
                {artesoes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {rotuloNomeFantasia(a.nome_fantasia, a.razao_social, a.nome)}
                  </option>
                ))}
              </select>
              {previa.artesaoPorNome && String(artesaoEscolhido) === String(previa.artesaoEncontrado.id) && (
                <p className="modal-field-hint">
                  Fornecedor reconhecido pelo nome. Confira se é a mesma pessoa; o CPF/CNPJ da nota será salvo no cadastro.
                </p>
              )}
            </div>

            {(() => {
              const ligados = itensPrevia.filter((i) => i.acao === 'vincular' && i.origem && i.origem !== 'sugestao').length
              const conferir = itensPrevia.filter((i) => i.acao === 'escolher' || i.origem === 'sugestao').length
              const novos = itensPrevia.filter((i) => i.acao === 'criar').length
              return (
                <p className="modal-field-hint">
                  {ligados} item(ns) ligado(s) a produtos que já existem
                  {conferir > 0 ? `, ${conferir} para conferir` : ''}
                  {novos > 0 ? `, ${novos} produto(s) novo(s)` : ''}.
                </p>
              )
            })()}

            <div className="notas-entrada-itens">
              <table className="pdv-products-table">
                <thead>
                  <tr>
                    <th>Item da nota</th>
                    <th>NCM</th>
                    <th>Qtd</th>
                    <th>Custo</th>
                    <th>No GestorDesk</th>
                  </tr>
                </thead>
                <tbody>
                  {itensPrevia.map((item, indice) => (
                    <tr
                      key={item.numero_item || indice}
                      className={item.acao === 'escolher' || item.origem === 'sugestao' ? 'notas-entrada-conferir' : ''}
                    >
                      <td>
                        {item.descricao}
                        {item.codigo && <span className="notas-entrada-cfop">Cód. {item.codigo}</span>}
                      </td>
                      <td>{item.ncm ? formatarNcm(item.ncm) : '—'}</td>
                      <td>
                        {formatarQuantidade(item.quantidade)} {item.unidade}
                      </td>
                      <td>{formatarMoeda(item.valor_unitario)}</td>
                      <td className="notas-entrada-acao">
                        <select value={item.acao} onChange={(e) => atualizarItem(indice, 'acao', e.target.value)}>
                          {item.acao === 'escolher' && <option value="escolher">Escolha: já existe ou é novo?</option>}
                          {regraPrevia.movimentaEstoque && <option value="criar">Cadastrar produto novo</option>}
                          <option value="vincular">Vincular a produto existente</option>
                          <option value="ignorar">Não vincular</option>
                        </select>
                        {item.acao === 'criar' && (
                          <div className="notas-entrada-novo">
                            <input
                              type="text"
                              value={item.nome}
                              onChange={(e) => atualizarItem(indice, 'nome', e.target.value)}
                              placeholder="Nome do produto"
                            />
                            <input
                              type="text"
                              inputMode="decimal"
                              value={item.preco_venda}
                              onChange={(e) => atualizarItem(indice, 'preco_venda', e.target.value)}
                              placeholder="Preço de venda"
                              aria-label="Preço de venda"
                            />
                          </div>
                        )}
                        {item.acao === 'vincular' && (
                          <select
                            value={item.produto_id}
                            onChange={(e) => escolherProduto(indice, e.target.value)}
                          >
                            <option value="">Escolha o produto...</option>
                            {produtosParaVincular.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome}
                                {p.variacao ? ` (${p.variacao})` : ''}
                                {` · estoque ${p.estoque ?? 0}`}
                              </option>
                            ))}
                          </select>
                        )}
                        {item.acao === 'vincular' && item.origem && (
                          <span className="notas-entrada-cfop">{ORIGEM_CASAMENTO[item.origem]}</span>
                        )}
                        {item.acao === 'vincular' && regraPrevia.movimentaEstoque && (
                          <label className="notas-entrada-somar">
                            <input
                              type="checkbox"
                              checked={item.somar_estoque}
                              onChange={(e) => atualizarItem(indice, 'somar_estoque', e.target.checked)}
                            />
                            Somar {formatarQuantidade(item.quantidade)} ao estoque
                          </label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {regraPrevia.movimentaEstoque && (
              <p className="modal-field-hint">
                O preço de venda sugerido usa a Formação de Preço sobre o custo da nota. Produtos vinculados recebem o
                NCM da nota. Desmarque "Somar ao estoque" quando as peças já estão contadas no estoque do sistema.
              </p>
            )}

            {erroPrevia && <p className="config-feedback error">{erroPrevia}</p>}

            <div className="estoque-modal-acoes">
              <button
                type="button"
                className="modal-btn-cancelar"
                onClick={() => setPrevia(null)}
                disabled={importando}
              >
                Cancelar
              </button>
              <button type="button" className="modal-submit" onClick={confirmarImportacao} disabled={importando}>
                {importando ? 'Importando...' : 'Importar nota'}
              </button>
            </div>
          </div>
        </div>
      )}

      {recebidas && (
        <div className="modal-overlay" onClick={() => !recebidas.baixando && setRecebidas(null)}>
          <div className="modal-content notas-entrada-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Notas emitidas para a loja</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !recebidas.baixando && setRecebidas(null)}
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
            <p className="modal-field-hint">
              Notas que a SEFAZ registrou no CNPJ da loja. O XML de uma nota nova é liberado em até 2 horas depois da
              primeira busca.
            </p>
            {recebidas.erro && <p className="config-feedback error">{recebidas.erro}</p>}
            <div className="notas-entrada-itens">
              <table className="pdv-products-table">
                <thead>
                  <tr>
                    <th>Emissão</th>
                    <th>Emitente</th>
                    <th>Valor</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {recebidas.carregando ? (
                    <tr>
                      <td colSpan={5}>Buscando na SEFAZ...</td>
                    </tr>
                  ) : recebidas.lista.length === 0 ? (
                    <tr>
                      <td colSpan={5}>Nenhuma nota encontrada.</td>
                    </tr>
                  ) : (
                    recebidas.lista.map((nota) => {
                      const cancelada = nota.situacao && nota.situacao !== 'autorizada'
                      let situacao = 'Pronta para importar'
                      if (nota.importada) situacao = 'Já importada'
                      else if (cancelada) situacao = nota.situacao === 'cancelada' ? 'Cancelada' : 'Denegada'
                      else if (!nota.xml_disponivel) situacao = 'Aguardando liberação do XML'
                      return (
                        <tr key={nota.chave}>
                          <td>{formatarData(nota.data_emissao)}</td>
                          <td>
                            {nota.emitente || '—'}
                            {nota.documento_emitente && (
                              <span className="notas-entrada-cfop">{formatarCpfCnpj(nota.documento_emitente)}</span>
                            )}
                          </td>
                          <td>{formatarMoeda(nota.valor_total)}</td>
                          <td>{situacao}</td>
                          <td>
                            {!nota.importada && !cancelada && (
                              <div className="caixa-acoes-cell">
                                <BotaoAcao
                                  icone="nota"
                                  onClick={() => importarRecebida(nota)}
                                  disabled={Boolean(recebidas.baixando)}
                                >
                                  {recebidas.baixando === nota.chave ? 'Baixando...' : 'Importar'}
                                </BotaoAcao>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {notaDetalhe && (
        <div className="modal-overlay" onClick={() => setNotaDetalhe(null)}>
          <div className="modal-content notas-entrada-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nota nº {notaDetalhe.numero}</h3>
              <button type="button" className="modal-close" onClick={() => setNotaDetalhe(null)} aria-label="Fechar">
                ×
              </button>
            </div>
            <p className="modal-field-hint notas-entrada-chave">Chave {notaDetalhe.chave}</p>
            <div className="notas-entrada-itens">
              <table className="pdv-products-table">
                <thead>
                  <tr>
                    <th>Item da nota</th>
                    <th>NCM</th>
                    <th>Qtd</th>
                    <th>Custo</th>
                    <th>Produto</th>
                  </tr>
                </thead>
                <tbody>
                  {itensDetalhe.map((item) => (
                    <tr key={item.id}>
                      <td>{item.descricao}</td>
                      <td>{item.ncm ? formatarNcm(item.ncm) : '—'}</td>
                      <td>
                        {formatarQuantidade(item.quantidade)} {item.unidade}
                      </td>
                      <td>{formatarMoeda(item.valor_unitario)}</td>
                      <td>
                        {item.produto_nome
                          ? `${item.produto_nome}${item.produto_variacao ? ` (${item.produto_variacao})` : ''}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {devolucoesDetalhe.length > 0 && (
              <div className="notas-entrada-devolucoes">
                <h4>Devoluções ao artesão</h4>
                {devolucoesDetalhe.map((dev) => (
                  <div key={dev.id} className="notas-entrada-devolucao">
                    <div>
                      <strong>
                        {formatarData(dev.data)} · {formatarMoeda(dev.valor_total)}
                      </strong>
                      <small>
                        {dev.itens
                          .map((i) => `${i.quantidade}× ${i.produto_nome || i.descricao}`)
                          .join(', ')}
                      </small>
                      <small>
                        {dev.status === 'nf_emitida' && dev.nota_fiscal
                          ? `NF-e de devolução nº ${dev.nota_fiscal.numero} autorizada`
                          : dev.nota_fiscal?.status === 'processando_autorizacao'
                            ? 'NF-e de devolução em processamento'
                            : dev.nota_fiscal?.mensagem
                              ? `NF-e não autorizada: ${dev.nota_fiscal.mensagem}`
                              : 'NF-e de devolução (5918) pendente'}
                      </small>
                    </div>
                    <div className="caixa-acoes-cell">
                      {dev.status === 'aguardando_nf' && (
                        <>
                          <BotaoAcao
                            icone="nota"
                            onClick={() => emitirNotaDevolucao(dev)}
                            disabled={emitindoDevolucaoId === dev.id}
                          >
                            {emitindoDevolucaoId === dev.id ? 'Emitindo...' : 'Emitir NF-e'}
                          </BotaoAcao>
                          <BotaoAcao icone="cancelar" perigo onClick={() => cancelarDevolucao(dev)}>
                            Cancelar
                          </BotaoAcao>
                        </>
                      )}
                      {dev.status === 'nf_emitida' && dev.nota_fiscal?.status === 'autorizado' && (
                        <BotaoAcao icone="imprimir" onClick={() => imprimirNotaDevolucao(dev)}>
                          Ver DANFE
                        </BotaoAcao>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {devolucao && (
        <div className="modal-overlay" onClick={() => !salvandoDevolucao && setDevolucao(null)}>
          <div className="modal-content notas-entrada-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Devolver peças da nota nº {devolucao.nota.numero}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !salvandoDevolucao && setDevolucao(null)}
                aria-label="Fechar"
                disabled={salvandoDevolucao}
              >
                ×
              </button>
            </div>
            <p className="modal-field-hint">
              As peças saem do estoque agora. A nota fiscal de devolução (CFOP 5918, referenciando esta remessa) fica
              pendente até a emissão de NF-e estar ligada.
            </p>
            <div className="notas-entrada-itens">
              <table className="pdv-products-table">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Recebidas</th>
                    <th>Já devolvidas</th>
                    <th>Em estoque</th>
                    <th>Custo</th>
                    <th>Devolver</th>
                  </tr>
                </thead>
                <tbody>
                  {devolucao.linhas.map((linha, indice) => (
                    <tr key={linha.id}>
                      <td>
                        {linha.produto_nome}
                        {linha.produto_variacao ? ` (${linha.produto_variacao})` : ''}
                      </td>
                      <td>{linha.recebidas}</td>
                      <td>{linha.quantidade_devolvida || 0}</td>
                      <td>{linha.produto_estoque}</td>
                      <td>{formatarMoeda(linha.valor_unitario)}</td>
                      <td>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="notas-entrada-qtd"
                          value={linha.quantidade}
                          onChange={(e) => atualizarQuantidadeDevolucao(indice, e.target.value)}
                          placeholder={linha.maximo > 0 ? `até ${linha.maximo}` : '—'}
                          disabled={linha.maximo === 0}
                          aria-label={`Quantidade a devolver de ${linha.produto_nome}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-field">
              <label htmlFor="obsDevolucao">Observação</label>
              <input
                id="obsDevolucao"
                type="text"
                value={devolucao.observacao}
                onChange={(e) => setDevolucao((prev) => ({ ...prev, observacao: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <p className="modal-field-hint">Valor da devolução: {formatarMoeda(totalDevolucao)}</p>

            {erroDevolucao && <p className="config-feedback error">{erroDevolucao}</p>}

            <div className="estoque-modal-acoes">
              <button type="button" className="modal-btn-cancelar" onClick={devolverTudo} disabled={salvandoDevolucao}>
                Devolver tudo
              </button>
              <button
                type="button"
                className="modal-submit"
                onClick={confirmarDevolucao}
                disabled={salvandoDevolucao}
              >
                {salvandoDevolucao ? 'Salvando...' : 'Registrar devolução'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
