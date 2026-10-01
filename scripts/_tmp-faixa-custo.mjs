import fs from 'fs'
const src = fs.readFileSync(new URL('../src/pages/Relatorios.jsx', import.meta.url), 'utf8')
const start = src.indexOf('function interpretarLimitePreco')
const end = src.indexOf('function hojeISO')
if (start < 0 || end < 0) {
  console.error('funcoes nao encontradas', start, end)
  process.exit(1)
}
const fn = new Function(src.slice(start, end) + '\nreturn { interpretarFaixaPrecoCusto, precoCustoNaFaixa }')
const { interpretarFaixaPrecoCusto, precoCustoNaFaixa } = fn()
const produtos = [
  { preco_custo: 10.5 },
  { preco_custo: 20 },
  { preco_custo: 30 },
]
function filtrar(min, max) {
  const faixa = interpretarFaixaPrecoCusto(min, max)
  if (faixa.status !== 'ok' && faixa.status !== 'vazio') return faixa.status
  const lista = faixa.status === 'vazio'
    ? produtos
    : produtos.filter(p => precoCustoNaFaixa(p.preco_custo, faixa.minimo, faixa.maximo))
  return lista.map(p => p.preco_custo).join(',')
}
const checks = [
  ['', '', '10.5,20,30'],
  ['10', '20', '10.5,20'],
  ['15', '', '20,30'],
  ['', '15', '10.5'],
  ['10,50', '10,50', '10.5'],
  ['30', '10', 'invertida'],
  ['abc', '20', 'invalido'],
  ['R$ 10,00', 'R$ 20,00', '10.5,20'],
]
let failed = 0
for (const [min, max, expected] of checks) {
  const got = filtrar(min, max)
  if (got !== expected) {
    failed++
    console.log('FAIL', JSON.stringify({ min, max, expected, got }))
  }
}
console.log(failed ? `FAILED ${failed}` : 'faixa ok')
if (failed) process.exit(1)
