/**
 * Notas emitidas contra o CNPJ da loja (remessas e acertos dos artesãos), buscadas na SEFAZ pela Focus NFe.
 * Usa sempre o token de produção: a SEFAZ só distribui notas reais. É só leitura, não emite nada.
 * Para a Focus liberar o XML completo, a loja registra a "ciência da operação" (evento não conclusivo);
 * o XML costuma ficar disponível na sincronização seguinte da Focus, que acontece a cada 2 horas.
 */

const { obterConfigFiscal, buscarNotaEntradaPorChave } = require('../database')
const focus = require('./focusNfe')

/** A Receita limita as consultas por hora; não registra ciência em mais notas do que isso de uma vez. */
const LIMITE_CIENCIAS_POR_BUSCA = 15

function configProducao() {
  const config = obterConfigFiscal()
  const cnpj = String(config.cnpj || '').replace(/\D/g, '')
  if (cnpj.length !== 14) throw new Error('Cadastre o CNPJ da loja em Configurações › Fiscal.')
  return { config: { ...config, ambiente: '1' }, cnpj }
}

function xmlCompleto(valor) {
  return valor === true || valor === 1 || valor === '1' || valor === 'true'
}

async function buscarNotasRecebidas() {
  const { config, cnpj } = configProducao()
  const notas = []
  let versao = 0
  for (let pagina = 0; pagina < 50; pagina += 1) {
    const resposta = await focus.listarNfesRecebidas(config, cnpj, versao)
    if (resposta.http < 200 || resposta.http >= 300 || !Array.isArray(resposta.dados)) {
      const mensagem = focus.mensagemDaResposta(resposta)
      throw new Error(
        resposta.http === 400 || resposta.http === 403
          ? `${mensagem} Confira se o "Recebimento de NFes" está ligado no cadastro da empresa na Focus.`
          : mensagem,
      )
    }
    notas.push(...resposta.dados)
    const maior = Math.max(versao, ...resposta.dados.map((n) => Number(n.versao) || 0))
    if (resposta.dados.length < 100 || maior <= versao) break
    versao = maior
  }

  // A mesma nota pode voltar em mais de uma versão (cancelamento, carta de correção): fica a mais recente.
  const porChave = new Map()
  for (const n of notas) {
    const atual = porChave.get(n.chave_nfe)
    if (!atual || (Number(n.versao) || 0) >= (Number(atual.versao) || 0)) porChave.set(n.chave_nfe, n)
  }

  let ciencias = 0
  const lista = []
  for (const n of porChave.values()) {
    const chave = String(n.chave_nfe || '').replace(/\D/g, '')
    const importada = Boolean(buscarNotaEntradaPorChave(chave))
    let manifestacao = n.manifestacao_destinatario || null
    if (!importada && n.situacao === 'autorizada' && !manifestacao && ciencias < LIMITE_CIENCIAS_POR_BUSCA) {
      try {
        const r = await focus.manifestarCiencia(config, chave)
        if (r.http >= 200 && r.http < 300) manifestacao = 'ciencia'
      } catch (err) {
        console.warn('[Notas recebidas] Não foi possível registrar ciência:', err?.message || err)
      }
      ciencias += 1
    }
    lista.push({
      chave,
      emitente: n.nome_emitente || '',
      documento_emitente: n.documento_emitente || '',
      valor_total: Number(n.valor_total) || 0,
      data_emissao: n.data_emissao || '',
      situacao: n.situacao || '',
      manifestacao,
      xml_disponivel: xmlCompleto(n.nfe_completa),
      importada,
    })
  }
  lista.sort((a, b) => String(b.data_emissao).localeCompare(String(a.data_emissao)))
  return lista
}

/** XML autorizado de uma nota recebida, para importar em Notas de entrada. */
async function baixarXmlNotaRecebida(chave) {
  const { config } = configProducao()
  const digitos = String(chave || '').replace(/\D/g, '')
  const xml = await focus.baixarArquivo(config, `/v2/nfes_recebidas/${digitos}.xml`)
  if (!xml || !/<nfeProc|<NFe/.test(xml)) {
    throw new Error('O XML desta nota ainda não foi liberado pela SEFAZ. A Focus atualiza a cada 2 horas; tente mais tarde.')
  }
  return xml
}

module.exports = { buscarNotasRecebidas, baixarXmlNotaRecebida }
