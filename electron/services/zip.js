/**
 * Gerador mínimo de arquivo .zip (deflate), sem dependência externa. Suficiente para os XMLs do mês.
 */

const zlib = require('zlib')

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) c = TABELA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Data/hora no formato DOS que o zip usa. */
function dataDos(d = new Date()) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const data = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { hora, data }
}

/**
 * @param {Array<{ nome: string, conteudo: string|Buffer }>} arquivos - nome pode ter pastas ("cupons/x.xml")
 * @returns {Buffer}
 */
function criarZip(arquivos) {
  const locais = []
  const centrais = []
  let deslocamento = 0
  const { hora, data } = dataDos()
  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.nome, 'utf8')
    const bruto = Buffer.isBuffer(arquivo.conteudo) ? arquivo.conteudo : Buffer.from(String(arquivo.conteudo), 'utf8')
    const comprimido = zlib.deflateRawSync(bruto)
    const crc = crc32(bruto)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6) // nomes em UTF-8
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(hora, 10)
    local.writeUInt16LE(data, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(bruto.length, 22)
    local.writeUInt16LE(nome.length, 26)
    local.writeUInt16LE(0, 28)
    locais.push(local, nome, comprimido)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(hora, 12)
    central.writeUInt16LE(data, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(comprimido.length, 20)
    central.writeUInt32LE(bruto.length, 24)
    central.writeUInt16LE(nome.length, 28)
    central.writeUInt32LE(deslocamento, 42)
    centrais.push(central, nome)

    deslocamento += local.length + nome.length + comprimido.length
  }
  const tamanhoCentral = centrais.reduce((s, b) => s + b.length, 0)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(arquivos.length, 8)
  fim.writeUInt16LE(arquivos.length, 10)
  fim.writeUInt32LE(tamanhoCentral, 12)
  fim.writeUInt32LE(deslocamento, 16)
  return Buffer.concat([...locais, ...centrais, fim])
}

module.exports = { criarZip }
