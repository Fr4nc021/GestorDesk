import { useEffect, useMemo, useRef, useState } from 'react'
import { rotuloNomeFantasia } from '../utils/artesao'
import { formatarCpfCnpj } from '../utils/documento'
import { calcularFormacao, formatarMoeda, precoSugerido } from '../utils/formacaoPreco'
import { formatarNcm } from '../utils/fiscal'
import { TIPOS_NOTA_ENTRADA, lerNfeXml } from '../utils/nfeXml'

function formatarData(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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

  const [notaDetalhe, setNotaDetalhe] = useState(null)
  const [itensDetalhe, setItensDetalhe] = useState([])
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
      return { produtos: listaProdutos || [], multiplicador: mult }
    } catch (err) {
      console.error('[Notas de entrada] Erro ao carregar cadastros:', err)
      return { produtos, multiplicador }
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
      const xml = await arquivo.text()
      const nota = lerNfeXml(xml)
      const existente = await window.electronAPI.buscarNotaEntradaPorChave(nota.chave)
      if (existente) {
        setMensagem({ tipo: 'error', texto: `A nota nº ${nota.numero} já foi importada.` })
        return
      }
      const artesao = await window.electronAPI.buscarArtesaoPorDocumento(nota.emitente.cpf_cnpj)
      const cadastros = await carregarCadastros()
      montarPrevia(nota, xml, artesao, cadastros)
    } catch (err) {
      console.error('[Notas de entrada] Erro ao ler XML:', err)
      setMensagem({ tipo: 'error', texto: err?.message || 'Não foi possível ler o XML.' })
    }
  }

  function montarPrevia(nota, xml, artesao, cadastros) {
    const regra = TIPOS_NOTA_ENTRADA[nota.tipo]
    const produtosDoArtesao = artesao ? cadastros.produtos.filter((p) => p.artesao_id === artesao.id) : []
    setPrevia({ nota, xml, artesaoEncontrado: artesao })
    setArtesaoEscolhido(artesao ? String(artesao.id) : 'novo')
    setErroPrevia('')
    setItensPrevia(
      nota.itens.map((item) => {
        const mesmoNome = produtosDoArtesao.find(
          (p) => p.nome.trim().toLowerCase() === item.descricao.trim().toLowerCase(),
        )
        const sugerido = cadastros.multiplicador
          ? precoSugerido(item.valor_unitario, cadastros.multiplicador)
          : null
        let acao = 'ignorar'
        if (regra.movimentaEstoque) acao = mesmoNome ? 'vincular' : 'criar'
        else if (mesmoNome) acao = 'vincular'
        return {
          ...item,
          acao,
          produto_id: mesmoNome ? String(mesmoNome.id) : '',
          nome: item.descricao,
          preco_venda: precoParaInput(sugerido ?? item.valor_unitario),
        }
      }),
    )
  }

  function atualizarItem(indice, campo, valor) {
    setItensPrevia((prev) => prev.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)))
    setErroPrevia('')
  }

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
    try {
      setItensDetalhe(await window.electronAPI.listarItensNotaEntrada(nota.id))
    } catch (err) {
      console.error('[Notas de entrada] Erro ao carregar itens:', err)
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
                  </td>
                  <td>{formatarMoeda(nota.valor_total)}</td>
                  <td>
                    <div className="artesaos-acoes">
                      <button type="button" className="produtos-btn-quiet" onClick={() => abrirDetalhe(nota)}>
                        Ver itens
                      </button>
                      <button type="button" className="produtos-btn-quiet" onClick={() => excluirNota(nota)}>
                        Excluir
                      </button>
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
                <strong>{regraPrevia.label}</strong>
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

            <div className="modal-field">
              <label htmlFor="artesaoNota">Fornecedor</label>
              <select
                id="artesaoNota"
                value={artesaoEscolhido}
                onChange={(e) => setArtesaoEscolhido(e.target.value)}
              >
                {!previa.artesaoEncontrado && (
                  <option value="novo">Cadastrar {previa.nota.emitente.razao_social} como novo fornecedor</option>
                )}
                {artesoes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {rotuloNomeFantasia(a.nome_fantasia, a.razao_social, a.nome)}
                  </option>
                ))}
              </select>
            </div>

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
                    <tr key={item.numero_item || indice}>
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
                            onChange={(e) => atualizarItem(indice, 'produto_id', e.target.value)}
                          >
                            <option value="">Escolha o produto...</option>
                            {produtosParaVincular.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome}
                                {p.variacao ? ` (${p.variacao})` : ''}
                              </option>
                            ))}
                          </select>
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
                NCM da nota.
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
          </div>
        </div>
      )}
    </div>
  )
}
