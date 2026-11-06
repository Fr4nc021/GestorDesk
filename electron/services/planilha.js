/**
 * Gerador mínimo de planilha .xlsx (uma aba), sem dependência externa. Abre no Excel, LibreOffice e Google Sheets.
 */

const { criarZip } = require('./zip')

// Índices de cellXfs em styles.xml.
const ESTILO = { texto: 0, cabecalho: 1, moeda: 2, dataHora: 3, moedaNegrito: 4, negrito: 5, inteiro: 6 }

function escaparXml(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
}

function letraColuna(indice) {
  let n = indice + 1
  let letra = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    letra = String.fromCharCode(65 + resto) + letra
    n = Math.floor((n - 1) / 26)
  }
  return letra
}

/** "AAAA-MM-DD HH:MM:SS" (hora local) para o número de série de data do Excel. */
function serieData(texto) {
  const m = String(texto || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/)
  if (!m) return null
  const [, a, mes, d, h = 0, min = 0, s = 0] = m.map((v) => (v === undefined ? undefined : Number(v)))
  return (Date.UTC(a, mes - 1, d, h, min, s) - Date.UTC(1899, 11, 30)) / 86400000
}

/**
 * Uma célula: string, número, null, ou { valor, tipo: 'moeda'|'data'|'inteiro'|'texto', negrito, formula }.
 */
function celula(ref, conteudo, tipoColuna) {
  const c = conteudo !== null && typeof conteudo === 'object' ? conteudo : { valor: conteudo }
  const tipo = c.tipo || tipoColuna || 'texto'
  if (c.formula) {
    const estilo = tipo === 'moeda' ? (c.negrito ? ESTILO.moedaNegrito : ESTILO.moeda) : ESTILO.negrito
    const cache = typeof c.valor === 'number' ? `<v>${c.valor}</v>` : ''
    return `<c r="${ref}" s="${estilo}"><f>${escaparXml(c.formula)}</f>${cache}</c>`
  }
  if (c.valor === null || c.valor === undefined || c.valor === '') return ''
  if (tipo === 'data') {
    const serie = serieData(c.valor)
    if (serie !== null) return `<c r="${ref}" s="${ESTILO.dataHora}"><v>${serie}</v></c>`
  }
  if ((tipo === 'moeda' || tipo === 'inteiro') && Number.isFinite(Number(c.valor))) {
    const estilo = tipo === 'inteiro' ? ESTILO.inteiro : c.negrito ? ESTILO.moedaNegrito : ESTILO.moeda
    return `<c r="${ref}" s="${estilo}"><v>${Number(c.valor)}</v></c>`
  }
  const estilo = c.negrito ? ESTILO.negrito : ESTILO.texto
  return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(c.valor)}</t></is></c>`
}

/**
 * @param {{ nomeAba: string, colunas: Array<{ titulo: string, largura?: number, tipo?: string }>,
 *           linhas: Array<Array<any>>, rodape?: Array<Array<any>> }} dados
 *   A primeira linha é o cabeçalho; o rodapé (totais) vem depois de uma linha em branco, fora do filtro.
 * @returns {Buffer}
 */
function criarXlsx({ nomeAba, colunas, linhas, rodape = [] }) {
  const cabecalho = colunas
    .map((col, i) => `<c r="${letraColuna(i)}1" s="${ESTILO.cabecalho}" t="inlineStr"><is><t>${escaparXml(col.titulo)}</t></is></c>`)
    .join('')
  const inicioRodape = linhas.length + 3
  const corpo = [...linhas.map((linha, l) => [l + 2, linha]), ...rodape.map((linha, l) => [inicioRodape + l, linha])]
    .map(([n, linha]) => {
      const celulas = linha.map((v, i) => celula(`${letraColuna(i)}${n}`, v, colunas[i]?.tipo)).join('')
      return `<row r="${n}">${celulas}</row>`
    })
    .join('')
  const larguras = colunas
    .map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${col.largura || 14}" customWidth="1"/>`)
    .join('')
  const ultima = `${letraColuna(colunas.length - 1)}${Math.max(linhas.length + 1, 1)}`

  const planilha = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${larguras}</cols>
<sheetData><row r="1">${cabecalho}</row>${corpo}</sheetData>
<autoFilter ref="A1:${ultima}"/>
</worksheet>`

  const estilos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/>
<numFmt numFmtId="165" formatCode="dd/mm/yyyy\\ hh:mm"/>
</numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF0F0F0"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFBDBDBD"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

  const nome = escaparXml(String(nomeAba || 'Planilha').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
  return criarZip([
    {
      nome: '[Content_Types].xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    },
    {
      nome: '_rels/.rels',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      nome: 'xl/workbook.xml',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${nome}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nome.replace(/'/g, "''")}'!$A$1:$${ultima.replace(/(\d+)$/, '$$$1')}</definedName></definedNames>
</workbook>`,
    },
    {
      nome: 'xl/_rels/workbook.xml.rels',
      conteudo: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { nome: 'xl/worksheets/sheet1.xml', conteudo: planilha },
    { nome: 'xl/styles.xml', conteudo: estilos },
  ])
}

module.exports = { criarXlsx }
