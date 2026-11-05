/**
 * DANFE (representação simplificada da NF-e em A4) montado no próprio sistema a partir do XML.
 * Serve para as notas de entrada que não estão na Focus (XML importado de arquivo).
 * O HTML lê o XML com DOMParser dentro de uma janela oculta, que depois vira PDF (printToPDF).
 */

const fs = require('fs')

let jsbarcodeFonte = null
function fonteJsBarcode() {
  if (jsbarcodeFonte === null) {
    try {
      jsbarcodeFonte = fs.readFileSync(require.resolve('jsbarcode/dist/JsBarcode.all.min.js'), 'utf8')
    } catch {
      jsbarcodeFonte = ''
    }
  }
  return jsbarcodeFonte
}

/** Texto seguro para embutir dentro de <script>. */
function paraScript(valor) {
  return JSON.stringify(valor).replace(/</g, '\\u003c')
}

function htmlDanfe(xml) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE</title>
<style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; margin: 0; }
  .bloco { border: 1px solid #000; margin-bottom: 3px; }
  .titulo { font-size: 7pt; font-weight: bold; margin: 4px 0 1px; text-transform: uppercase; }
  .linha { display: flex; }
  .campo { border: 1px solid #000; margin: -1px 0 0 -1px; padding: 1px 3px; flex: 1; min-height: 22px; }
  .campo .r { font-size: 5.5pt; text-transform: uppercase; }
  .campo .v { font-size: 8pt; font-weight: bold; word-break: break-word; }
  .cab { display: flex; border: 1px solid #000; }
  .cab > div { padding: 4px; }
  .emit { flex: 1.4; border-right: 1px solid #000; }
  .emit .nome { font-size: 11pt; font-weight: bold; margin-bottom: 3px; }
  .danfe { width: 120px; text-align: center; border-right: 1px solid #000; }
  .danfe b { font-size: 13pt; }
  .cod { flex: 1.6; text-align: center; }
  .cod svg { max-width: 100%; height: 45px; }
  .chave { font-size: 8pt; font-weight: bold; letter-spacing: .5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #000; padding: 1px 2px; font-size: 6.5pt; vertical-align: top; }
  th { font-size: 5.5pt; text-transform: uppercase; }
  td.n { text-align: right; white-space: nowrap; }
  .aviso { text-align: center; font-size: 7pt; margin: 3px 0; }
  .infcpl { min-height: 50px; white-space: pre-wrap; font-size: 7pt; padding: 3px; }
</style></head>
<body><div id="raiz">Gerando DANFE...</div>
<script>${fonteJsBarcode()}</script>
<script>
(function () {
  const doc = new DOMParser().parseFromString(${paraScript(xml)}, 'application/xml')
  const um = (el, caminho) => {
    let atual = el
    for (const nome of caminho.split('/')) {
      if (!atual) return null
      atual = [...atual.children].find((c) => c.localName === nome) || null
    }
    return atual
  }
  const tx = (el, caminho) => (um(el, caminho)?.textContent || '').trim()
  const todos = (el, nome) => (el ? [...el.getElementsByTagNameNS('*', nome)] : [])
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  const num = (v, casas = 2) => (v === '' || v == null ? '' :
    Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }))
  const doc14 = (d) => {
    d = String(d || '').replace(/\\D/g, '')
    if (d.length === 14) return d.replace(/(\\d{2})(\\d{3})(\\d{3})(\\d{4})(\\d{2})/, '$1.$2.$3/$4-$5')
    if (d.length === 11) return d.replace(/(\\d{3})(\\d{3})(\\d{3})(\\d{2})/, '$1.$2.$3-$4')
    return d
  }
  const data = (v) => {
    if (!v) return ''
    const [d, h] = v.split('T')
    const [a, m, dia] = d.split('-')
    return dia + '/' + m + '/' + a + (h ? ' ' + h.slice(0, 8) : '')
  }
  const campo = (rotulo, valor, flex = 1) =>
    '<div class="campo" style="flex:' + flex + '"><div class="r">' + esc(rotulo) + '</div><div class="v">' + esc(valor) + '</div></div>'
  const endereco = (e) => e ? [tx(e, 'xLgr'), tx(e, 'nro'), tx(e, 'xCpl')].filter(Boolean).join(', ') : ''

  const inf = todos(doc, 'infNFe')[0]
  if (!inf) { document.getElementById('raiz').textContent = 'XML inválido: não é uma NF-e.'; return }
  const ide = um(inf, 'ide'), emit = um(inf, 'emit'), dest = um(inf, 'dest')
  const tot = um(inf, 'total/ICMSTot'), transp = um(inf, 'transp')
  const prot = todos(doc, 'infProt')[0]
  const chave = (inf.getAttribute('Id') || '').replace(/\\D/g, '')
  const chaveFmt = chave.replace(/(\\d{4})(?=\\d)/g, '$1 ')
  const ee = um(emit, 'enderEmit'), ed = um(dest, 'enderDest')

  let h = ''
  h += '<div class="cab">'
  h += '<div class="emit"><div class="nome">' + esc(tx(emit, 'xNome')) + '</div>'
  h += esc(endereco(ee)) + '<br>' + esc(tx(ee, 'xBairro')) + ' - ' + esc(tx(ee, 'xMun')) + '/' + esc(tx(ee, 'UF'))
  h += ' - CEP ' + esc(tx(ee, 'CEP')) + (tx(ee, 'fone') ? '<br>Fone: ' + esc(tx(ee, 'fone')) : '') + '</div>'
  h += '<div class="danfe"><b>DANFE</b><br>Documento Auxiliar da Nota Fiscal Eletrônica<br><br>'
  h += (tx(ide, 'tpNF') === '0' ? '0 - Entrada' : '1 - Saída') + '<br><br><b>Nº ' + esc(tx(ide, 'nNF')) + '</b><br>Série ' + esc(tx(ide, 'serie')) + '</div>'
  h += '<div class="cod"><svg id="barras"></svg><div class="r">CHAVE DE ACESSO</div><div class="chave">' + esc(chaveFmt) + '</div>'
  h += '<div style="margin-top:4px">Consulta de autenticidade no portal nacional da NF-e<br>www.nfe.fazenda.gov.br/portal</div></div>'
  h += '</div>'

  h += '<div class="linha">' + campo('Natureza da operação', tx(ide, 'natOp'), 2)
  h += campo('Protocolo de autorização de uso', prot ? tx(prot, 'nProt') + ' - ' + data(tx(prot, 'dhRecbto')) : 'SEM PROTOCOLO DE AUTORIZAÇÃO', 1.5) + '</div>'
  h += '<div class="linha">' + campo('Inscrição estadual', tx(emit, 'IE')) + campo('Inscrição municipal', tx(emit, 'IM'))
  h += campo('CNPJ / CPF', doc14(tx(emit, 'CNPJ') || tx(emit, 'CPF'))) + '</div>'

  h += '<div class="titulo">Destinatário / Remetente</div>'
  h += '<div class="linha">' + campo('Nome / Razão social', tx(dest, 'xNome'), 3) + campo('CNPJ / CPF', doc14(tx(dest, 'CNPJ') || tx(dest, 'CPF')), 1.3)
  h += campo('Data da emissão', data(tx(ide, 'dhEmi') || tx(ide, 'dEmi')).slice(0, 10)) + '</div>'
  h += '<div class="linha">' + campo('Endereço', endereco(ed), 3) + campo('Bairro', tx(ed, 'xBairro'), 1.3) + campo('CEP', tx(ed, 'CEP'))
  h += campo('Data saída/entrada', data(tx(ide, 'dhSaiEnt') || tx(ide, 'dSaiEnt')).slice(0, 10)) + '</div>'
  h += '<div class="linha">' + campo('Município', tx(ed, 'xMun'), 2) + campo('UF', tx(ed, 'UF'), .4) + campo('Fone', tx(ed, 'fone'))
  h += campo('Inscrição estadual', tx(dest, 'IE')) + '</div>'

  h += '<div class="titulo">Cálculo do imposto</div>'
  h += '<div class="linha">' + campo('Base cálc. ICMS', num(tx(tot, 'vBC'))) + campo('Valor do ICMS', num(tx(tot, 'vICMS')))
  h += campo('Base cálc. ICMS ST', num(tx(tot, 'vBCST'))) + campo('Valor ICMS ST', num(tx(tot, 'vST')))
  h += campo('Valor total dos produtos', num(tx(tot, 'vProd'))) + '</div>'
  h += '<div class="linha">' + campo('Valor do frete', num(tx(tot, 'vFrete'))) + campo('Valor do seguro', num(tx(tot, 'vSeg')))
  h += campo('Desconto', num(tx(tot, 'vDesc'))) + campo('Outras despesas', num(tx(tot, 'vOutro')))
  h += campo('Valor do IPI', num(tx(tot, 'vIPI'))) + campo('Valor total da nota', num(tx(tot, 'vNF'))) + '</div>'

  const modFrete = { '0': '0-Emitente', '1': '1-Destinatário', '2': '2-Terceiros', '3': '3-Próprio rem.', '4': '4-Próprio dest.', '9': '9-Sem frete' }
  const transporta = um(transp, 'transporta'), vol = um(transp, 'vol')
  h += '<div class="titulo">Transportador / Volumes transportados</div>'
  h += '<div class="linha">' + campo('Razão social', tx(transporta, 'xNome'), 2.5) + campo('Frete por conta', modFrete[tx(transp, 'modFrete')] || tx(transp, 'modFrete'))
  h += campo('CNPJ / CPF', doc14(tx(transporta, 'CNPJ') || tx(transporta, 'CPF'))) + '</div>'
  h += '<div class="linha">' + campo('Quantidade', tx(vol, 'qVol')) + campo('Espécie', tx(vol, 'esp')) + campo('Peso bruto', num(tx(vol, 'pesoB'), 3))
  h += campo('Peso líquido', num(tx(vol, 'pesoL'), 3)) + '</div>'

  h += '<div class="titulo">Dados dos produtos / serviços</div><table><thead><tr>'
  h += '<th>Código</th><th>Descrição</th><th>NCM</th><th>CST/CSOSN</th><th>CFOP</th><th>Un</th><th>Qtd</th><th>V. unit.</th><th>V. total</th><th>BC ICMS</th><th>V. ICMS</th><th>V. IPI</th><th>% ICMS</th>'
  h += '</tr></thead><tbody>'
  for (const det of todos(inf, 'det')) {
    const p = um(det, 'prod'), imp = um(det, 'imposto')
    const icms = um(imp, 'ICMS')?.firstElementChild
    const cst = icms ? (tx(icms, 'orig') + (tx(icms, 'CST') || tx(icms, 'CSOSN'))) : ''
    const ipi = um(imp, 'IPI/IPITrib')
    h += '<tr><td>' + esc(tx(p, 'cProd')) + '</td><td>' + esc(tx(p, 'xProd')) + (tx(det, 'infAdProd') ? '<br><i>' + esc(tx(det, 'infAdProd')) + '</i>' : '') + '</td>'
    h += '<td>' + esc(tx(p, 'NCM')) + '</td><td>' + esc(cst) + '</td><td>' + esc(tx(p, 'CFOP')) + '</td><td>' + esc(tx(p, 'uCom')) + '</td>'
    h += '<td class="n">' + num(tx(p, 'qCom'), 4) + '</td><td class="n">' + num(tx(p, 'vUnCom'), 4) + '</td><td class="n">' + num(tx(p, 'vProd')) + '</td>'
    h += '<td class="n">' + num(tx(icms, 'vBC')) + '</td><td class="n">' + num(tx(icms, 'vICMS')) + '</td><td class="n">' + num(tx(ipi, 'vIPI')) + '</td>'
    h += '<td class="n">' + num(tx(icms, 'pICMS')) + '</td></tr>'
  }
  h += '</tbody></table>'

  const infAdic = um(inf, 'infAdic')
  h += '<div class="titulo">Dados adicionais</div><div class="bloco infcpl">' + esc([tx(infAdic, 'infCpl'), tx(infAdic, 'infAdFisco')].filter(Boolean).join('\\n')) + '</div>'
  h += '<div class="aviso">DANFE gerado pelo GestorDesk a partir do XML da nota.' + (tx(ide, 'tpAmb') === '2' ? ' <b>EMITIDA EM HOMOLOGAÇÃO - SEM VALOR FISCAL</b>' : '') + '</div>'

  document.getElementById('raiz').innerHTML = h
  try {
    if (window.JsBarcode && chave.length === 44) {
      JsBarcode('#barras', chave, { format: 'CODE128C', displayValue: false, height: 45, width: 1, margin: 0 })
    }
  } catch (_) {}
  document.title = 'DANFE pronto'
})()
</script></body></html>`
}

module.exports = { htmlDanfe }
